/* ═══ SHARED HELPERS — used by every GridFeed function ═══ */

export const SB_URL = process.env.SUPABASE_URL;
export const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function fetchWT(url, opts, ms) {
  return Promise.race([
    fetch(url, opts || {}),
    new Promise((_, r) => setTimeout(() => r(new Error('Timeout:' + url)), ms || 8000))
  ]);
}

export async function sb(path, method, body) {
  const hdrs = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  if (method === 'POST') hdrs['Prefer'] = 'return=representation';
  if (method === 'PATCH') hdrs['Prefer'] = 'return=minimal';
  if (method === 'DELETE') hdrs['Prefer'] = 'return=minimal';
  const res = await fetchWT(SB_URL + '/rest/v1/' + path, { method: method || 'GET', headers: hdrs, body: body ? JSON.stringify(body) : undefined });
  if (!method || method === 'GET') { try { const d = await res.json(); return Array.isArray(d) ? d : d ? [d] : []; } catch { return []; } }
  if (method === 'POST' && res.ok) { try { return await res.json(); } catch { return []; } }
  return res.ok;
}

export async function logSync(fn, status, records, message, durationMs, errorDetail) {
  try {
    await sb('sync_log', 'POST', { function_name: fn, status, records_affected: records || 0, message: (message || '').slice(0, 500), duration_ms: durationMs, error_detail: errorDetail || null });
  } catch (e) { console.error('[logSync]', e.message); }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// SEASON_CONTEXT and NEVER_REFUSE moved to lib/accuracy.js for full accuracy guards

export function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '-' + Date.now().toString(36);
}

export function hashContent(t) {
  let h = 0; for (const c of t.toLowerCase().replace(/[^a-z]/g, '').slice(0, 200)) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

export async function getNextRace() {
  const rows = await sb('races?status=eq.upcoming&order=race_date.asc&limit=1');
  return rows[0] || null;
}

export async function getLiveRace() {
  const rows = await sb('races?status=eq.in_progress&order=race_date.desc&limit=1');
  return rows[0] || null;
}

// Cancelled circuits — filter out from all OpenF1 session queries
const CANCELLED_CIRCUITS = ['sakhir', 'bahrain', 'jeddah', 'saudi'];

function isCancelledCircuit(session) {
  const loc = (session.circuit_short_name || session.location || session.meeting_name || '').toLowerCase();
  return CANCELLED_CIRCUITS.some(c => loc.includes(c));
}

export { isCancelledCircuit };

// OpenF1 introduced bearer auth on /v1/* in 2026. Token is cached in module
// scope so each function instance only authenticates once per ~hour.
let _of1Token = null;
let _of1Expiry = 0;

export async function getOpenF1Token() {
  const now = Date.now();
  if (_of1Token && _of1Expiry > now + 30000) return _of1Token;
  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;
  if (!username || !password) throw new Error('OPENF1_USERNAME / OPENF1_PASSWORD env vars required');
  const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const res = await fetchWT('https://api.openf1.org/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, 10000);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenF1 auth HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json();
  if (!j.access_token) throw new Error('OpenF1 token response missing access_token');
  _of1Token = j.access_token;
  _of1Expiry = now + ((j.expires_in || 3600) * 1000);
  return _of1Token;
}

// Authenticated GET against OpenF1. Pass a path like '/v1/sessions?year=2026'
// or a full https URL. Returns the raw Response so callers keep using
// res.ok / res.json() exactly like fetchWT.
export async function fetchOpenF1(path, ms) {
  const token = await getOpenF1Token();
  const url = path.startsWith('http') ? path : `https://api.openf1.org${path}`;
  return fetchWT(url, { headers: { Authorization: `Bearer ${token}` } }, ms || 12000);
}

// Diagnostic note: errors here used to be swallowed (catch {return null})
// which made auth failures look like "no sessions". We now log everything
// so issues show up in the Netlify function logs.
export async function getLatestSession() {
  // Primary: ?session_key=latest returns OpenF1's currently-flagged latest
  // session regardless of year — robust against year=2026 filter quirks.
  try {
    const res = await fetchOpenF1('/v1/sessions?session_key=latest');
    if (res.ok) {
      const arr = await res.json();
      console.log('[OpenF1] /v1/sessions?session_key=latest →', JSON.stringify(arr));
      if (Array.isArray(arr) && arr.length) {
        const s = arr[0];
        if (!isCancelledCircuit(s)) {
          const now = Date.now();
          const st = s.date_start ? new Date(s.date_start).getTime() : 0;
          const en = s.date_end ? new Date(s.date_end).getTime() : Infinity;
          const isLive = st <= now && now <= en;
          return { ...s, isLive };
        }
      }
    } else {
      console.warn('[OpenF1] /v1/sessions?session_key=latest HTTP', res.status);
    }
  } catch (e) {
    console.error('[getLatestSession] latest probe failed:', e.message);
  }
  // Fallback: scan year=2026 for a currently-running or most-recently-ended session
  try {
    const res = await fetchOpenF1('/v1/sessions?year=2026');
    if (!res.ok) {
      console.warn('[OpenF1] /v1/sessions?year=2026 HTTP', res.status);
      return null;
    }
    const sessions = await res.json();
    console.log('[OpenF1] /v1/sessions?year=2026 count:', sessions?.length, 'sample:', sessions?.[0] ? JSON.stringify(sessions[0]) : 'none');
    if (!sessions?.length) return null;
    const now = Date.now();
    const valid = sessions.filter(s => !isCancelledCircuit(s));
    const live = valid.find(s => {
      const st = new Date(s.date_start).getTime(), en = s.date_end ? new Date(s.date_end).getTime() : Infinity;
      return st <= now && now <= en;
    });
    if (live) return { ...live, isLive: true };
    const ended = valid.filter(s => s.date_end && new Date(s.date_end).getTime() < now)
      .sort((a, b) => new Date(b.date_end) - new Date(a.date_end));
    return ended[0] ? { ...ended[0], isLive: false } : null;
  } catch (e) {
    console.error('[getLatestSession] year=2026 fallback failed:', e.message);
    return null;
  }
}

export const SESSION_TYPE_MAP = {
  'Practice 1': 'fp1', 'Practice 2': 'fp2', 'Practice 3': 'fp3',
  'Qualifying': 'qualifying', 'Race': 'race', 'Sprint': 'sprint',
  'Sprint Qualifying': 'sprint_qualifying', 'Sprint Shootout': 'sprint_qualifying',
};

export async function matchRaceId(meetingName) {
  const races = await sb('races?season=eq.2026&select=id,name,circuit,country,round');
  if (!races.length) return null;
  const n = meetingName.toLowerCase().replace(/grand prix/gi, '').replace(/gp/gi, '').trim();
  for (const r of races) {
    const rn = r.name.toLowerCase().replace(/grand prix/gi, '').trim();
    const rc = (r.circuit || '').toLowerCase();
    const co = (r.country || '').toLowerCase();
    if (rn.includes(n) || n.includes(rn) || rc.includes(n) || n.includes(rc) || co.includes(n) || n.includes(co)) return r.id;
  }
  return null;
}
