import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function logSync(sb, { functionName, status, recordsAffected, message, durationMs, errorDetail }) {
  await sb.from('sync_log').insert({
    function_name: functionName,
    status,
    records_affected: recordsAffected || 0,
    message,
    duration_ms: durationMs,
    error_detail: errorDetail || null,
  });
}

// Fuzzy match an external race/event name to a race_id in the races table
export async function matchRace(sb, externalName, season = 2026) {
  const { data: races } = await sb.from('races').select('id, name, circuit, country, round').eq('season', season);
  if (!races?.length) return null;

  const normalize = s => s.toLowerCase().replace(/grand prix/gi, '').replace(/gp/gi, '').trim();
  const needle = normalize(externalName);

  // Try exact-ish match on name, circuit, or country
  for (const r of races) {
    if (normalize(r.name).includes(needle) || needle.includes(normalize(r.name))) return r;
    if (normalize(r.circuit).includes(needle) || needle.includes(normalize(r.circuit))) return r;
    if (normalize(r.country).includes(needle) || needle.includes(normalize(r.country))) return r;
  }
  return null;
}
