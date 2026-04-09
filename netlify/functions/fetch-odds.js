import { getSupabase, logSync, fetchWithTimeout, getNextRace, jsonResponse } from './lib/supabase.js';

const ODDS_API = 'https://api.the-odds-api.com/v4/sports';
const TIMEOUT = 8000;

const F1_MARKETS = [
  'motorsport_f1_winner',
  'motorsport_f1_constructor_winner',
];

const MARKET_LABELS = {
  motorsport_f1_winner: 'race_winner',
  motorsport_f1_constructor_winner: 'constructor_winner',
};

function americanToDecimal(odds) {
  return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
}

function impliedProb(decimal) {
  return 1 / decimal;
}

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let totalOdds = 0;

  try {
    if (!process.env.ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not set');
    }

    // Get next upcoming race
    const nextRace = await getNextRace(sb);
    if (!nextRace) {
      await logSync(sb, { functionName: 'fetch-odds', status: 'success', recordsAffected: 0, message: 'No upcoming race found', durationMs: Date.now() - start });
      return jsonResponse({ ok: true, totalOdds: 0, message: 'No upcoming race' });
    }

    for (const sport of F1_MARKETS) {
      const marketLabel = MARKET_LABELS[sport] || sport;

      let events;
      try {
        const url = `${ODDS_API}/${sport}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=outrights&oddsFormat=american`;
        const res = await fetchWithTimeout(url, {}, TIMEOUT);
        if (!res.ok) {
          console.warn(`[fetch-odds] ${sport} HTTP ${res.status}`);
          continue;
        }
        events = await res.json();
      } catch (e) {
        console.warn(`[fetch-odds] ${sport} fetch error:`, e.message);
        continue;
      }

      if (!events?.length) continue;

      // Collect best odds per driver/constructor across bookmakers
      for (const event of events) {
        const bestOdds = {};

        for (const bookmaker of event.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              const name = outcome.name;
              const odds = outcome.price;
              const decimal = americanToDecimal(odds);
              const prob = impliedProb(decimal);

              if (!bestOdds[name] || decimal > bestOdds[name].odds_decimal) {
                bestOdds[name] = {
                  race_id: nextRace.id,
                  driver_name: name,
                  market: marketLabel,
                  odds_american: odds > 0 ? `+${odds}` : `${odds}`,
                  odds_decimal: parseFloat(decimal.toFixed(4)),
                  implied_prob: parseFloat(prob.toFixed(6)),
                  bookmaker: bookmaker.title,
                  fetched_at: new Date().toISOString(),
                };
              }
            }
          }
        }

        const oddsRows = Object.values(bestOdds);
        if (!oddsRows.length) continue;

        // Replace old odds for this race + market
        await sb.from('driver_odds').delete().eq('race_id', nextRace.id).eq('market', marketLabel);

        const { error } = await sb.from('driver_odds').insert(oddsRows);
        if (error) {
          console.warn(`[fetch-odds] Insert error for ${marketLabel}:`, error.message);
          continue;
        }
        totalOdds += oddsRows.length;
      }
    }

    await logSync(sb, {
      functionName: 'fetch-odds',
      status: 'success',
      recordsAffected: totalOdds,
      message: `Synced ${totalOdds} odds for ${nextRace.name}`,
      durationMs: Date.now() - start,
    });

    return jsonResponse({ ok: true, totalOdds, race: nextRace.name });

  } catch (err) {
    await logSync(sb, {
      functionName: 'fetch-odds',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '0 */6 * * *',
};
