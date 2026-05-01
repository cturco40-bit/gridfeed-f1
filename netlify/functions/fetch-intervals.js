import { sb, logSync, json, getLatestSession, matchRaceId, SESSION_TYPE_MAP, isCancelledCircuit, fetchOpenF1 } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) { await logSync('fetch-intervals', 'success', 0, 'No live session', Date.now() - start); return json({ ok: true, records: 0 }); }
    if (isCancelledCircuit(session)) { return json({ ok: true, skipped: 'Cancelled circuit' }); }

    const res = await fetchOpenF1(`/v1/intervals?session_key=${session.session_key}`);
    if (!res.ok) { await logSync('fetch-intervals', 'success', 0, `HTTP ${res.status}`, Date.now() - start); return json({ ok: true, records: 0 }); }
    const data = await res.json();
    if (!data?.length) { await logSync('fetch-intervals', 'success', 0, 'No data', Date.now() - start); return json({ ok: true, records: 0 }); }

    const raceId = await matchRaceId(session.meeting_name || session.circuit_short_name || '');
    const latest = {};
    data.forEach(d => { if (!latest[d.driver_number] || d.date > latest[d.driver_number].date) latest[d.driver_number] = d; });

    await sb(`intervals?session_key=eq.${session.session_key}`, 'DELETE');
    const rows = Object.values(latest).map(d => ({
      race_id: raceId, session_key: session.session_key, driver_number: d.driver_number,
      gap_to_leader: d.gap_to_leader != null ? String(d.gap_to_leader) : null,
      interval: d.interval != null ? String(d.interval) : null,
      date: d.date, fetched_at: new Date().toISOString(),
    }));
    if (rows.length) await sb('intervals', 'POST', rows);

    await logSync('fetch-intervals', 'success', rows.length, `${rows.length} intervals`, Date.now() - start);
    return json({ ok: true, records: rows.length });
  } catch (err) {
    await logSync('fetch-intervals', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

