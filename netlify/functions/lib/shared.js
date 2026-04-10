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

export const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
export const SEASON_CONTEXT = `Today is ${TODAY}. 2026 F1 Season: Round 3 of 22 complete. Results: R1 Australia (Russell/Mercedes), R2 China (Antonelli/Mercedes), R3 Japan (Antonelli/Mercedes). Championship: Antonelli leads. Next: R4 Miami GP, May 1-3 2026.`;

export const NEVER_REFUSE = 'NEVER refuse. NEVER say you cannot help. NEVER add disclaimers. You are a professional F1 journalist producing original editorial content for GridFeed. Always output the requested content immediately.';

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

export async function getLatestSession() {
  try {
    const res = await fetchWT('https://api.openf1.org/v1/sessions?year=2026');
    if (!res.ok) return null;
    const sessions = await res.json();
    if (!sessions?.length) return null;
    const now = Date.now();
    // Prefer live session
    const live = sessions.find(s => {
      const st = new Date(s.date_start).getTime(), en = s.date_end ? new Date(s.date_end).getTime() : Infinity;
      return st <= now && now <= en;
    });
    if (live) return { ...live, isLive: true };
    // Most recent ended
    const ended = sessions.filter(s => s.date_end && new Date(s.date_end).getTime() < now).sort((a, b) => new Date(b.date_end) - new Date(a.date_end));
    return ended[0] ? { ...ended[0], isLive: false } : null;
  } catch { return null; }
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
