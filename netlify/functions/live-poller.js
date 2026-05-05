import { fetchWT, sb, logSync, json, getLatestSession, fetchOpenF1 } from './lib/shared.js';

// Sub-minute polling for race_control during live sessions.
//
// Why this exists: Netlify scheduled functions have a 1-minute minimum cron
// interval, which gave us up to 60s of detection lag for SC / red flag /
// chequered events — enough that other accounts beat us to the tweet during
// Miami. This function self-loops within a single invocation so we poll
// every 10s. With cron at every minute, polls land at T+0/+10/+20/+30/+40/+50
// inside each minute. Worst-case detection wait is ~10s and end-to-end tweet
// latency lands well inside the 25s target.
//
// fetch-race-control stays as a 1-min backup so a missed live-poller tick
// doesn't drop a CHEQUERED. Inserts dedup on (session_key, date).
//
// Grace: keep polling for 10 min past session.date_end so a slightly-late
// final CHEQUERED still lands. Same justification as fetch-race-control.

const POLL_INTERVAL_MS = 10 * 1000;
// Run budget under the 60s function timeout configured in netlify.toml.
// 50s leaves margin for the final iteration's OpenF1 call + insert.
const RUN_BUDGET_MS = 50 * 1000;
const POST_END_GRACE_MS = 10 * 60 * 1000;

async function pollOnce(sessionKey) {
  const res = await fetchOpenF1(`/v1/race_control?session_key=${sessionKey}`, 8000);
  if (!res.ok) return { ok: false, reason: `openf1_http_${res.status}`, inserted: 0 };
  const messages = await res.json();
  if (!Array.isArray(messages) || !messages.length) return { ok: true, inserted: 0 };

  // Batch dedup: pull existing dates once, check in memory. Per-row dedup
  // queries against 200+ race events would burn the run budget.
  const existing = await sb(`race_control?session_key=eq.${sessionKey}&select=date&order=date.desc&limit=1000`);
  const seenDates = new Set((existing || []).map(r => r.date));

  const newRows = [];
  for (const m of messages) {
    if (seenDates.has(m.date)) continue;
    let msg = m.message || '';
    if (msg.includes('DRS')) msg = msg.replace(/DRS Enabled/gi, 'Overtake Mode Active').replace(/DRS Disabled/gi, 'Overtake Mode Inactive').replace(/DRS/gi, 'Overtake Mode');
    let cat = m.category || '';
    if (cat === 'Drs') cat = 'OvertakeMode';
    newRows.push({
      session_key: String(sessionKey),
      date: m.date,
      lap_number: m.lap_number,
      category: cat,
      message: msg,
      flag: m.flag,
      scope: m.scope,
      fetched_at: new Date().toISOString(),
    });
  }
  if (!newRows.length) return { ok: true, inserted: 0 };

  await sb('race_control', 'POST', newRows);
  return { ok: true, inserted: newRows.length };
}

export default async (req) => {
  const start = Date.now();
  let totalInserted = 0;
  let polls = 0;
  let triggers = 0;
  try {
    const session = await getLatestSession();
    const endMs = session?.date_end ? new Date(session.date_end).getTime() : null;
    const inGrace = !session?.isLive && endMs && Date.now() > endMs && (Date.now() - endMs) <= POST_END_GRACE_MS;
    if (!session?.isLive && !inGrace) {
      await logSync('live-poller', 'success', 0, 'No live session', Date.now() - start);
      return json({ ok: true, skipped: 'no_live_session' });
    }

    const siteUrl = process.env.URL || 'https://gridfeed.co';
    const sessionKey = session.session_key;

    while (Date.now() - start < RUN_BUDGET_MS) {
      polls++;
      const result = await pollOnce(sessionKey);
      if (result.ok && result.inserted > 0) {
        totalInserted += result.inserted;
        triggers++;
        // Fire-and-forget so the next poll isn't blocked on downstream runtime.
        fetchWT(siteUrl + '/.netlify/functions/live-race-tweets', { method: 'POST' }, 15000).catch(() => {});
      }

      // Sleep until next poll, but only if there's enough budget left for
      // both the sleep AND a subsequent poll iteration (~3s).
      const elapsed = Date.now() - start;
      if (elapsed + POLL_INTERVAL_MS + 3000 >= RUN_BUDGET_MS) break;
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    await logSync('live-poller', 'success', totalInserted, `${polls} polls, ${totalInserted} new rows, ${triggers} triggers (${session.session_name})`, Date.now() - start);
    return json({ ok: true, polls, inserted: totalInserted, triggers });
  } catch (err) {
    await logSync('live-poller', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};
