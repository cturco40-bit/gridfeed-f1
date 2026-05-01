import { sb, logSync, json, getLatestSession, matchRaceId, fetchOpenF1 } from './lib/shared.js';

// Pulls car X/Y positions from OpenF1 /v1/location during a live session and
// inserts new points into car_locations. Schedule on a 1-min cron during race
// weekends so the live track map can build up enough P1 history (~100 points)
// to render the track path before the frontend tries to draw it.
//
// Dedup: queries the max existing `date` for the current session_key and skips
// anything older. car_locations has no unique constraint, so this is the
// cheapest way to keep overlapping fetch windows from duplicating rows.

export default async (req, context) => {
  const start = Date.now();
  let totalRecords = 0;
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      const reason = !session
        ? 'getLatestSession returned null — check function logs for the OpenF1 response (likely auth or empty sessions feed)'
        : `Session ${session.session_name} (key=${session.session_key}) not live yet — starts ${session.date_start}`;
      await logSync('fetch-locations', 'success', 0, reason, Date.now() - start);
      return json({ ok: true, totalRecords: 0, reason: 'not_live' });
    }

    const meetingLabel = session.meeting_name || session.circuit_short_name || '';
    const raceId = await matchRaceId(meetingLabel);

    // 75s window covers a 60s cron cadence with 15s slack for cron jitter.
    const since = new Date(Date.now() - 75 * 1000).toISOString();
    const path = `/v1/location?session_key=${session.session_key}&date>=${encodeURIComponent(since)}`;
    const res = await fetchOpenF1(path, 20000);
    if (!res.ok) throw new Error(`OpenF1 location HTTP ${res.status}`);
    const locs = await res.json();
    if (!Array.isArray(locs) || !locs.length) {
      await logSync('fetch-locations', 'success', 0, `No location data in window (${session.session_name})`, Date.now() - start);
      return json({ ok: true, totalRecords: 0, reason: 'no_data' });
    }

    // OpenF1 returns null x/y for cars parked in the pits between laps
    let valid = locs.filter(l => Number.isFinite(l.x) && Number.isFinite(l.y) && l.driver_number != null && l.date);

    // Dedup against rows already in the DB for this session_key
    const existing = await sb(`car_locations?session_key=eq.${session.session_key}&select=date&order=date.desc&limit=1`);
    const lastDate = existing?.[0]?.date;
    if (lastDate) valid = valid.filter(l => l.date > lastDate);

    if (!valid.length) {
      await logSync('fetch-locations', 'success', 0, `Up to date (${session.session_name})`, Date.now() - start);
      return json({ ok: true, totalRecords: 0, reason: 'no_new' });
    }

    const rows = valid.map(l => ({
      race_id: raceId,
      session_key: session.session_key,
      driver_number: l.driver_number,
      x: Math.round(l.x), y: Math.round(l.y), z: l.z != null ? Math.round(l.z) : null,
      date: l.date,
    }));

    // Chunk inserts — a 75s window across 20 drivers at ~3.7Hz can be ~5500
    // rows; Supabase REST chokes on requests over a few MB.
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await sb('car_locations', 'POST', rows.slice(i, i + CHUNK));
    }
    totalRecords = rows.length;

    await logSync('fetch-locations', 'success', totalRecords, `${meetingLabel} ${session.session_name}: ${totalRecords} location points`, Date.now() - start);
    return json({ ok: true, totalRecords, session: session.session_name });
  } catch (err) {
    await logSync('fetch-locations', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};
