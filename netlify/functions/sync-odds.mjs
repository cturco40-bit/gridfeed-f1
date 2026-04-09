import { getSupabase, logSync, matchRace } from './lib/supabase.mjs';

const ODDS_API = 'https://api.the-odds-api.com/v4/sports/motorsport_formula_one/odds';

function americanToDecimal(odds) {
  return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
}

function impliedProb(decimal) {
  return 1 / decimal;
}

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let oddsCount = 0;
  let picksCount = 0;

  try {
    if (!process.env.ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not set');
    }

    // 1. Fetch F1 odds
    const url = `${ODDS_API}?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=outrights&oddsFormat=american`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Odds API HTTP ${res.status}`);
    const events = await res.json();

    if (!events?.length) {
      await logSync(sb, {
        functionName: 'sync-odds',
        status: 'success',
        recordsAffected: 0,
        message: 'No F1 odds events available',
        durationMs: Date.now() - start,
      });
      return new Response(JSON.stringify({ ok: true, oddsCount: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    for (const event of events) {
      // Match event to race
      const race = await matchRace(sb, event.home_team || event.away_team || event.sport_title || '');
      // Also try matching on commence_time to next upcoming race
      let raceId = race?.id;

      if (!raceId) {
        // Fallback: match to the next upcoming race
        const { data: nextRace } = await sb
          .from('races')
          .select('id')
          .eq('status', 'upcoming')
          .order('race_date', { ascending: true })
          .limit(1);
        raceId = nextRace?.[0]?.id;
      }

      if (!raceId) continue;

      // Collect all outcomes across bookmakers, keep best odds per driver
      const bestOdds = {};

      for (const bookmaker of event.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          for (const outcome of market.outcomes || []) {
            const driver = outcome.name;
            const odds = outcome.price;
            const decimal = americanToDecimal(odds);
            const prob = impliedProb(decimal);

            if (!bestOdds[driver] || decimal > bestOdds[driver].decimal) {
              bestOdds[driver] = {
                driver_name: driver,
                market: 'race_winner',
                odds_american: odds > 0 ? `+${odds}` : `${odds}`,
                odds_decimal: decimal,
                implied_prob: prob,
                bookmaker: bookmaker.title,
              };
            }
          }
        }
      }

      // Delete old odds for this race + market
      await sb.from('driver_odds').delete().eq('race_id', raceId).eq('market', 'race_winner');

      // Insert fresh odds
      const oddsRows = Object.values(bestOdds).map(o => ({
        race_id: raceId,
        ...o,
        fetched_at: new Date().toISOString(),
      }));

      if (oddsRows.length) {
        await sb.from('driver_odds').insert(oddsRows);
        oddsCount += oddsRows.length;
      }

      // 2. Generate betting picks
      picksCount += await generatePicks(sb, raceId, oddsRows);
    }

    await logSync(sb, {
      functionName: 'sync-odds',
      status: 'success',
      recordsAffected: oddsCount + picksCount,
      message: `Synced ${oddsCount} odds, generated ${picksCount} picks`,
      durationMs: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true, oddsCount, picksCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logSync(sb, {
      functionName: 'sync-odds',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

async function generatePicks(sb, raceId, oddsRows) {
  if (!oddsRows.length) return 0;

  // Get race info
  const { data: race } = await sb.from('races').select('name').eq('id', raceId).single();

  // Get recent results to estimate "true probability"
  const { data: recentResults } = await sb
    .from('leaderboard')
    .select('driver_name, position, session_type')
    .eq('session_type', 'race')
    .order('created_at', { ascending: false })
    .limit(100);

  // Count top-3 finishes per driver in recent races
  const driverForm = {};
  (recentResults || []).forEach(r => {
    if (!driverForm[r.driver_name]) driverForm[r.driver_name] = { races: 0, top3: 0, wins: 0 };
    driverForm[r.driver_name].races++;
    if (r.position <= 3) driverForm[r.driver_name].top3++;
    if (r.position === 1) driverForm[r.driver_name].wins++;
  });

  // Calculate edge for each driver
  const withEdge = oddsRows.map(o => {
    const form = driverForm[o.driver_name];
    let trueProb = o.implied_prob; // default: no edge

    if (form && form.races >= 2) {
      // Estimate true win prob from recent form
      trueProb = (form.wins / form.races) * 0.6 + (form.top3 / form.races) * 0.25 + o.implied_prob * 0.15;
    }

    return {
      ...o,
      true_prob: trueProb,
      edge: ((trueProb - o.implied_prob) / o.implied_prob) * 100,
    };
  }).sort((a, b) => b.edge - a.edge);

  const picks = [];

  // BEST BET: highest edge among drivers with implied_prob > 10%
  const bestBet = withEdge.find(d => d.implied_prob > 0.10 && d.edge > 0);
  if (bestBet) {
    picks.push({
      pick_type: 'BEST BET',
      driver_name: bestBet.driver_name,
      market: 'race_winner',
      odds: bestBet.odds_american,
      odds_decimal: bestBet.odds_decimal,
      implied_prob: bestBet.implied_prob,
      true_prob: bestBet.true_prob,
      edge: bestBet.edge,
      analysis: `Strong recent form suggests ${bestBet.driver_name} is undervalued at ${bestBet.odds_american}.`,
    });
  }

  // VALUE: best edge among mid-tier (5-15% implied)
  const value = withEdge.find(d => d.implied_prob >= 0.05 && d.implied_prob <= 0.15 && d.edge > 0 && d !== bestBet);
  if (value) {
    picks.push({
      pick_type: 'VALUE',
      driver_name: value.driver_name,
      market: 'race_winner',
      odds: value.odds_american,
      odds_decimal: value.odds_decimal,
      implied_prob: value.implied_prob,
      true_prob: value.true_prob,
      edge: value.edge,
      analysis: `${value.driver_name} at ${value.odds_american} offers value based on current trajectory.`,
    });
  }

  // LONGSHOT: best edge among longshots (implied < 5%)
  const longshot = withEdge.find(d => d.implied_prob < 0.05 && d.odds_decimal > 20 && d.edge > -10);
  if (longshot) {
    picks.push({
      pick_type: 'LONGSHOT',
      driver_name: longshot.driver_name,
      market: 'race_winner',
      odds: longshot.odds_american,
      odds_decimal: longshot.odds_decimal,
      implied_prob: longshot.implied_prob,
      true_prob: longshot.true_prob,
      edge: longshot.edge || 0,
      analysis: `${longshot.driver_name} at ${longshot.odds_american} — worth a small play if conditions favor an upset.`,
    });
  }

  // FADE: most overvalued (biggest negative edge among favorites)
  const fade = [...withEdge].sort((a, b) => a.edge - b.edge).find(d => d.implied_prob > 0.08 && d.edge < -5);
  if (fade) {
    picks.push({
      pick_type: 'FADE',
      driver_name: fade.driver_name,
      market: 'race_winner',
      odds: fade.odds_american,
      odds_decimal: fade.odds_decimal,
      implied_prob: fade.implied_prob,
      true_prob: fade.true_prob,
      edge: fade.edge,
      analysis: `${fade.driver_name} looks overvalued at ${fade.odds_american} based on recent performance.`,
    });
  }

  if (!picks.length) return 0;

  // Delete existing active picks for this race
  await sb.from('betting_picks').delete().eq('race_id', raceId).eq('status', 'active');

  // Insert new picks
  const pickRows = picks.map(p => ({
    race_id: raceId,
    race_name: race?.name || '',
    ...p,
    status: 'active',
    locked: true,
    locked_at: new Date().toISOString(),
  }));

  await sb.from('betting_picks').insert(pickRows);
  return pickRows.length;
}

export const config = {
  schedule: '0 8,18 * * *',
  path: '/api/sync-odds',
};
