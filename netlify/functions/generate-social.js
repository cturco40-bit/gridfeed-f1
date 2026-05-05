import { sb, logSync, json } from './lib/shared.js';

// Update these fields after each race weekend so templates stay accurate.
// nextRace + standings drive every template below — when stale, this fn
// generates retrospective race-week tweets for a race that already happened.
// TODO: pull these dynamically from races/standings tables so no manual
// edit is needed (tracked as Fix B in the post-Miami audit).
const STANDINGS = {
  leader: 'Antonelli', leaderPts: 72,
  p2: 'Russell',       p2Pts: 63,
  p3: 'Leclerc',       p3Pts: 49,
  nextRace: 'Canadian Grand Prix',
  nextRaceShort: 'Canada',
  nextRaceTag: '#CanadianGP',
  nextRaceDate: '2026-05-24',
};

function daysUntilNextRace() {
  return Math.max(0, Math.ceil((new Date(STANDINGS.nextRaceDate) - Date.now()) / 86400000));
}

// Race-specific templates (predictions, "circuit in brief", custom schedules,
// picks tease) live in a separate per-race module that gets swapped each
// weekend. Templates here MUST be neutral — no city names, no circuit facts,
// no race-specific schedules. Anything race-aware reads STANDINGS.nextRace*.
const TEMPLATES = [
  // Countdown
  () => `${daysUntilNextRace()} days until the ${STANDINGS.nextRace}.\n\n${STANDINGS.leader} ${STANDINGS.leaderPts} | ${STANDINGS.p2} ${STANDINGS.p2Pts} | ${STANDINGS.p3} ${STANDINGS.p3Pts}\n\nWho takes it in ${STANDINGS.nextRaceShort}?\n\n#F1 ${STANDINGS.nextRaceTag}`,

  // Stat of the day
  () => `Stat: Bearman (17 pts) has outscored Verstappen (12 pts) through 3 races.\n\nA Haas rookie ahead of a 4x champion. 2026 is different.\n\n#F1`,

  // Hot take
  () => `Hot take: Red Bull won't score a podium before the summer break.\n\nVerstappen has 12 points from 3 races. The chassis is broken and ADUO can't fix it fast enough.\n\n#F1`,

  // Teammate battle
  () => `2026 teammate battles after 3 races:\n\nAntonelli 72 vs Russell 63\nLeclerc 49 vs Hamilton 41\nNorris 25 vs Piastri 21\nBearman 17 vs Ocon 1\nVerstappen 12 vs Hadjar 4\n\n#F1`,

  // Genuine question
  () => `Genuine question: is Antonelli already the best driver on the grid?\n\n72 points. 2 wins. 19 years old. Leading the championship.\n\nOr is it too early?\n\n#F1`,

  // Data insight
  () => `Mercedes qualifying pace advantage after 3 races:\n\nvs Ferrari: +0.25s\nvs McLaren: +0.42s\nvs Red Bull: +0.62s\nvs Alpine: +0.58s\n\nThat's not a gap. That's a chasm.\n\n#F1`,
];

// Simple text similarity — first 30 normalised chars must be unique
function normHead(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30); }

export default async (req) => {
  const start = Date.now();
  try {
    // Dual rate limit: max 2 social tweets per hour, max 15 per calendar day
    const hourAgo = new Date(Date.now() - 36e5).toISOString();
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const hourly = await sb(`tweets?tweet_type=eq.social&created_at=gt.${hourAgo}&select=tweet_text&order=created_at.desc`);
    const daily = await sb(`tweets?tweet_type=eq.social&created_at=gte.${todayStart.toISOString()}&select=id`);
    if ((hourly || []).length >= 2) {
      await logSync('generate-social', 'success', 0, `Hourly cap: ${hourly.length}/2`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'hourly_cap' });
    }
    if ((daily || []).length >= 15) {
      await logSync('generate-social', 'success', 0, `Daily cap: ${daily.length}/15`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'daily_cap' });
    }

    const recentHeads = new Set((hourly || []).map(t => normHead(t.tweet_text)));

    // Pick a template whose head hasn't been used recently
    let text = null;
    const order = [...TEMPLATES].sort(() => Math.random() - 0.5);
    for (const tpl of order) {
      const candidate = tpl();
      if (candidate.length > 280) continue;
      if (!recentHeads.has(normHead(candidate))) { text = candidate; break; }
    }
    if (!text) {
      return json({ ok: true, generated: 0, reason: 'no_unique_template' });
    }

    await sb('tweets', 'POST', {
      tweet_text: text,
      tweet_type: 'social',
      status: 'pending', // requires manual approval in /gf-admin-drafts
    });

    await logSync('generate-social', 'success', 1, text.slice(0, 60), Date.now() - start);
    return json({ ok: true, generated: 1, tweet: text });
  } catch (err) {
    await logSync('generate-social', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

