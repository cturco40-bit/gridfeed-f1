import { json, getLatestSession, SESSION_TYPE_MAP } from './lib/shared.js';

// Returns the current OpenF1 session so the frontend LIVE indicator activates
// across FP1 / Sprint Qualifying / Sprint / Qualifying / Race — not just the
// Sunday race. Decoupled from races.status (which fetch-timing only flips
// once the race date has passed).
//
// Cache 20s at the edge: getLatestSession() makes an outbound call to OpenF1
// and the frontend polls every 30s, so a short edge cache cuts OpenF1 load
// when traffic ramps without making the indicator feel stale.

export default async (req) => {
  const session = await getLatestSession();
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=20, s-maxage=20',
    'Access-Control-Allow-Origin': '*',
  };
  if (!session) {
    return new Response(JSON.stringify({ isLive: false }), { status: 200, headers });
  }
  const body = {
    isLive: !!session.isLive,
    session_key: session.session_key,
    session_name: session.session_name,
    session_type: SESSION_TYPE_MAP[session.session_name] || 'race',
    meeting_name: session.meeting_name || session.circuit_short_name || '',
    date_start: session.date_start || null,
    date_end: session.date_end || null,
  };
  return new Response(JSON.stringify(body), { status: 200, headers });
};
