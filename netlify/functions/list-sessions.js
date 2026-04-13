import { fetchWT, logSync, json } from './lib/shared.js';

/* Return the list of completed 2026 sessions (qualifying + race)
 * so the frontend can populate the telemetry session dropdown.
 */
export default async (req) => {
  const start = Date.now();
  try {
    const res = await fetchWT('https://api.openf1.org/v1/sessions?year=2026', {}, 10000);
    if (!res.ok) throw new Error(`Sessions API ${res.status}`);
    const sessions = await res.json();
    const now = Date.now();
    const completed = (sessions || [])
      .filter(s => s.session_type !== 'Practice')
      .filter(s => s.date_end && new Date(s.date_end).getTime() < now)
      .map(s => ({
        session_key: s.session_key,
        session_name: s.session_name,
        session_type: s.session_type,
        meeting_name: s.meeting_name,
        circuit_short_name: s.circuit_short_name,
        country_code: s.country_code,
        date_start: s.date_start,
      }))
      .sort((a, b) => new Date(b.date_start) - new Date(a.date_start));

    await logSync('list-sessions', 'success', completed.length, `${completed.length} completed 2026 sessions`, Date.now() - start);
    return new Response(JSON.stringify({ sessions: completed }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
    });
  } catch (err) {
    await logSync('list-sessions', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
