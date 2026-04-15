import { sb, logSync, json } from './lib/shared.js';

// Runs after each completed race (weekly cron). Grades every locked pick
// whose race is `completed` and status is still `pending` against the
// final leaderboard. v1 supports the `winner` market_category only — other
// markets get left in pending and logged, so we can add handlers later
// without losing visibility.

async function resolveWinnerMarket(pick) {
  // Look up P1 of the race session on the final leaderboard.
  const lb = await sb(`leaderboard?race_id=eq.${pick.race_id}&session_type=eq.race&position=eq.1&select=driver_name&limit=1`);
  if (!lb?.length) return null;
  const winner = (lb[0].driver_name || '').trim().toLowerCase();
  const picked = (pick.driver_name || '').trim().toLowerCase();
  if (!winner) return null;
  // FADE picks are the opposite logic — we advised AGAINST this driver winning
  if ((pick.pick_type || '').toUpperCase() === 'FADE') {
    return {
      status: winner !== picked ? 'won' : 'lost',
      result: `Winner: ${lb[0].driver_name}`,
    };
  }
  return {
    status: winner === picked ? 'won' : 'lost',
    result: `Winner: ${lb[0].driver_name}`,
  };
}

export default async (req, context) => {
  const start = Date.now();
  try {
    // Pending locked picks only — unlocked drafts are admin queue, ignore.
    const picks = await sb(`betting_picks?status=eq.pending&locked_at=not.is.null&order=created_at.asc&limit=100`);
    if (!picks?.length) {
      await logSync('settle-picks', 'success', 0, 'Nothing pending to settle', Date.now() - start);
      return json({ ok: true, settled: 0 });
    }

    // Cache race statuses so we only query each race once.
    const raceStatus = {};
    async function raceDone(raceId) {
      if (raceStatus[raceId] !== undefined) return raceStatus[raceId];
      const r = await sb(`races?id=eq.${raceId}&select=status&limit=1`);
      const done = r?.[0]?.status === 'completed';
      raceStatus[raceId] = done;
      return done;
    }

    let settled = 0;
    let skipped = 0;
    for (const p of picks) {
      if (!(await raceDone(p.race_id))) { skipped++; continue; }
      let grade;
      if (p.market_category === 'winner' || !p.market_category) {
        grade = await resolveWinnerMarket(p);
      } else {
        console.log('[settle-picks] Unsupported market_category:', p.market_category);
        skipped++;
        continue;
      }
      if (!grade) { skipped++; continue; }
      // The DB trigger only lets us change status/settled_at/settlement_notes/result.
      await sb(`betting_picks?id=eq.${p.id}`, 'PATCH', {
        status: grade.status,
        settled_at: new Date().toISOString(),
        result: grade.result,
      });
      settled++;
    }

    await logSync('settle-picks', 'success', settled, `Settled ${settled} / skipped ${skipped}`, Date.now() - start);
    return json({ ok: true, settled, skipped });
  } catch (err) {
    await logSync('settle-picks', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};
