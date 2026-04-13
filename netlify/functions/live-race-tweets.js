import { fetchWT, sb, logSync, json, getLatestSession } from './lib/shared.js';

/* Live race tweet automation
 *
 * Runs every minute. During an in-progress race session it scans
 * race_control for new events from the last 90s, generates a tweet,
 * inserts it as pending with priority=10 and an event_tag for dedup,
 * then fires an admin push so you can approve in 2 taps.
 */

const TEMPLATES = {
  safety_car: '🟡 SAFETY CAR at {race} — Lap {lap}. {reason}\n\ngridfeed.co',
  vsc:        '🟡 VIRTUAL SAFETY CAR at {race} — Lap {lap}. {reason}\n\ngridfeed.co',
  red_flag:   '🔴 RED FLAG at {race}. Race suspended on lap {lap}\n\ngridfeed.co',
  yellow:     '🟨 Double yellow at {race}, lap {lap}. {reason}\n\ngridfeed.co',
  penalty:    '⚠️ Penalty at {race}, lap {lap}. {reason}\n\ngridfeed.co',
  retirement: '❌ Retirement at {race} on lap {lap}. {reason}\n\ngridfeed.co',
  overtake_mode: '⚡ Overtake Mode {state} at {race}, lap {lap}\n\ngridfeed.co',
};

function classifyEvent(m) {
  const cat = (m.category || '').toLowerCase();
  const flag = (m.flag || '').toUpperCase();
  const msg = (m.message || '');
  const msgU = msg.toUpperCase();

  if (cat === 'safetycar' || msgU.includes('SAFETY CAR DEPLOYED')) return { kind: 'safety_car', tag: 'sc' };
  if (msgU.includes('VIRTUAL SAFETY CAR DEPLOYED') || msgU.includes('VSC DEPLOYED')) return { kind: 'vsc', tag: 'vsc' };
  if (flag === 'RED' || msgU.includes('RED FLAG')) return { kind: 'red_flag', tag: 'red' };
  if (msgU.includes('PENALTY') || msgU.includes('BLACK AND WHITE') || msgU.includes('DISQUALIF')) return { kind: 'penalty', tag: 'pen' };
  if (msgU.includes('RETIRED') || msgU.includes('STOPPED ON TRACK')) return { kind: 'retirement', tag: 'ret' };
  if (cat === 'overtakemode' || msgU.includes('OVERTAKE MODE')) {
    const state = msgU.includes('ENABLED') || msgU.includes('ACTIVE') ? 'enabled' : msgU.includes('DISABLED') || msgU.includes('INACTIVE') ? 'disabled' : null;
    if (!state) return null;
    return { kind: 'overtake_mode', tag: 'om-' + state, state };
  }
  return null;
}

function buildTweet(template, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll('{' + k + '}', v || ''), template);
}

export default async (req) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      return json({ ok: true, skipped: 'no_live_session' });
    }
    const sessionKey = String(session.session_key);
    const raceName = session.meeting_name || session.circuit_short_name || 'the race';

    // Fetch recent race_control rows from our DB (last 90s window)
    const since = new Date(Date.now() - 90 * 1000).toISOString();
    const rows = await sb(`race_control?session_key=eq.${sessionKey}&fetched_at=gt.${since}&order=date.asc`);
    if (!rows.length) {
      return json({ ok: true, queued: 0, reason: 'no_recent_events' });
    }

    let queued = 0;
    const errors = [];

    for (const m of rows) {
      const ev = classifyEvent(m);
      if (!ev) continue;

      const lap = m.lap_number || '?';
      // Unique tag per event so we never double-tweet the same incident
      const eventTag = `${sessionKey}-${ev.tag}-lap${lap}-${(m.date || '').slice(0, 19)}`;

      // Dedup: skip if a tweet with this tag already exists (any status)
      const existing = await sb(`tweets?event_tag=eq.${encodeURIComponent(eventTag)}&limit=1`);
      if (existing.length) continue;

      const tweetText = buildTweet(TEMPLATES[ev.kind], {
        race: raceName,
        lap,
        reason: (m.message || '').replace(/\s+/g, ' ').trim(),
        state: ev.state || '',
      });
      const trimmed = tweetText.length <= 280 ? tweetText : tweetText.slice(0, 277) + '...';

      try {
        await sb('tweets', 'POST', {
          tweet_text: trimmed,
          status: 'pending',
          tweet_type: 'live_race',
          event_tag: eventTag,
        });
        queued++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    // Fire admin push if anything was queued
    if (queued > 0) {
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🏁 Live tweet ready',
          body: `${queued} new live race tweet${queued > 1 ? 's' : ''} need approval`,
          url: '/gf-admin-drafts',
          tag: 'live-tweet-' + Date.now(),
          audience: 'admin',
        }),
      }, 5000).catch(() => {});
    }

    await logSync('live-race-tweets', 'success', queued, `Queued ${queued} live tweets from ${rows.length} race control events`, Date.now() - start);
    return json({ ok: true, queued, scanned: rows.length, errors });
  } catch (err) {
    await logSync('live-race-tweets', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '* * * * *' };
