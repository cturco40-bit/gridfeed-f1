import { sb, fetchWT, logSync, json } from './lib/shared.js';

// Update this table each race week. Times are in UTC.
// Miami GP (Round 4, Sprint weekend, 2026-05-01 → 05-03 ET / -05:00)
const UPCOMING_SESSIONS = [
  { name: 'FP1',                date: '2026-05-01T18:30:00Z', race: 'Miami Grand Prix' },
  { name: 'Sprint Qualifying',  date: '2026-05-01T22:30:00Z', race: 'Miami Grand Prix' },
  { name: 'Sprint',             date: '2026-05-02T16:00:00Z', race: 'Miami Grand Prix' },
  { name: 'Qualifying',         date: '2026-05-02T20:00:00Z', race: 'Miami Grand Prix' },
  { name: 'Race',               date: '2026-05-03T20:00:00Z', race: 'Miami Grand Prix' },
];

export default async (req) => {
  const start = Date.now();
  const now = Date.now();
  const THIRTY_MIN = 30 * 60 * 1000;
  const FIVE_MIN = 5 * 60 * 1000;

  try {
    for (const session of UPCOMING_SESSIONS) {
      const sessionTime = new Date(session.date).getTime();
      const timeUntil = sessionTime - now;

      // Fire when we're inside the 25–35 min window (5-min cron tolerance)
      if (timeUntil <= (THIRTY_MIN - FIVE_MIN) || timeUntil >= (THIRTY_MIN + FIVE_MIN)) continue;

      // Dedup via sync_log — message string contains a stable key
      const key = `reminder:${session.name}:${session.date}`;
      const since = new Date(now - 6 * 36e5).toISOString();
      const prior = await sb(`sync_log?function_name=eq.push-session-reminder&status=eq.success&created_at=gt.${since}&message=ilike.*${encodeURIComponent(key)}*&limit=1`);
      if ((prior || []).length) continue;

      const title = `${session.name} starts in 30 minutes`;
      const body = `${session.race} — ${session.name} is about to begin. Open GridFeed for live timing.`;
      const siteUrl = process.env.URL || 'https://gridfeed.co';

      await fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          url: '/?tab=results',
          tag: 'session-reminder',
          audience: 'public',
        }),
      }, 8000);

      await logSync('push-session-reminder', 'success', 1, key, Date.now() - start);
      return json({ ok: true, sent: true, session: session.name });
    }

    return json({ ok: true, message: 'No session reminder due' });
  } catch (err) {
    await logSync('push-session-reminder', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

