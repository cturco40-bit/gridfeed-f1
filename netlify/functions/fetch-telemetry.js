import { logSync, json, fetchOpenF1 } from './lib/shared.js';

/* Fetch telemetry for a driver's fastest personal-best lap in a given session.
 * Called on-demand from the frontend. NOT scheduled.
 *
 * Query params:
 *   session_key: OpenF1 session key (e.g. 9506)
 *   driver:      driver number (e.g. 1)
 */

export default async (req) => {
  const start = Date.now();
  try {
    const url = new URL(req.url);
    const sessionKey = url.searchParams.get('session_key');
    const driverNumber = url.searchParams.get('driver');

    if (!sessionKey || !driverNumber) {
      return json({ error: 'Missing params: session_key and driver required' }, 400);
    }

    // 1. Get all personal-best laps for this driver in this session
    const lapsRes = await fetchOpenF1(
      `/v1/laps?session_key=${sessionKey}&driver_number=${driverNumber}&is_pit_out_lap=false`,
      10000
    );
    if (!lapsRes.ok) throw new Error(`Laps API ${lapsRes.status}`);
    const laps = await lapsRes.json();
    if (!Array.isArray(laps) || !laps.length) {
      return json({ error: 'No laps found for this driver in this session' }, 404);
    }

    // 2. Find the fastest valid lap
    const validLaps = laps.filter(l => l.lap_duration && l.lap_duration > 0 && l.date_start);
    if (!validLaps.length) {
      return json({ error: 'No valid laps with telemetry available' }, 404);
    }
    const fastestLap = validLaps.reduce((a, b) => (a.lap_duration < b.lap_duration ? a : b));

    // 3. Compute the lap window
    const lapStart = new Date(fastestLap.date_start).toISOString();
    const lapEnd = new Date(new Date(fastestLap.date_start).getTime() + (fastestLap.lap_duration * 1000)).toISOString();

    // 4. Fetch car_data (telemetry) for that window
    const telPath = `/v1/car_data?session_key=${sessionKey}&driver_number=${driverNumber}&date>=${encodeURIComponent(lapStart)}&date<=${encodeURIComponent(lapEnd)}`;
    const telRes = await fetchOpenF1(telPath, 20000);
    if (!telRes.ok) throw new Error(`Telemetry API ${telRes.status}`);
    const telemetry = await telRes.json();

    if (!Array.isArray(telemetry) || !telemetry.length) {
      return json({ error: 'No telemetry points returned for this lap' }, 404);
    }

    // 5. Downsample if needed and simplify (car_data runs at ~4Hz so a 90s lap = ~360 points)
    const data = telemetry
      .map(t => ({
        ts: new Date(t.date).getTime(),
        speed: t.speed ?? 0,
        throttle: t.throttle ?? 0,
        brake: (t.brake || 0) > 0 ? 100 : 0,
        gear: t.n_gear ?? 0,
        rpm: t.rpm ?? 0,
      }))
      .sort((a, b) => a.ts - b.ts);

    await logSync('fetch-telemetry', 'success', data.length, `D${driverNumber} lap ${fastestLap.lap_number}: ${data.length} points`, Date.now() - start);

    return new Response(JSON.stringify({
      driver_number: parseInt(driverNumber),
      lap_number: fastestLap.lap_number,
      lap_time: fastestLap.lap_duration,
      sector_1: fastestLap.duration_sector_1,
      sector_2: fastestLap.duration_sector_2,
      sector_3: fastestLap.duration_sector_3,
      data,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    await logSync('fetch-telemetry', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
