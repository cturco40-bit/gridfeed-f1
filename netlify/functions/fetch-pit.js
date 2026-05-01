import { sb, logSync, json, getLatestSession, matchRaceId, isCancelledCircuit, fetchOpenF1 } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) { await logSync('fetch-pit', 'success', 0, 'No live session', Date.now() - start); return json({ ok: true, records: 0 }); }
    if (isCancelledCircuit(session)) { return json({ ok: true, skipped: 'Cancelled circuit' }); }

    const res = await fetchOpenF1(`/v1/pit?session_key=${session.session_key}`);
    if (!res.ok) { await logSync('fetch-pit', 'success', 0, `HTTP ${res.status}`, Date.now() - start); return json({ ok: true, records: 0 }); }
    const data = await res.json();
    if (!data?.length) { await logSync('fetch-pit', 'success', 0, 'No data', Date.now() - start); return json({ ok: true, records: 0 }); }

    const raceId = await matchRaceId(session.meeting_name || session.circuit_short_name || '');
    let inserted = 0;
    for (const pit of data) {
      const existing = await sb(`pit_stops?session_key=eq.${session.session_key}&driver_number=eq.${pit.driver_number}&lap_number=eq.${pit.lap_number}&limit=1`);
      if (existing.length) continue;
      await sb('pit_stops', 'POST', {
        race_id: raceId, session_key: session.session_key, driver_number: pit.driver_number,
        lap_number: pit.lap_number, stop_duration: pit.pit_duration,
        lane_duration: pit.pit_duration, date: pit.date, fetched_at: new Date().toISOString(),
      });
      inserted++;
    }

    await logSync('fetch-pit', 'success', inserted, `${inserted} pit stops`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-pit', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

