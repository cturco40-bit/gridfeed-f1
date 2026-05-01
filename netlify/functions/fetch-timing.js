import { sb, logSync, json, getLatestSession, matchRaceId, SESSION_TYPE_MAP, fetchOpenF1 } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  let totalRecords = 0;
  try {
    const session = await getLatestSession();
    if (!session) {
      await logSync('fetch-timing', 'success', 0, 'No 2026 sessions', Date.now() - start);
      return json({ ok: true, totalRecords: 0 });
    }

    const sessionType = SESSION_TYPE_MAP[session.session_name] || 'race';
    const meetingLabel = session.meeting_name || session.circuit_short_name || '';
    const raceId = await matchRaceId(meetingLabel);
    if (!raceId) {
      await logSync('fetch-timing', 'success', 0, `No race match for "${meetingLabel}"`, Date.now() - start);
      return json({ ok: true, totalRecords: 0 });
    }

    // Fetch positions + drivers + intervals + stints in parallel
    const [posRes, drvRes, intRes, stintRes] = await Promise.all([
      fetchOpenF1(`/v1/position?session_key=${session.session_key}`),
      fetchOpenF1(`/v1/drivers?session_key=${session.session_key}`),
      fetchOpenF1(`/v1/intervals?session_key=${session.session_key}`).catch(() => ({ ok: false })),
      fetchOpenF1(`/v1/stints?session_key=${session.session_key}`).catch(() => ({ ok: false })),
    ]);

    if (!posRes.ok) throw new Error(`Positions HTTP ${posRes.status}`);
    const positions = await posRes.json();
    const drivers = drvRes.ok ? await drvRes.json() : [];
    const intervals = intRes.ok ? await intRes.json() : [];
    const stints = stintRes.ok ? await stintRes.json() : [];

    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    // Latest interval per driver
    const gapMap = {};
    intervals.forEach(i => {
      if (!gapMap[i.driver_number] || i.date > gapMap[i.driver_number].date) gapMap[i.driver_number] = i;
    });

    // Latest stint per driver
    const stintMap = {};
    stints.forEach(s => {
      if (!stintMap[s.driver_number] || s.stint_number > (stintMap[s.driver_number].stint_number || 0)) stintMap[s.driver_number] = s;
    });

    // Latest position per driver
    const latestPos = {};
    positions.forEach(p => {
      if (!latestPos[p.driver_number] || p.date > latestPos[p.driver_number].date) latestPos[p.driver_number] = p;
    });

    const sorted = Object.values(latestPos).sort((a, b) => a.position - b.position);

    // Delete old + insert
    await sb(`leaderboard?race_id=eq.${raceId}&session_type=eq.${sessionType}`, 'DELETE');

    const rows = sorted.map(p => {
      const d = driverMap[p.driver_number] || {};
      const gap = gapMap[p.driver_number];
      const stint = stintMap[p.driver_number];
      return {
        race_id: raceId, session_type: sessionType, session_key: String(session.session_key),
        position: p.position, driver_number: p.driver_number,
        driver_name: d.full_name || d.broadcast_name || `#${p.driver_number}`,
        team_name: d.team_name || '', team_color: d.team_colour ? `#${d.team_colour}` : '#8A8E9A',
        gap_str: gap?.gap_to_leader != null ? `+${gap.gap_to_leader}s` : (p.position === 1 ? 'Leader' : '—'),
        time_str: gap?.interval != null ? `+${gap.interval}s` : '—',
        compound: stint?.compound || null, stint_number: stint?.stint_number || null,
        fetched_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      await sb('leaderboard', 'POST', rows);
      totalRecords = rows.length;
    }

    // Set race status — only if the race_date in our DB is actually past
    const raceRow = await sb(`races?id=eq.${raceId}&select=race_date,status`);
    const raceDate = raceRow[0]?.race_date ? new Date(raceRow[0].race_date) : null;
    const raceDatePast = raceDate && raceDate < new Date();

    if (session.isLive && raceDatePast) {
      await sb(`races?id=eq.${raceId}`, 'PATCH', { status: 'in_progress' });
    } else if (sessionType === 'race' && raceDatePast && session.date_end && new Date(session.date_end) < new Date()) {
      const winner = rows.find(r => r.position === 1);
      await sb(`races?id=eq.${raceId}`, 'PATCH', { status: 'completed', winner_name: winner?.driver_name, winner_team: winner?.team_name });
    }

    await logSync('fetch-timing', 'success', totalRecords, `${meetingLabel} ${session.session_name}: ${totalRecords} positions${session.isLive ? ' [LIVE]' : ''}`, Date.now() - start);
    return json({ ok: true, totalRecords, session: session.session_name, live: session.isLive });
  } catch (err) {
    await logSync('fetch-timing', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

