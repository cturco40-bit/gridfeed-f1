import { fetchWT, sb, logSync, json, getLatestSession, fetchOpenF1 } from './lib/shared.js';

// Live tweet generation moved to live-race-tweets.js (approval flow).
// This function now only mirrors race_control data into our DB.
//
// Grace window: keep polling for 10 min past session.date_end so the final
// CHEQUERED / SESSION FINISHED arrives even when OpenF1 emits it slightly
// late (Miami quali Q3 chequered arrived after date_end and was missed).
const POST_END_GRACE_MS = 10 * 60 * 1000;

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    const endMs = session?.date_end ? new Date(session.date_end).getTime() : null;
    const inGrace = !session?.isLive && endMs && (Date.now() - endMs) <= POST_END_GRACE_MS && (Date.now() > endMs);
    if (!session?.isLive && !inGrace) {
      await logSync('fetch-race-control', 'success', 0, 'No live session', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const res = await fetchOpenF1(`/v1/race_control?session_key=${session.session_key}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const messages = await res.json();
    if (!messages?.length) {
      await logSync('fetch-race-control', 'success', 0, 'No race control messages', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    let inserted = 0;
    for (const m of messages) {
      const existing = await sb(`race_control?session_key=eq.${session.session_key}&date=eq.${encodeURIComponent(m.date)}&limit=1`);
      if (existing.length) continue;
      // Map DRS terminology to 2026 Overtake Mode
      let msg = m.message || '';
      if (msg.includes('DRS')) msg = msg.replace(/DRS Enabled/gi, 'Overtake Mode Active').replace(/DRS Disabled/gi, 'Overtake Mode Inactive').replace(/DRS/gi, 'Overtake Mode');
      let cat = m.category || '';
      if (cat === 'Drs') cat = 'OvertakeMode';
      await sb('race_control', 'POST', {
        session_key: String(session.session_key), date: m.date, lap_number: m.lap_number,
        category: cat, message: msg, flag: m.flag, scope: m.scope, fetched_at: new Date().toISOString(),
      });
      inserted++;

    }

    // After mirroring race_control rows, fire live-race-tweets to scan for new events
    if (inserted > 0) {
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      fetchWT(siteUrl + '/.netlify/functions/live-race-tweets', { method: 'POST' }, 15000).catch(() => {});
    }

    await logSync('fetch-race-control', 'success', inserted, `${inserted} new messages`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-race-control', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

