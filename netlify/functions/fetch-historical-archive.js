import { fetchWT, sb, logSync, json } from './lib/shared.js';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

export default async (req) => {
  const start = Date.now();
  let total = 0;
  try {
    for (const season of SEASONS) {
      const existingRounds = await sb(`historical_races?season=eq.${season}&select=round`);
      const doneRounds = new Set(existingRounds.map(r => r.round));

      // Paginate through all races — API returns ~6 races per page (~120 results)
      let offset = 0;
      let allRaces = [];
      while (true) {
        const r = await fetchWT(`${JOLPICA}/${season}/results.json?limit=100&offset=${offset}`, {}, 30000);
        if (!r.ok) { console.warn(`Failed ${season} offset ${offset}: ${r.status}`); break; }
        const data = await r.json();
        const races = data?.MRData?.RaceTable?.Races || [];
        if (!races.length) break;
        allRaces.push(...races);
        const totalResults = parseInt(data?.MRData?.total || '0');
        offset += 100;
        if (offset >= totalResults) break;
      }

      console.log(`Season ${season}: ${allRaces.length} races from API, ${doneRounds.size} already imported`);

      for (const race of allRaces) {
        if (!race.Results?.length) continue;
        const rnd = parseInt(race.round);
        if (doneRounds.has(rnd)) continue;

        const results = race.Results.map(r => ({
          pos: parseInt(r.position),
          driver: `${r.Driver.givenName} ${r.Driver.familyName}`,
          driverId: r.Driver.driverId,
          team: r.Constructor.name,
          teamId: r.Constructor.constructorId,
          grid: parseInt(r.grid),
          time: r.Time?.time || r.status,
          points: parseFloat(r.points),
          laps: parseInt(r.laps) || 0,
          status: r.status,
        }));

        const winner = results[0];
        const pole = results.reduce((a, b) => a.grid < b.grid ? a : b, results[0]);
        const fl = race.Results.find(r => r.FastestLap?.rank === '1');

        await sb('historical_races', 'POST', {
          season: parseInt(race.season),
          round: rnd,
          race_name: race.raceName,
          circuit_name: race.Circuit.circuitName,
          country: race.Circuit.Location.country,
          race_date: race.date,
          winner_driver: winner?.driver,
          winner_team: winner?.team,
          pole_driver: pole?.driver,
          fastest_lap_driver: fl ? `${fl.Driver.givenName} ${fl.Driver.familyName}` : null,
          fastest_lap_time: fl?.FastestLap?.Time?.time || null,
          results,
        });
        total++;
      }
    }

    await logSync('fetch-historical-archive', 'success', total, `Imported ${total} races from ${SEASONS.join(',')}`, Date.now() - start);
    return json({ ok: true, imported: total });
  } catch (err) {
    await logSync('fetch-historical-archive', 'error', total, `Imported ${total} before error: ${err.message}`, Date.now() - start, err.stack);
    return json({ error: err.message, imported: total }, 500);
  }
};
