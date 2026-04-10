import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { buildSystemPrompt, validateArticle, buildLiveContext, fixEncoding, TODAY } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WORD_TARGETS = {
  breaking: '150-200', race_recap: '450-500', qualifying_recap: '350-400', practice_analysis: '300-350',
  preview: '400-450', strategy_analysis: '350-400', championship_update: '250-300', morning_briefing: '300-350', analysis: '400-500',
};

const WEB_SEARCH_INSTRUCTION = `YOU HAVE WEB SEARCH. USE IT.
Before writing any article, search for the specific facts you need. Do not guess. Do not invent. Search first.
ALWAYS search for: current F1 2026 championship standings, specific race results, breaking news related to the topic.
After searching, write using ONLY facts from search results and the context provided below.
If search returns no data for a specific claim, omit that claim.`;

function parseAIResponse(data) {
  const content = data.content || [];
  const textBlocks = content.filter(b => b.type === 'text');
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText) throw new Error('No text response from AI');
  const text = lastText.text.trim();
  const clean = text.replace(/```json\s?|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*"title"[\s\S]*"body"[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  const anyJson = clean.match(/\{[\s\S]*\}/);
  if (anyJson) return JSON.parse(anyJson[0]);
  throw new Error('No valid JSON in response');
}

function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '-' + Date.now().toString(36);
}

export default async (req, context) => {
  const start = Date.now();
  let generated = 0;
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // Fetch ALL pending topics (no limit)
    let topics = await sb('content_topics?status=eq.pending&order=priority.desc&limit=20');

    if (!topics.length) {
      const hour = new Date().getUTCHours();
      if (hour < 8) topics = [{ topic: 'Morning Briefing', content_type: 'morning_briefing', priority: 5 }];
      else {
        await logSync('generate-content', 'success', 0, 'No pending topics', Date.now() - start);
        return json({ ok: true, generated: 0 });
      }
    }

    // Build shared context once
    const picks = await sb('betting_picks?status=eq.active&order=created_at.desc&limit=10');
    let picksContext = picks.length ? 'CURRENT PICKS:\n' + picks.map(p => `${p.pick_type}: ${p.driver_name} ${p.odds} — ${p.analysis || ''}`).join('\n') : '';
    const liveContext = await buildLiveContext();
    const board = await sb('leaderboard?order=fetched_at.desc,position.asc&limit=10');
    const boardText = board.length ? 'LATEST SESSION:\n' + board.map(r => `P${r.position}: ${r.driver_name} (${r.team_name})`).join('\n') : '';
    const contextBlock = [liveContext, boardText].filter(Boolean).join('\n\n');
    const fullContext = [picksContext, contextBlock].filter(Boolean).join('\n\n');

    // Process each topic
    for (const topic of topics) {
      const contentType = topic.content_type || 'analysis';
      const topicText = topic.topic || 'F1 2026 Season Analysis';
      const wordTarget = WORD_TARGETS[contentType] || '400-500';

      try {
        const systemPrompt = buildSystemPrompt(
          WEB_SEARCH_INSTRUCTION,
          `OUTPUT: Return ONLY valid JSON with no markdown fences:\n{"title":"...","excerpt":"first 150 chars","body":"full article","tags":["RACE"],"content_type":"${contentType}"}`
        );

        const userPrompt = `Topic: ${topicText}\nContent type: ${contentType}\nToday: ${TODAY}\n\nSearch for relevant data then write the article.\n\n${fullContext}\n\nTarget: ${wordTarget} words. JSON only.`;

        const response = await fetchWT('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 2048,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: systemPrompt, messages: [{ role: 'user', content: userPrompt }],
          }),
        }, 50000);

        const rJson = await response.json();
        let parsed;
        try { parsed = parseAIResponse(rJson); } catch {
          const anyText = (rJson.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
          parsed = { title: topicText, body: anyText || '', excerpt: (anyText || '').slice(0, 150), tags: ['ANALYSIS'], content_type: contentType };
        }

        parsed.title = fixEncoding(parsed.title);
        parsed.body = fixEncoding(parsed.body);
        parsed.excerpt = fixEncoding(parsed.excerpt);

        const validation = validateArticle(parsed);
        if (!validation.valid) { console.warn('[GF] Validation failed:', validation.reason); continue; }

        const h = hashContent(parsed.body || '');
        const existing = await sb(`content_hashes?hash=eq.${h}&limit=1`);
        if (existing.length) continue;

        // Insert draft as APPROVED (auto-publish)
        await sb('content_drafts', 'POST', {
          title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
          tags: parsed.tags || ['ANALYSIS'], content_type: parsed.content_type || contentType,
          review_status: 'approved', source_context: { topic: topicText, web_search: true },
          priority_score: topic.priority || 5, generation_model: 'GridFeed Pipeline',
          race_id: topic.race_id || null,
        });

        await sb('content_hashes', 'POST', { hash: h, type: contentType, source: 'generate-content' });
        if (topic.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });

        // Notify
        fetchWT('/.netlify/functions/notify-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: parsed.title, content_type: contentType, priority_score: topic.priority || 5, excerpt: (parsed.excerpt || '').slice(0, 200) }) }, 5000).catch(() => {});

        generated++;
      } catch (e) { console.warn('[GF] Topic error:', e.message); }
    }

    await logSync('generate-content', 'success', generated, `Generated ${generated} drafts from ${topics.length} topics`, Date.now() - start);
    return json({ ok: true, generated, topics: topics.length });
  } catch (err) {
    await logSync('generate-content', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/10 * * * *' };
