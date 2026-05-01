import { sb, logSync, json, getLatestSession, fetchOpenF1 } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session) {
      await logSync('fetch-weather', 'success', 0, 'No session', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const res = await fetchOpenF1(`/v1/weather?session_key=${session.session_key}`);
    if (!res.ok) {
      await logSync('fetch-weather', 'success', 0, `No weather available (HTTP ${res.status}) for session ${session.session_key}`, Date.now() - start);
      return json({ ok: true, records: 0, reason: `HTTP ${res.status}` });
    }
    const data = await res.json();
    if (!data?.length) {
      await logSync('fetch-weather', 'success', 0, 'No weather data', Date.now() - start);
      return json({ ok: true, records: 0 });
    }

    const latest = data[data.length - 1];
    // Delete old for this session + insert fresh
    await sb(`weather_data?session_key=eq.${session.session_key}`, 'DELETE');
    await sb('weather_data', 'POST', {
      session_key: String(session.session_key), air_temp: latest.air_temperature,
      track_temp: latest.track_temperature, humidity: latest.humidity,
      wind_speed: latest.wind_speed, wind_direction: latest.wind_direction,
      rainfall: latest.rainfall > 0, fetched_at: new Date().toISOString(),
    });

    await logSync('fetch-weather', 'success', 1, `Air:${latest.air_temperature}°C Track:${latest.track_temperature}°C Rain:${latest.rainfall > 0}`, Date.now() - start);
    return json({ ok: true, records: 1, air: latest.air_temperature, track: latest.track_temperature });
  } catch (err) {
    await logSync('fetch-weather', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

