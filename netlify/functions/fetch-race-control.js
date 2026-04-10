import { fetchWT, sb, logSync, json, getLatestSession } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      await logSync('fetch-race-control', 'success', 0, 'No live session', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const res = await fetchWT(`https://api.openf1.org/v1/race_control?session_key=${session.session_key}`);
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
      await sb('race_control', 'POST', {
        session_key: String(session.session_key), date: m.date, lap_number: m.lap_number,
        category: m.category, message: m.message, flag: m.flag, scope: m.scope, fetched_at: new Date().toISOString(),
      });
      inserted++;

      // Alert on safety car / red flag
      if (m.category === 'SafetyCar' || m.flag === 'RED') {
        fetchWT('/.netlify/functions/notify-draft', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `🚨 ${m.category}: ${m.message}`, content_type: 'race_control_alert', priority_score: 15 }),
        }, 5000).catch(() => {});
      }
    }

    await logSync('fetch-race-control', 'success', inserted, `${inserted} new messages`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-race-control', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/2 * * * *' };
