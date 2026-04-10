import { fetchWT, sb, logSync, json } from './lib/shared.js';
import { buildSystemPrompt, validateArticle, buildLiveContext, fixEncoding, TODAY } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WEEKLY = {
  1: ['championship_update'], 2: ['analysis'], 3: ['preview'],
  4: ['preview'], 5: ['practice_analysis'], 6: ['qualifying_recap'], 0: ['race_recap', 'championship_update'],
};

const WEB_SEARCH_INSTRUCTION = `YOU HAVE WEB SEARCH. USE IT.

Before writing any article, search for the specific facts you need. Do not guess. Do not invent. Search first.

ALWAYS search for:
- Current F1 2026 championship standings before any standings reference
- Specific race results before referencing any race position or points
- Any breaking news or driver/team updates mentioned in the topic

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

export default async (req, context) => {
  const start = Date.now();
  let generated = 0;
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    const dow = new Date().getDay();
    const types = WEEKLY[dow] || ['analysis'];

    for (const contentType of types) {
      // No skip checks — generate fresh content every run

      // picksContext FIRST
      const picks = await sb('betting_picks?status=eq.active&order=created_at.desc&limit=10');
      let picksContext = picks.length ? 'CURRENT PICKS:\n' + picks.map(p => `${p.pick_type}: ${p.driver_name} ${p.odds} — ${p.analysis || ''}`).join('\n') : '';

      const liveContext = await buildLiveContext();
      const fullContext = [picksContext, liveContext].filter(Boolean).join('\n\n');
      const nextRace = (await sb('races?status=eq.upcoming&order=race_date.asc&limit=1'))[0];

      let typePrompt = `Write a ${contentType.replace(/_/g, ' ')} for GridFeed.`;
      if (contentType === 'preview' && picks.length) {
        typePrompt = `Write a comprehensive F1 BETTING PREVIEW for ${nextRace?.name || 'the next race'}. LEAD WITH BEST BET: ${picks[0]?.driver_name} ${picks[0]?.odds}. Cover: race winner picks (3), podium plays (3), points finish (2), longshot (1), fade (1). 600-700 words.`;
      }

      const systemPrompt = buildSystemPrompt(
        WEB_SEARCH_INSTRUCTION,
        `OUTPUT: Return ONLY valid JSON:\n{"title":"...","excerpt":"...","body":"...","tags":["ANALYSIS"],"content_type":"${contentType}"}`
      );

      const userPrompt = `Topic: ${typePrompt}
Today: ${TODAY}

STEP 1: Search for the latest F1 data relevant to this content type.
STEP 2: Write using only verified data from search results and context.

${fullContext}

JSON only.`;

      const res = await fetchWT('https://api.anthropic.com/v1/messages', {
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

      const rJson = await res.json();
      let parsed;
      try {
        parsed = parseAIResponse(rJson);
      } catch {
        const anyText = (rJson.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        parsed = { title: 'GridFeed Daily', body: anyText || '', excerpt: (anyText || '').slice(0, 150), tags: ['ANALYSIS'], content_type: contentType };
      }

      parsed.title = fixEncoding(parsed.title);
      parsed.body = fixEncoding(parsed.body);
      parsed.excerpt = fixEncoding(parsed.excerpt);

      const validation = validateArticle(parsed);
      if (!validation.valid) {
        await logSync('blog-scheduler', 'validation_failed', 0, validation.reason, Date.now() - start);
        continue;
      }

      await sb('content_drafts', 'POST', {
        title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
        tags: parsed.tags || ['ANALYSIS'], content_type: parsed.content_type || contentType,
        review_status: 'pending', source_context: { triggered_by: 'blog-scheduler', day: dow, web_search: true },
        generation_model: 'GridFeed Pipeline', race_id: nextRace?.id || null,
      });
      generated++;
    }

    await logSync('blog-scheduler', 'success', generated, `Generated ${generated} scheduled drafts [web_search]`, Date.now() - start);
    return json({ ok: true, generated });
  } catch (err) {
    await logSync('blog-scheduler', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 6 * * *' };
