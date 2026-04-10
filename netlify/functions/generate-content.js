import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { buildSystemPrompt, validateArticle, buildLiveContext, fixEncoding, TODAY } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WORD_TARGETS = {
  breaking: '150-200', race_recap: '450-500', qualifying_recap: '350-400', practice_analysis: '300-350',
  preview: '400-450', strategy_analysis: '350-400', championship_update: '250-300', morning_briefing: '300-350', analysis: '400-500',
};

const WEB_SEARCH_INSTRUCTION = `YOU HAVE WEB SEARCH. USE IT.

Before writing any article, search for the specific facts you need. Do not guess. Do not invent. Search first.

ALWAYS search for:
- Current F1 2026 championship standings before any standings reference
- Specific race results before referencing any race position or points
- Any breaking news or driver/team updates mentioned in the topic
- Circuit-specific data before a circuit guide or preview
- Any specific lap times, gaps, or qualifying results

SEARCH QUERIES TO USE:
- "2026 F1 championship standings" for current points
- "2026 [race name] Grand Prix results" for race data
- "[driver name] F1 2026" for driver-specific news
- "FIA F1 2026 [topic]" for regulation news

After searching, write using ONLY facts from search results and the context provided below.
If search returns no data for a specific claim, omit that claim.
Never fill gaps with invented data — omit instead.`;

function parseAIResponse(data) {
  const content = data.content || [];
  // Find the final text block (after any tool_use/search blocks)
  const textBlocks = content.filter(b => b.type === 'text');
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText) throw new Error('No text response from AI');

  const text = lastText.text.trim();
  const clean = text.replace(/```json\s?|```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*"title"[\s\S]*"body"[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);

  // Fallback: try any JSON object
  const anyJson = clean.match(/\{[\s\S]*\}/);
  if (anyJson) return JSON.parse(anyJson[0]);

  throw new Error('No valid JSON in response');
}

export default async (req, context) => {
  const start = Date.now();
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // 1. Get highest priority pending topic
    let topics = await sb('content_topics?status=eq.pending&order=priority.desc&limit=1');
    let topic = topics[0];
    let contentType = topic?.content_type || 'analysis';
    let topicText = topic?.topic || 'F1 2026 Season Analysis';

    if (!topic) {
      const hour = new Date().getUTCHours();
      if (hour < 8) { contentType = 'morning_briefing'; topicText = 'Morning Briefing'; }
      else {
        await logSync('generate-content', 'success', 0, 'No pending topics', Date.now() - start);
        return json({ ok: true, generated: 0 });
      }
    }

    // 2. Build context — picksContext FIRST (never change this order)
    const picks = await sb('betting_picks?status=eq.active&order=created_at.desc&limit=10');
    let picksContext = '';
    if (picks.length) {
      picksContext = 'CURRENT PICKS:\n' + picks.map(p => `${p.pick_type}: ${p.driver_name} ${p.odds} — ${p.analysis || ''}`).join('\n');
    }

    const liveContext = await buildLiveContext();
    const board = await sb('leaderboard?order=fetched_at.desc,position.asc&limit=10');
    const boardText = board.length ? 'LATEST SESSION:\n' + board.map(r => `P${r.position}: ${r.driver_name} (${r.team_name})`).join('\n') : '';

    const contextBlock = [liveContext, boardText].filter(Boolean).join('\n\n');
    const fullContext = [picksContext, contextBlock].filter(Boolean).join('\n\n');

    // 3. Build prompt with web search instruction + accuracy guards
    const wordTarget = WORD_TARGETS[contentType] || '400-500';
    const systemPrompt = buildSystemPrompt(
      WEB_SEARCH_INSTRUCTION,
      `OUTPUT: Return ONLY valid JSON with no markdown fences:\n{"title":"...","excerpt":"first 150 chars","body":"full article","tags":["RACE"],"content_type":"${contentType}"}`
    );

    const userPrompt = `Topic: ${topicText}
Content type: ${contentType}
Today: ${TODAY}

STEP 1: Search for the latest data you need for this article.
Search for current standings, recent race results, and any specific news related to this topic.

STEP 2: Write the article using only verified data from your search results and the context provided.

${fullContext}

Target: ${wordTarget} words. Return ONLY valid JSON:
{"title":"...","excerpt":"...","body":"...","tags":["..."],"content_type":"${contentType}"}`;

    // 4. Call Claude with web_search tool
    const response = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    }, 50000);

    const rJson = await response.json();

    // 5. Parse response (handles tool_use blocks from web search)
    let parsed;
    try {
      parsed = parseAIResponse(rJson);
    } catch {
      // Fallback: extract any text
      const anyText = (rJson.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      parsed = { title: topicText, body: anyText || 'Generation failed', excerpt: (anyText || '').slice(0, 150), tags: ['ANALYSIS'], content_type: contentType };
    }

    // 6. Fix encoding before validation
    parsed.title = fixEncoding(parsed.title);
    parsed.body = fixEncoding(parsed.body);
    parsed.excerpt = fixEncoding(parsed.excerpt);

    // 7. VALIDATION
    const validation = validateArticle(parsed);
    if (!validation.valid) {
      console.error('[GridFeed] Validation failed:', validation.reason);
      await logSync('generate-content', 'validation_failed', 0, validation.reason, Date.now() - start);
      return json({ ok: true, generated: 0, skipped: 'Validation failed', reason: validation.reason });
    }

    // 7. Dedup check
    const h = hashContent(parsed.body || '');
    const existing = await sb(`content_hashes?hash=eq.${h}&limit=1`);
    if (existing.length) {
      await logSync('generate-content', 'success', 0, 'Duplicate content skipped', Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'duplicate' });
    }

    // 8. Insert draft
    await sb('content_drafts', 'POST', {
      title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
      tags: parsed.tags || ['ANALYSIS'], content_type: parsed.content_type || contentType,
      review_status: 'pending', source_context: { topic: topicText, web_search: true, context_length: fullContext.length },
      priority_score: topic?.priority || 5, generation_model: 'GridFeed Pipeline',
      race_id: topic?.race_id || null,
    });

    // 9. Hash + topic update
    await sb('content_hashes', 'POST', { hash: h, type: contentType, source: 'generate-content' });
    if (topic?.id) await sb(`content_topics?id=eq.${topic.id}`, 'PATCH', { status: 'drafted' });

    // 10. Notify (fire and forget)
    fetchWT('/.netlify/functions/notify-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: parsed.title, content_type: contentType, priority_score: topic?.priority || 5, excerpt: (parsed.excerpt || '').slice(0, 200) }) }, 5000).catch(() => {});

    await logSync('generate-content', 'success', 1, `Draft [web_search]: "${parsed.title}" (${contentType})`, Date.now() - start);
    return json({ ok: true, generated: 1, title: parsed.title, webSearch: true });
  } catch (err) {
    await logSync('generate-content', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/30 * * * *' };
