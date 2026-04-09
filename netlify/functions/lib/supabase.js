import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function logSync(sb, { functionName, status, recordsAffected, message, durationMs, errorDetail }) {
  try {
    await sb.from('sync_log').insert({
      function_name: functionName,
      status,
      records_affected: recordsAffected || 0,
      message: (message || '').slice(0, 500),
      duration_ms: durationMs,
      error_detail: errorDetail || null,
    });
  } catch (e) {
    console.error('[logSync] Failed to write sync_log:', e.message);
  }
}

// Promise.race timeout — no AbortController
export function fetchWithTimeout(url, opts = {}, timeout = 8000) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms: ${url}`)), timeout)
    ),
  ]);
}

// Fuzzy-match an external name to a race in the races table
export async function matchRace(sb, externalName, season = 2026) {
  const { data: races } = await sb
    .from('races')
    .select('id, name, circuit, country, round')
    .eq('season', season);
  if (!races?.length) return null;

  const normalize = s => s.toLowerCase().replace(/grand prix/gi, '').replace(/gp/gi, '').trim();
  const needle = normalize(externalName);

  for (const r of races) {
    if (normalize(r.name).includes(needle) || needle.includes(normalize(r.name))) return r;
    if (normalize(r.circuit).includes(needle) || needle.includes(normalize(r.circuit))) return r;
    if (normalize(r.country).includes(needle) || needle.includes(normalize(r.country))) return r;
  }
  return null;
}

// Get the next upcoming race
export async function getNextRace(sb) {
  const { data } = await sb
    .from('races')
    .select('*')
    .eq('status', 'upcoming')
    .order('race_date', { ascending: true })
    .limit(1);
  return data?.[0] || null;
}

// Get current in_progress race
export async function getLiveRace(sb) {
  const { data } = await sb
    .from('races')
    .select('*')
    .eq('status', 'in_progress')
    .order('race_date', { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

// JSON response helper
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
