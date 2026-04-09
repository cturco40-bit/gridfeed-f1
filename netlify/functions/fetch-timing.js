import { getSupabase, logSync, fetchWithTimeout, matchRace, jsonResponse } from './lib/supabase.js';

const OPENF1 = 'https://api.openf1.org/v1';
const TIMEOUT = 8000;

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
    // 1. Get latest session from OpenF1
    const sessRes = await fetchWithTimeout(`${OPENF1}/sessions?year=2026`, {}, TIMEOUT);
    if (!sessRes.ok) throw new Error(`OpenF1 sessions HTTP ${sessRes.status}`);
    const allSessions = await sessRes.json();
    if (!allSessions?.length) {
      await logSync(sb, { functionName: 'fetch-timing', status: 'success', recordsAffected: 0, message: 'No 2026 sessions found', durationMs: Date.now() - start });
      return jsonResponse({ ok: true, totalRecords: 0, message: 'No sessions' });
    }

    const now = Date.now();

    // Find the most recent or currently live session
    let targetSession = null;

    // Prefer live sessions
    for (const s of allSessions) {
      const startMs = s.date_start ? new Date(s.date_start).getTime() : 0;
      const endMs = s.date_end ? new Date(s.date_end).getTime() : Infinity;
      if (startMs <= now && now <= endMs) {
        targetSession = s;
        break;
      }
    }

    // Fallback: most recently ended session
    if (!targetSession) {
      const ended = allSessions
        .filter(s => s.date_end && new Date(s.date_end).getTime() < now)
        .sort((a, b) => new Date(b.date_end) - new Date(a.date_end));
      if (ended.length) targetSession = ended[0];
    }

    if (!targetSession) {
      await logSync(sb, { functionName: 'fetch-timing', status: 'success', recordsAffected: 0, message: 'No active or recent session', durationMs: Date.now() - start });
      return jsonResponse({ ok: true, totalRecords: 0, message: 'No active session' });
    }

    const sessionType = SESSION_TYPE_MAP[targetSession.session_name] || targetSession.session_name?.toLowerCase() || 'race';
    const meetingName = targetSession.meeting_name || targetSession.circuit_short_name || '';

    // Match to race_id
    const race = await matchRace(sb, meetingName);
    if (!race) {
      await logSync(sb, { functionName: 'fetch-timing', status: 'success', recordsAffected: 0, message: `No race match for "${meetingName}"`, durationMs: Date.now() - start });
      return jsonResponse({ ok: true, totalRecords: 0, message: `No race match for: ${meetingName}` });
    }

    // 2. Fetch positions + drivers in parallel
    const [posRes, drvRes] = await Promise.all([
      fetchWithTimeout(`${OPENF1}/position?session_key=${targetSession.session_key}`, {}, TIMEOUT),
      fetchWithTimeout(`${OPENF1}/drivers?session_key=${targetSession.session_key}`, {}, TIMEOUT),
    ]);

    if (!posRes.ok) throw new Error(`OpenF1 positions HTTP ${posRes.status}`);
    const positions = await posRes.json();
    const drivers = drvRes.ok ? await drvRes.json() : [];

    // Build driver lookup
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    // Latest position per driver (last timestamp wins)
    const latestPos = {};
    positions.forEach(p => {
      if (!latestPos[p.driver_number] || p.date > latestPos[p.driver_number].date) {
        latestPos[p.driver_number] = p;
      }
    });

    const sorted = Object.values(latestPos).sort((a, b) => a.position - b.position);

    // 3. Upsert into leaderboard (delete + insert = replace)
    await sb.from('leaderboard').delete().eq('race_id', race.id).eq('session_type', sessionType);

    const rows = sorted.map(p => {
      const d = driverMap[p.driver_number] || {};
      return {
        race_id: race.id,
        session_type: sessionType,
        position: p.position,
        driver_name: d.full_name || d.broadcast_name || `#${p.driver_number}`,
        team_name: d.team_name || '',
        team_color: d.team_colour ? `#${d.team_colour}` : '#8A8E9A',
        gap_str: p.position === 1 ? 'Leader' : '—',
        status: 'racing',
        raw_data: p,
        fetched_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const { error } = await sb.from('leaderboard').insert(rows);
      if (error) throw new Error(`Leaderboard insert: ${error.message}`);
      totalRecords = rows.length;
    }

    // 4. Check if session is live — mark race as in_progress
    const startMs = targetSession.date_start ? new Date(targetSession.date_start).getTime() : 0;
    const endMs = targetSession.date_end ? new Date(targetSession.date_end).getTime() : Infinity;
    const isLive = startMs <= now && now <= endMs;

    if (isLive) {
      await sb.from('races').update({ status: 'in_progress' }).eq('id', race.id);
    }

    // If race session ended, mark completed + record winner
    if (sessionType === 'race' && targetSession.date_end && new Date(targetSession.date_end).getTime() < now) {
      const winner = rows.find(r => r.position === 1);
      await sb.from('races').update({
        status: 'completed',
        winner_name: winner?.driver_name || null,
        winner_team: winner?.team_name || null,
      }).eq('id', race.id);
    }

    await logSync(sb, {
      functionName: 'fetch-timing',
      status: 'success',
      recordsAffected: totalRecords,
      message: `${meetingName} ${targetSession.session_name}: ${totalRecords} positions${isLive ? ' [LIVE]' : ''}`,
      durationMs: Date.now() - start,
    });

    return jsonResponse({ ok: true, totalRecords, session: targetSession.session_name, meeting: meetingName, live: isLive });

  } catch (err) {
    await logSync(sb, {
      functionName: 'fetch-timing',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '*/2 * * * *',
};
