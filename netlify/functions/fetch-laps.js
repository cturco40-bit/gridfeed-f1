import { fetchWT, sb, logSync, json, getLatestSession, matchRaceId, isCancelledCircuit } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) { await logSync('fetch-laps', 'success', 0, 'No live session', Date.now() - start); return json({ ok: true, records: 0 }); }
    if (isCancelledCircuit(session)) { return json({ ok: true, skipped: 'Cancelled circuit' }); }

    const res = await fetchWT(`https://api.openf1.org/v1/laps?session_key=${session.session_key}`);
    if (!res.ok) { await logSync('fetch-laps', 'success', 0, `HTTP ${res.status}`, Date.now() - start); return json({ ok: true, records: 0 }); }
    const data = await res.json();
    if (!data?.length) { await logSync('fetch-laps', 'success', 0, 'No data', Date.now() - start); return json({ ok: true, records: 0 }); }

    const raceId = await matchRaceId(session.meeting_name || session.circuit_short_name || '');
    let inserted = 0;
    for (const lap of data) {
      const existing = await sb(`lap_times?session_key=eq.${session.session_key}&driver_number=eq.${lap.driver_number}&lap_number=eq.${lap.lap_number}&limit=1`);
      if (existing.length) continue;
      await sb('lap_times', 'POST', {
        race_id: raceId, session_key: session.session_key, driver_number: lap.driver_number,
        lap_number: lap.lap_number, lap_duration: lap.lap_duration,
        sector_1: lap.duration_sector_1, sector_2: lap.duration_sector_2, sector_3: lap.duration_sector_3,
        i1_speed: lap.i1_speed, i2_speed: lap.i2_speed, st_speed: lap.st_speed,
        is_pit_out_lap: lap.is_pit_out_lap || false, is_personal_best: lap.is_personal_best || false,
        fetched_at: new Date().toISOString(),
      });
      inserted++;
    }

    await logSync('fetch-laps', 'success', inserted, `${inserted} laps`, Date.now() - start);
    return json({ ok: true, records: inserted });
  } catch (err) {
    await logSync('fetch-laps', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

