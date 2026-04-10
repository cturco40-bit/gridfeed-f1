import { fetchWT, sb, logSync, json, NEVER_REFUSE, SEASON_CONTEXT } from './lib/shared.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WEEKLY = {
  1: ['championship_update'], 2: ['analysis'], 3: ['preview'],
  4: ['preview'], 5: ['practice_analysis'], 6: ['qualifying_recap'], 0: ['race_recap', 'championship_update'],
};

export default async (req, context) => {
  const start = Date.now();
  let generated = 0;
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    const dow = new Date().getDay();
    const types = WEEKLY[dow] || ['analysis'];

    for (const contentType of types) {
      // Dedup: check if already generated today
      const todayStr = new Date().toISOString().slice(0, 10);
      const existing = await sb(`content_drafts?content_type=eq.${contentType}&created_at=gte.${todayStr}T00:00:00Z&limit=1`);
      if (existing.length) continue;

      // Build context — picksContext FIRST
      const picks = await sb('betting_picks?status=eq.active&order=created_at.desc&limit=10');
      let picksContext = picks.length ? 'CURRENT PICKS:\n' + picks.map(p => `${p.pick_type}: ${p.driver_name} ${p.odds} — ${p.analysis || ''}`).join('\n') : '';

      const facts = await sb('driver_facts?season=eq.2026&limit=10');
      const factsText = facts.map(f => `${f.driver_name}: ${f.fact_text}`).join('\n');
      const contextBlock = factsText;
      const fullContext = [picksContext, contextBlock].filter(Boolean).join('\n\n');

      const nextRace = (await sb('races?status=eq.upcoming&order=race_date.asc&limit=1'))[0];

      let typePrompt = `Write a ${contentType.replace(/_/g, ' ')} for GridFeed.`;
      if (contentType === 'preview' && picks.length) {
        typePrompt = `Write a comprehensive F1 BETTING PREVIEW for ${nextRace?.name || 'the next race'}. LEAD WITH BEST BET: ${picks[0]?.driver_name} ${picks[0]?.odds}. Cover: race winner picks (3, with odds/edge), podium plays (3), points finish value (2), H2H matchups (2), longshot (1), fade (1). Reference our actual picks. 600-700 words.`;
      }

      const systemPrompt = `${NEVER_REFUSE}\n\n${SEASON_CONTEXT}\n\nYou write for GridFeed.\nOutput ONLY valid JSON: {"title":"...","excerpt":"...","body":"...","tags":["ANALYSIS"],"content_type":"${contentType}"}`;

      const res = await fetchWT('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: systemPrompt, messages: [{ role: 'user', content: `${typePrompt}\n\n${fullContext}\n\nJSON only.` }] }),
      }, 25000);

      const rJson = await res.json();
      const text = rJson.content?.[0]?.text || '';
      let parsed;
      try {
        const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        parsed = JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0] || clean);
      } catch { parsed = { title: 'GridFeed Daily', body: text, excerpt: text.slice(0, 150), tags: ['ANALYSIS'], content_type: contentType }; }

      await sb('content_drafts', 'POST', {
        title: parsed.title, body: parsed.body, excerpt: parsed.excerpt,
        tags: parsed.tags || ['ANALYSIS'], content_type: parsed.content_type || contentType,
        review_status: 'pending', source_context: { triggered_by: 'blog-scheduler', day: dow },
        generation_model: 'claude-haiku-4-5-20251001', race_id: nextRace?.id || null,
      });
      generated++;
    }

    await logSync('blog-scheduler', 'success', generated, `Generated ${generated} scheduled drafts`, Date.now() - start);
    return json({ ok: true, generated });
  } catch (err) {
    await logSync('blog-scheduler', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 6 * * *' };
