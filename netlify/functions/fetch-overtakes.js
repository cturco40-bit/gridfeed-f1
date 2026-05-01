import { sb, logSync, json, getLatestSession, matchRaceId, isCancelledCircuit, fetchOpenF1 } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) { await logSync('fetch-overtakes', 'success', 0, 'No live session', Date.now() - start); return json({ ok: true, records: 0 }); }
    if (isCancelledCircuit(session)) { return json({ ok: true, skipped: 'Cancelled circuit' }); }

    const res = await fetchOpenF1(`/v1/overtaking?session_key=${session.session_key}`);
    if (!res.ok) { await logSync('fetch-overtakes', 'success', 0, `HTTP ${res.status}`, Date.now() - start); return json({ ok: true, records: 0 }); }
    const data = await res.json();
    if (!data?.length) { await logSync('fetch-overtakes', 'success', 0, 'No data', Date.now() - start); return json({ ok: true, records: 0 }); }

    const raceId = await matchRaceId(session.meeting_name || session.circuit_short_name || '');
    let inserted = 0;
    for (const ot of data) {
      const existing = await sb(`overtakes?session_key=eq.${session.session_key}&date=eq.${encodeURIComponent(ot.date)}&overtaking_driver_number=eq.${ot.overtaking_car_number}&limit=1`);
      if (existing.length) continue;
      await sb('overtakes', 'POST', {
        race_id: raceId, session_key: session.session_key,
        overtaking_driver_number: ot.overtaking_car_number, overtaken_driver_number: ot.overtaken_car_number,
        position: ot.position, date: ot.date, created_at: new Date().toISOString(),
      });
      inserted++;
    }

    await logSync('fetch-overtakes', 'success', inserted, `${inserted} overtakes`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-overtakes', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

