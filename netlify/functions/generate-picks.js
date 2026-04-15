import { fetchWT, sb, logSync, json, getNextRace } from './lib/shared.js';
import { NEVER_REFUSE, SEASON_CONTEXT, DRIVER_TEAM_MAP, HALLUCINATION_RULES } from './lib/accuracy.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Cap how many unlocked drafts can sit in the admin queue per race at once.
// Prevents the generator from filling the queue with redundant suggestions
// if an admin takes a day to review — one daily run tops up, doesn't flood.
const DRAFT_QUEUE_CAP = 6;
// How many picks to ask Haiku for per run.
const PICKS_PER_RUN = 4;

export default async (req, context) => {
  const start = Date.now();
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    const nextRace = await getNextRace();
    if (!nextRace) {
      await logSync('generate-picks', 'success', 0, 'No upcoming race', Date.now() - start);
      return json({ ok: true, picks: 0 });
    }

    // Count UNLOCKED drafts already waiting for review for this race.
    // Locked picks (already approved) never count against this cap — they
    // are the ones the public site is showing.
    const queue = await sb(`betting_picks?race_id=eq.${nextRace.id}&locked_at=is.null&select=id`);
    if ((queue || []).length >= DRAFT_QUEUE_CAP) {
      await logSync('generate-picks', 'success', 0, `Draft queue full (${queue.length}/${DRAFT_QUEUE_CAP}) for ${nextRace.name}`, Date.now() - start);
      return json({ ok: true, picks: 0, skipped: 'queue_full' });
    }

    // Fetch the latest cached winner-market odds from driver_odds.
    const odds = await sb(`driver_odds?race_id=eq.${nextRace.id}&market=eq.race_winner&order=implied_prob.desc`);
    if (!odds.length) {
      await logSync('generate-picks', 'success', 0, `No odds for ${nextRace.name}`, Date.now() - start);
      return json({ ok: true, picks: 0, reason: 'no_odds' });
    }
    // Build a lookup so we can verify AI picks against real cached odds.
    const oddsByDriver = {};
    for (const o of odds) oddsByDriver[(o.driver_name || '').toLowerCase()] = o;

    // Historical context
    const circuit = (nextRace.circuit || '').toLowerCase().replace(/[^a-z]/g, '_').slice(0, 30);
    const history = await sb(`circuit_performance?circuit=ilike.*${circuit}*&order=season.desc&limit=30`).catch(() => []);
    const perf2026 = await sb('historical_performance?season=eq.2026&order=finish_position.asc&limit=30').catch(() => []);

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

    const facts = await sb('driver_facts?season=eq.2026&limit=15').catch(() => []);
    const factsText = facts.map(f => `${f.driver_name}: ${f.fact_text}`).join('\n');
    const oddsText = odds.map(o => `${o.driver_name}: ${o.odds_american} (${(o.implied_prob * 100).toFixed(1)}%) decimal ${o.odds_decimal} — ${o.bookmaker}`).join('\n');
    const contextBlock = [historicalContext, factsText].filter(Boolean).join('\n\n');

    const systemPrompt = `${NEVER_REFUSE}

${HALLUCINATION_RULES}

${SEASON_CONTEXT}

${DRIVER_TEAM_MAP}

You are a professional F1 betting analyst for GridFeed. You generate draft picks that a human editor will review before publishing.

RULES:
- Only pick drivers that appear in the ODDS list below. Never invent odds or drivers.
- Copy the exact decimal odds and bookmaker from the ODDS list into your response.
- confidence is your true probability estimate 0..1.
- edge_pct = (confidence * decimal_odds - 1) * 100. Only pick when edge_pct > 0 (positive EV).
- Assign pick_type:
    BEST BET = confidence >= 0.30 AND edge_pct >= 10
    VALUE    = edge_pct between 5 and 10
    LONGSHOT = decimal_odds >= 15
    FADE     = edge_pct < 0 (market is overvaluing this driver; we are advising against)
- analysis is 1-2 sentences, cites a concrete number from the form data, no vague language.

FRAMEWORK:
- Constructor pace (2026 avg finish by team) = 60%
- Qualifying pace (grid vs finish delta) = 25%
- Circuit history (last 3 visits) = 10%
- Championship pressure = 5%

Output ONLY a JSON array of exactly ${PICKS_PER_RUN} picks:
[{"pick_type":"BEST BET","driver_name":"...","odds_decimal":2.10,"bookmaker":"pinnacle","confidence":0.52,"edge_pct":9.2,"analysis":"..."}]

Never refuse. Always produce picks.`;

    const userPrompt = `Generate ${PICKS_PER_RUN} race-winner picks for ${nextRace.name} (${nextRace.circuit}).

ODDS:
${oddsText}

${contextBlock}

Return ONLY the JSON array.`;

    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
    }, 30000);

    const rJson = await res.json();
    const text = rJson.content?.[0]?.text || '';
    let picks;
    try {
      const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      picks = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || clean);
    } catch {
      throw new Error('Failed to parse picks: ' + text.slice(0, 200));
    }
    if (!Array.isArray(picks) || !picks.length) throw new Error('No picks in response');

    // Verify each pick against cached odds — skip any that doesn't match a real
    // row. This protects against hallucinated drivers / invented odds.
    let inserted = 0;
    for (const p of picks.slice(0, PICKS_PER_RUN)) {
      const source = oddsByDriver[(p.driver_name || '').toLowerCase()];
      if (!source) {
        console.warn('[generate-picks] Skipping hallucinated driver:', p.driver_name);
        continue;
      }
      const sourceDec = parseFloat(source.odds_decimal);
      const claimedDec = parseFloat(p.odds_decimal);
      if (!Number.isFinite(sourceDec) || Math.abs(sourceDec - claimedDec) > 0.05) {
        console.warn('[generate-picks] Odds mismatch for', p.driver_name, 'src=', sourceDec, 'claimed=', claimedDec);
        continue;
      }
      // Extra guard: don't insert duplicates against existing unlocked drafts
      // for the same driver/market.
      const dupe = await sb(`betting_picks?race_id=eq.${nextRace.id}&driver_name=eq.${encodeURIComponent(p.driver_name)}&market_category=eq.winner&locked_at=is.null&select=id`);
      if ((dupe || []).length) {
        console.log('[generate-picks] Skipping duplicate draft for', p.driver_name);
        continue;
      }
      await sb('betting_picks', 'POST', {
        race_id: nextRace.id,
        race_name: nextRace.name,
        pick_type: p.pick_type || 'VALUE',
        market_category: 'winner',
        driver_name: p.driver_name,
        selection: p.driver_name,
        market: 'Race Winner',
        odds: source.odds_american || null,
        odds_decimal: sourceDec,
        odds_at_pick: sourceDec,             // snapshot locked in right now
        odds_captured_at: new Date().toISOString(),
        bookmaker: source.bookmaker,
        implied_prob: source.implied_prob || null,
        true_prob: parseFloat(p.confidence) || null,
        confidence: parseFloat(p.confidence) || null,
        edge: parseFloat(p.edge_pct) || null,
        analysis: (p.analysis || '').slice(0, 500),
        sources: { form_snapshot: historicalContext.slice(0, 500), book: source.bookmaker },
        status: 'pending',
        locked: false,
        locked_at: null,
      });
      inserted++;
    }

    await logSync('generate-picks', 'success', inserted, `${inserted} draft picks for ${nextRace.name}`, Date.now() - start);
    return json({ ok: true, picks: inserted, race: nextRace.name });
  } catch (err) {
    await logSync('generate-picks', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};
