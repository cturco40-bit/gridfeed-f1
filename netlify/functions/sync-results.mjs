import { getSupabase, logSync, matchRace } from './lib/supabase.mjs';

const OPENF1 = 'https://api.openf1.org/v1';

const SESSION_TYPE_MAP = {
  'Practice 1': 'fp1', 'Practice 2': 'fp2', 'Practice 3': 'fp3',
  'Qualifying': 'qualifying', 'Race': 'race',
  'Sprint': 'sprint', 'Sprint Qualifying': 'sprint_qualifying',
  'Sprint Shootout': 'sprint_qualifying',
};

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let totalRecords = 0;

  try {
    // 1. Get all 2026 sessions
    const sessRes = await fetch(`${OPENF1}/sessions?year=2026`);
    if (!sessRes.ok) throw new Error(`OpenF1 sessions HTTP ${sessRes.status}`);
    const allSessions = await sessRes.json();
    if (!allSessions?.length) throw new Error('No 2026 sessions found on OpenF1');

    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    // 2. Find recently ended or live sessions
    const relevantSessions = allSessions.filter(s => {
      const endTime = s.date_end ? new Date(s.date_end).getTime() : 0;
      const startTime = s.date_start ? new Date(s.date_start).getTime() : 0;
      const isLive = startTime <= now && (!s.date_end || endTime >= now);
      const recentlyEnded = endTime > 0 && (now - endTime) < TWO_HOURS;
      return isLive || recentlyEnded;
    });

    if (!relevantSessions.length) {
      // No active sessions — check for the most recent completed session as fallback
      const completed = allSessions
        .filter(s => s.date_end && new Date(s.date_end).getTime() < now)
        .sort((a, b) => new Date(b.date_end) - new Date(a.date_end));

      if (completed.length) relevantSessions.push(completed[0]);
    }

    for (const session of relevantSessions) {
      const sessionType = SESSION_TYPE_MAP[session.session_name] || session.session_name?.toLowerCase();
      if (!sessionType) continue;

      // Match to race_id
      const meetingName = session.meeting_name || session.circuit_short_name || '';
      const race = await matchRace(sb, meetingName);
      if (!race) continue;

      // Fetch positions + drivers
      const [posRes, drvRes] = await Promise.all([
        fetch(`${OPENF1}/position?session_key=${session.session_key}`),
        fetch(`${OPENF1}/drivers?session_key=${session.session_key}`),
      ]);

      if (!posRes.ok) continue;
      const positions = await posRes.json();
      const drivers = drvRes.ok ? await drvRes.json() : [];

      const driverMap = {};
      drivers.forEach(d => { driverMap[d.driver_number] = d; });

      // Build latest position per driver
      const latestPos = {};
      positions.forEach(p => {
        if (!latestPos[p.driver_number] || p.date > latestPos[p.driver_number].date) {
          latestPos[p.driver_number] = p;
        }
      });

      const sorted = Object.values(latestPos)
        .sort((a, b) => a.position - b.position);

      // Delete old data for this race+session, then insert fresh
      await sb
        .from('leaderboard')
        .delete()
        .eq('race_id', race.id)
        .eq('session_type', sessionType);

      const rows = sorted.map(p => {
        const d = driverMap[p.driver_number] || {};
        return {
          race_id: race.id,
          session_type: sessionType,
          position: p.position,
          driver_name: d.full_name || d.broadcast_name || `#${p.driver_number}`,
          team_name: d.team_name || '',
          team_color: d.team_colour ? `#${d.team_colour}` : '#8A8E9A',
          time_str: '—',
          gap_str: p.position === 1 ? 'Leader' : '—',
          status: 'finished',
          raw_data: p,
        };
      });

      if (rows.length) {
        await sb.from('leaderboard').insert(rows);
        totalRecords += rows.length;
      }

      // If Race session is finished, update the race record
      if (sessionType === 'race' && session.date_end && new Date(session.date_end) < new Date()) {
        const winner = rows.find(r => r.position === 1);
        if (winner) {
          await sb.from('races').update({
            status: 'completed',
            winner_name: winner.driver_name,
            winner_team: winner.team_name,
          }).eq('id', race.id);
        }
      }
    }

    await logSync(sb, {
      functionName: 'sync-results',
      status: 'success',
      recordsAffected: totalRecords,
      message: `Synced ${totalRecords} leaderboard rows from ${relevantSessions.length} session(s)`,
      durationMs: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true, totalRecords, sessions: relevantSessions.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logSync(sb, {
      functionName: 'sync-results',
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
  schedule: '*/30 * * * *',
  path: '/api/sync-results',
};
