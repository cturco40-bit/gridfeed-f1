import { fetchWT, sb, logSync, json } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    // Check for sessions starting in next 60-90 minutes
    const now = new Date();
    const in60 = new Date(now.getTime() + 60 * 60000);
    const in90 = new Date(now.getTime() + 90 * 60000);

    const sessions = await sb(`schedule?scheduled_at=gte.${in60.toISOString()}&scheduled_at=lte.${in90.toISOString()}&select=id,session_name,session_type,race_id,scheduled_at`);
    if (!sessions.length) {
      await logSync('push-schedule', 'success', 0, 'No upcoming sessions', Date.now() - start);
      return json({ ok: true, sent: 0 });
    }

    let sent = 0;
    for (const sess of sessions) {
      // Check if already notified
      const already = await sb(`sync_log?function_name=eq.push-schedule&message=ilike.*${sess.id}*&limit=1`);
      if (already.length) continue;

      // Get race name
      const race = await sb(`races?id=eq.${sess.race_id}&select=name&limit=1`);
      const raceName = race[0]?.name || 'Grand Prix';
      const sessName = sess.session_name || sess.session_type || 'Session';

      // Send push
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      await fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${sessName} starts in 1 hour`,
          body: `${raceName} -- GridFeed live timing ready`,
          url: '/?tab=results',
          tag: 'session-' + sess.id,
          audience: 'public',
        }),
      }, 8000).catch(() => {});

      await logSync('push-schedule', 'success', 1, `Notified: ${sessName} ${raceName} (${sess.id})`, Date.now() - start);
      sent++;
    }

    return json({ ok: true, sent });
  } catch (err) {
    await logSync('push-schedule', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 */1 * * *' };
