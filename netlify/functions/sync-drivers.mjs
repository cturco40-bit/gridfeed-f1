import { getSupabase, logSync } from './lib/supabase.mjs';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const SEASON = 2026;

const TEAM_COLORS = {
  red_bull: '#3671C6', ferrari: '#E8002D', mclaren: '#FF8000',
  mercedes: '#27F4D2', aston_martin: '#229971', alpine: '#0093CC',
  williams: '#64C4FF', rb: '#6692FF', sauber: '#52E252',
  haas: '#B6BABD',
};

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let driverCount = 0;
  let constructorCount = 0;

  try {
    // 1. Sync constructors
    const cRes = await fetch(`${JOLPICA}/${SEASON}/constructors.json`);
    if (cRes.ok) {
      const cJson = await cRes.json();
      const constructors = cJson?.MRData?.ConstructorTable?.Constructors || [];

      for (const c of constructors) {
        const row = {
          espn_id: c.constructorId,
          name: c.name,
          abbreviation: c.constructorId.toUpperCase().slice(0, 3),
          nationality: c.nationality,
          color_hex: TEAM_COLORS[c.constructorId] || '#8A8E9A',
          season: SEASON,
        };

        const { data: existing } = await sb
          .from('constructors')
          .select('id')
          .eq('espn_id', c.constructorId)
          .limit(1);

        if (existing?.length) {
          await sb.from('constructors').update(row).eq('id', existing[0].id);
        } else {
          await sb.from('constructors').insert(row);
        }
        constructorCount++;
      }
    }

    // 2. Sync drivers via standings (includes constructor link)
    const sRes = await fetch(`${JOLPICA}/${SEASON}/driverStandings.json`);
    if (sRes.ok) {
      const sJson = await sRes.json();
      const standings = sJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];

      for (const entry of standings) {
        const d = entry.Driver;
        const cId = entry.Constructors?.[0]?.constructorId;

        // Look up constructor UUID
        let teamId = null;
        if (cId) {
          const { data: cRow } = await sb
            .from('constructors')
            .select('id')
            .eq('espn_id', cId)
            .limit(1);
          if (cRow?.length) teamId = cRow[0].id;
        }

        const row = {
          espn_id: d.driverId,
          full_name: `${d.givenName} ${d.familyName}`,
          abbreviation: d.code || d.familyName?.slice(0, 3).toUpperCase(),
          number: d.permanentNumber ? parseInt(d.permanentNumber) : null,
          nationality: d.nationality,
          team_id: teamId,
          season: SEASON,
          active: true,
        };

        const { data: existing } = await sb
          .from('drivers')
          .select('id')
          .eq('espn_id', d.driverId)
          .limit(1);

        if (existing?.length) {
          await sb.from('drivers').update(row).eq('id', existing[0].id);
        } else {
          await sb.from('drivers').insert(row);
        }
        driverCount++;
      }
    } else {
      // Fallback: just fetch driver list without standings
      const dRes = await fetch(`${JOLPICA}/${SEASON}/drivers.json`);
      if (!dRes.ok) throw new Error(`Jolpica drivers HTTP ${dRes.status}`);
      const dJson = await dRes.json();
      const drivers = dJson?.MRData?.DriverTable?.Drivers || [];

      for (const d of drivers) {
        const row = {
          espn_id: d.driverId,
          full_name: `${d.givenName} ${d.familyName}`,
          abbreviation: d.code || d.familyName?.slice(0, 3).toUpperCase(),
          number: d.permanentNumber ? parseInt(d.permanentNumber) : null,
          nationality: d.nationality,
          season: SEASON,
          active: true,
        };

        const { data: existing } = await sb
          .from('drivers')
          .select('id')
          .eq('espn_id', d.driverId)
          .limit(1);

        if (existing?.length) {
          await sb.from('drivers').update(row).eq('id', existing[0].id);
        } else {
          await sb.from('drivers').insert(row);
        }
        driverCount++;
      }
    }

    const msg = `Synced ${constructorCount} constructors, ${driverCount} drivers`;
    await logSync(sb, {
      functionName: 'sync-drivers',
      status: 'success',
      recordsAffected: driverCount + constructorCount,
      message: msg,
      durationMs: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true, constructorCount, driverCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logSync(sb, {
      functionName: 'sync-drivers',
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
  schedule: '15 6 * * *',
  path: '/api/sync-drivers',
};
