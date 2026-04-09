import { getSupabase, logSync } from './lib/supabase.mjs';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const SEASON = 2026;

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let count = 0;

  try {
    // Fetch race calendar
    const res = await fetch(`${JOLPICA}/${SEASON}.json`);
    if (!res.ok) throw new Error(`Jolpica calendar HTTP ${res.status}`);
    const json = await res.json();
    const races = json?.MRData?.RaceTable?.Races || [];
    if (!races.length) throw new Error('No races returned from Jolpica');

    for (const race of races) {
      const raceDate = race.time
        ? `${race.date}T${race.time}`
        : `${race.date}T14:00:00Z`;

      const row = {
        name: race.raceName,
        circuit: race.Circuit?.circuitName,
        country: race.Circuit?.Location?.country,
        race_date: raceDate,
        season: SEASON,
        round: parseInt(race.round),
        espn_id: race.Circuit?.circuitId,
      };

      // Check if race exists for this season+round
      const { data: existing } = await sb
        .from('races')
        .select('id')
        .eq('season', SEASON)
        .eq('round', row.round)
        .limit(1);

      if (existing?.length) {
        await sb.from('races').update(row).eq('id', existing[0].id);
      } else {
        await sb.from('races').insert(row);
      }
      count++;

      // Sync session schedule if available
      const sessions = [];
      if (race.FirstPractice) sessions.push({ type: 'fp1', name: 'Practice 1', at: `${race.FirstPractice.date}T${race.FirstPractice.time || '12:00:00Z'}` });
      if (race.SecondPractice) sessions.push({ type: 'fp2', name: 'Practice 2', at: `${race.SecondPractice.date}T${race.SecondPractice.time || '12:00:00Z'}` });
      if (race.ThirdPractice) sessions.push({ type: 'fp3', name: 'Practice 3', at: `${race.ThirdPractice.date}T${race.ThirdPractice.time || '12:00:00Z'}` });
      if (race.Qualifying) sessions.push({ type: 'qualifying', name: 'Qualifying', at: `${race.Qualifying.date}T${race.Qualifying.time || '14:00:00Z'}` });
      if (race.Sprint) sessions.push({ type: 'sprint', name: 'Sprint', at: `${race.Sprint.date}T${race.Sprint.time || '14:00:00Z'}` });

      if (sessions.length) {
        // Get race_id
        const { data: raceRow } = await sb
          .from('races')
          .select('id')
          .eq('season', SEASON)
          .eq('round', parseInt(race.round))
          .limit(1);

        if (raceRow?.length) {
          const raceId = raceRow[0].id;
          // Add race session itself
          sessions.push({ type: 'race', name: 'Race', at: raceDate });

          for (const s of sessions) {
            const { data: existingSess } = await sb
              .from('schedule')
              .select('id')
              .eq('race_id', raceId)
              .eq('session_type', s.type)
              .limit(1);

            const sessRow = {
              race_id: raceId,
              session_type: s.type,
              session_name: s.name,
              scheduled_at: s.at,
            };

            if (existingSess?.length) {
              await sb.from('schedule').update(sessRow).eq('id', existingSess[0].id);
            } else {
              await sb.from('schedule').insert(sessRow);
            }
          }
        }
      }
    }

    await logSync(sb, {
      functionName: 'sync-races',
      status: 'success',
      recordsAffected: count,
      message: `Synced ${count} races for ${SEASON}`,
      durationMs: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true, count }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logSync(sb, {
      functionName: 'sync-races',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  schedule: '0 6 * * *',
};
