import { fetchWT, sb, logSync, json, getNextRace } from './lib/shared.js';

const ODDS_KEY = process.env.ODDS_API_KEY;
const MARKETS = ['motorsport_f1_winner', 'motorsport_f1_constructor_winner'];
const MARKET_LABELS = { motorsport_f1_winner: 'race_winner', motorsport_f1_constructor_winner: 'constructor_winner' };
const TRACK_BOOKS = ['DraftKings', 'FanDuel', 'BetMGM'];

function americanToDecimal(odds) { return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1; }
function impliedProb(odds) { return odds > 0 ? 100 / (odds + 100) * 100 : Math.abs(odds) / (Math.abs(odds) + 100) * 100; }

export default async (req, context) => {
  const start = Date.now();
  let totalOdds = 0;
  try {
    if (!ODDS_KEY) throw new Error('ODDS_API_KEY not set');
    const nextRace = await getNextRace();
    if (!nextRace) {
      await logSync('fetch-odds', 'success', 0, 'No upcoming race', Date.now() - start);
      return json({ ok: true, totalOdds: 0 });
    }

    for (const market of MARKETS) {
      const label = MARKET_LABELS[market] || market;
      try {
        const res = await fetchWT(`https://api.the-odds-api.com/v4/sports/${market}/odds/?apiKey=${ODDS_KEY}&regions=us&markets=outrights&oddsFormat=american`);
        if (!res.ok) continue;
        const events = await res.json();
        if (!events?.length) continue;

        for (const event of events) {
          const bestOdds = {};
          for (const bk of event.bookmakers || []) {
            const isTracked = TRACK_BOOKS.some(tb => bk.title.includes(tb));
            for (const mkt of bk.markets || []) {
              for (const o of mkt.outcomes || []) {
                const dec = americanToDecimal(o.price);
                const key = `${o.name}-${bk.title}`;
                if (isTracked || !bestOdds[o.name] || dec > bestOdds[o.name].odds_decimal) {
                  if (!bestOdds[o.name] || dec > bestOdds[o.name].odds_decimal) {
                    bestOdds[o.name] = {
                      race_id: nextRace.id, driver_name: o.name, market: label,
                      odds_american: o.price > 0 ? `+${o.price}` : `${o.price}`,
                      odds_decimal: parseFloat(dec.toFixed(4)),
                      implied_prob: parseFloat((impliedProb(o.price) / 100).toFixed(6)),
                      bookmaker: bk.title, fetched_at: new Date().toISOString(),
                    };
                  }
                }
              }
            }
          }

          const rows = Object.values(bestOdds);
          if (!rows.length) continue;
          await sb(`driver_odds?race_id=eq.${nextRace.id}&market=eq.${label}`, 'DELETE');
          await sb('driver_odds', 'POST', rows);
          totalOdds += rows.length;
        }
      } catch (e) { console.warn(`[fetch-odds] ${market}:`, e.message); }
    }

    await logSync('fetch-odds', 'success', totalOdds, `${totalOdds} odds for ${nextRace.name}`, Date.now() - start);
    return json({ ok: true, totalOdds, race: nextRace.name });
  } catch (err) {
    await logSync('fetch-odds', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

