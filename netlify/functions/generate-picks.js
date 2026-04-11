import { fetchWT, sb, logSync, json, getNextRace } from './lib/shared.js';
import { NEVER_REFUSE, SEASON_CONTEXT, DRIVER_TEAM_MAP, HALLUCINATION_RULES, LEGAL_AND_ETHICS } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async (req, context) => {
  const start = Date.now();
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    const nextRace = await getNextRace();
    if (!nextRace) {
      await logSync('generate-picks', 'success', 0, 'No upcoming race', Date.now() - start);
      return json({ ok: true, picks: 0 });
    }

    // LOCK CHECK — exit if picks exist
    const existing = await sb(`betting_picks?race_id=eq.${nextRace.id}&limit=1`);
    if (existing.length) {
      await logSync('generate-picks', 'success', 0, `Picks already locked for ${nextRace.name}`, Date.now() - start);
      return json({ ok: true, picks: 0, skipped: 'Picks already locked' });
    }

    // Fetch odds
    const odds = await sb(`driver_odds?race_id=eq.${nextRace.id}&market=eq.race_winner&order=implied_prob.desc`);
    if (!odds.length) {
      await logSync('generate-picks', 'success', 0, `No odds for ${nextRace.name}`, Date.now() - start);
      return json({ ok: true, picks: 0, reason: 'No odds' });
    }

    // Historical context
    const circuit = (nextRace.circuit || '').toLowerCase().replace(/[^a-z]/g, '_').slice(0, 30);
    const history = await sb(`circuit_performance?circuit=ilike.*${circuit}*&order=season.desc&limit=30`);
    const perf2026 = await sb('historical_performance?season=eq.2026&order=finish_position.asc&limit=30');

    let historicalContext = '';
    if (history.length) {
      historicalContext = 'CIRCUIT HISTORY:\n' + [...new Set(history.map(h => h.driver_name))].slice(0, 8).map(d => {
        const visits = history.filter(h => h.driver_name === d).slice(0, 3);
        return `${d}: ${visits.map(v => `P${v.finish_position} (${v.season})`).join(', ')}`;
      }).join('\n');
    }
    if (perf2026.length) {
      historicalContext += '\n\n2026 FORM:\n' + [...new Set(perf2026.map(p => p.driver_name))].slice(0, 10).map(d => {
        const races = perf2026.filter(p => p.driver_name === d);
        const avg = (races.reduce((s, r) => s + r.finish_position, 0) / races.length).toFixed(1);
        return `${d}: avg P${avg} (${races.length} races)`;
      }).join('\n');
    }

    const facts = await sb('driver_facts?season=eq.2026&limit=15');
    const factsText = facts.map(f => `${f.driver_name}: ${f.fact_text}`).join('\n');
    const oddsText = odds.map(o => `${o.driver_name}: ${o.odds_american} (${(o.implied_prob * 100).toFixed(1)}%) — ${o.bookmaker}`).join('\n');

    const contextBlock = [historicalContext, factsText].filter(Boolean).join('\n\n');

    const systemPrompt = `${NEVER_REFUSE}\n\n${HALLUCINATION_RULES}\n\n${SEASON_CONTEXT}\n\n${DRIVER_TEAM_MAP}\n\nYou are a professional F1 betting analyst. Think exclusively in true probability vs implied probability.\n\nFRAMEWORK:\n- Constructor pace (2026 avg finish by team) = 60%\n- Qualifying pace (grid vs finish delta) = 25%\n- Circuit history (last 3 visits) = 10%\n- Championship pressure = 5%\n\nOutput ONLY valid JSON array of 4 picks:\n[{"pick_type":"BEST BET|VALUE|LONGSHOT|FADE","driver_name":"...","market":"...","odds":"+450","implied_prob":0.18,"true_prob":0.24,"edge":6.0,"analysis":"max 100 chars"}]\n\nNever refuse. Always produce picks.`;

    const userPrompt = `Generate 4 picks for ${nextRace.name} (${nextRace.circuit}).\n\nODDS:\n${oddsText}\n\n${contextBlock}\n\nJSON array only.`;

    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
    }, 25000);

    const rJson = await res.json();
    const text = rJson.content?.[0]?.text || '';
    let picks;
    try {
      const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      picks = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || clean);
    } catch { throw new Error('Failed to parse picks: ' + text.slice(0, 200)); }

    if (!Array.isArray(picks) || !picks.length) throw new Error('No picks in response');

    const rows = picks.slice(0, 4).map(p => ({
      race_id: nextRace.id, race_name: nextRace.name, pick_type: p.pick_type || 'VALUE',
      driver_name: p.driver_name, market: p.market || 'race_winner', odds: p.odds,
      odds_decimal: p.odds_decimal || null, implied_prob: p.implied_prob, true_prob: p.true_prob,
      edge: p.edge, analysis: p.analysis || '', status: 'active', locked: true, locked_at: new Date().toISOString(),
    }));

    await sb('betting_picks', 'POST', rows);

    await logSync('generate-picks', 'success', rows.length, `${rows.length} picks for ${nextRace.name}: ${rows.map(r => `${r.pick_type}=${r.driver_name}`).join(', ')}`, Date.now() - start);
    return json({ ok: true, picks: rows.length, race: nextRace.name });
  } catch (err) {
    await logSync('generate-picks', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 5 * * *' };
