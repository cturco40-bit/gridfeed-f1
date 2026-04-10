import { fetchWT, sb, logSync, json, getLatestSession } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      await logSync('fetch-strategy', 'success', 0, 'No live session', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const [stintRes, pitRes, drvRes] = await Promise.all([
      fetchWT(`https://api.openf1.org/v1/stints?session_key=${session.session_key}`),
      fetchWT(`https://api.openf1.org/v1/pit?session_key=${session.session_key}`).catch(() => ({ ok: false })),
      fetchWT(`https://api.openf1.org/v1/drivers?session_key=${session.session_key}`).catch(() => ({ ok: false })),
    ]);

    if (!stintRes.ok) {
      await logSync('fetch-strategy', 'success', 0, `No stint data (HTTP ${stintRes.status})`, Date.now() - start);
      return json({ ok: true, records: 0 });
    }
    const stints = await stintRes.json();
    const pits = pitRes.ok ? await pitRes.json() : [];
    const drivers = drvRes.ok ? await drvRes.json() : [];
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    // Build pit duration map
    const pitMap = {};
    pits.forEach(p => { pitMap[`${p.driver_number}-${p.lap_number}`] = p.pit_duration; });

    // Delete + insert
    await sb(`strategy?session_key=eq.${session.session_key}`, 'DELETE');

    const rows = stints.map(s => {
      const d = driverMap[s.driver_number] || {};
      return {
        session_key: String(session.session_key), driver_number: s.driver_number,
        driver_name: d.full_name || d.broadcast_name || `#${s.driver_number}`,
        team_name: d.team_name || '', stint_number: s.stint_number, compound: s.compound,
        lap_start: s.lap_start, lap_end: s.lap_end, tyre_age: s.tyre_age_at_start,
        pit_duration: pitMap[`${s.driver_number}-${s.lap_end}`] || null,
        fetched_at: new Date().toISOString(),
      };
    });

    if (rows.length) await sb('strategy', 'POST', rows);

    await logSync('fetch-strategy', 'success', rows.length, `${rows.length} stints`, Date.now() - start);
    return json({ ok: true, records: rows.length });
  } catch (err) {
    await logSync('fetch-strategy', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/2 * * * *' };
