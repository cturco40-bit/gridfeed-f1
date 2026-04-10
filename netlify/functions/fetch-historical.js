import { fetchWT, sb, logSync, json } from './lib/shared.js';

const COMPLETED_RACES = [
  { name: 'Australian Grand Prix', circuit: 'albert_park', round: 1 },
  { name: 'Chinese Grand Prix', circuit: 'shanghai', round: 2 },
  { name: 'Japanese Grand Prix', circuit: 'suzuka', round: 3 },
];

export default async (req, context) => {
  const start = Date.now();
  let totalRecords = 0;
  try {
    // Fetch 2026 completed race data from OpenF1
    const sessRes = await fetchWT('https://api.openf1.org/v1/sessions?year=2026&session_name=Race');
    const sessions = sessRes.ok ? await sessRes.json() : [];

    for (const sess of sessions) {
      if (!sess.date_end || new Date(sess.date_end) > new Date()) continue;

      // Check if already stored
      const existing = await sb(`historical_performance?session_key=eq.${sess.session_key}&limit=1`);
      if (existing.length) continue;

      const [posRes, drvRes, stintRes, pitRes] = await Promise.all([
        fetchWT(`https://api.openf1.org/v1/position?session_key=${sess.session_key}`).catch(() => ({ ok: false })),
        fetchWT(`https://api.openf1.org/v1/drivers?session_key=${sess.session_key}`).catch(() => ({ ok: false })),
        fetchWT(`https://api.openf1.org/v1/stints?session_key=${sess.session_key}`).catch(() => ({ ok: false })),
        fetchWT(`https://api.openf1.org/v1/pit?session_key=${sess.session_key}`).catch(() => ({ ok: false })),
      ]);

      const positions = posRes.ok ? await posRes.json() : [];
      const drivers = drvRes.ok ? await drvRes.json() : [];
      const stintsData = stintRes.ok ? await stintRes.json() : [];
      const pitsData = pitRes.ok ? await pitRes.json() : [];

      const driverMap = {};
      drivers.forEach(d => { driverMap[d.driver_number] = d; });

      // Final positions
      const finalPos = {};
      positions.forEach(p => {
        if (!finalPos[p.driver_number] || p.date > finalPos[p.driver_number].date) finalPos[p.driver_number] = p;
      });

      const rows = Object.values(finalPos).map(p => {
        const d = driverMap[p.driver_number] || {};
        const driverStints = stintsData.filter(s => s.driver_number === p.driver_number);
        const driverPits = pitsData.filter(pit => pit.driver_number === p.driver_number);
        const avgPit = driverPits.length ? driverPits.reduce((s, pit) => s + (pit.pit_duration || 0), 0) / driverPits.length : null;
        return {
          season: 2026, race_name: sess.meeting_name || sess.circuit_short_name,
          circuit: sess.circuit_short_name || '', driver_name: d.full_name || `#${p.driver_number}`,
          team_name: d.team_name || '', finish_position: p.position, grid_position: null,
          pit_stops: driverPits.length, avg_pit_time: avgPit ? parseFloat(avgPit.toFixed(2)) : null,
          tyre_strategy: driverStints.map(s => s.compound).join('-') || null,
          session_key: String(sess.session_key),
        };
      });

      if (rows.length) { await sb('historical_performance', 'POST', rows); totalRecords += rows.length; }
    }

    // Circuit history from Jolpica (last 3 years)
    for (const race of COMPLETED_RACES) {
      for (const year of [2023, 2024, 2025]) {
        try {
          const res = await fetchWT(`https://api.jolpi.ca/ergast/f1/${year}/circuits/${race.circuit}/results.json`);
          if (!res.ok) continue;
          const jData = await res.json();
          const results = jData?.MRData?.RaceTable?.Races?.[0]?.Results || [];
          for (const r of results.slice(0, 10)) {
            const existing = await sb(`circuit_performance?circuit=eq.${race.circuit}&driver_name=eq.${encodeURIComponent(r.Driver?.familyName || '')}&season=eq.${year}&limit=1`);
            if (existing.length) continue;
            await sb('circuit_performance', 'POST', {
              circuit: race.circuit, driver_name: `${r.Driver?.givenName} ${r.Driver?.familyName}`,
              team_name: r.Constructor?.name || '', season: year,
              finish_position: parseInt(r.position), grid_position: parseInt(r.grid),
              dnf: r.status !== 'Finished' && !r.status?.includes('Lap'),
            });
            totalRecords++;
          }
        } catch { continue; }
      }
    }

    await logSync('fetch-historical', 'success', totalRecords, `${totalRecords} historical records`, Date.now() - start);
    return json({ ok: true, totalRecords });
  } catch (err) {
    await logSync('fetch-historical', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 4 * * *' };
