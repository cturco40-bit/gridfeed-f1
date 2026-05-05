import { fetchWT, sb, logSync, json, getLatestSession, fetchOpenF1 } from './lib/shared.js';

/* Live race tweet automation
 *
 * Runs every minute. During an in-progress race session it scans
 * race_control for new events from the last 90s, generates a tweet,
 * inserts it as pending with priority=10 and an event_tag for dedup,
 * then fires an admin push so you can approve in 2 taps.
 */

// Tweetable events fire one tweet per type per session. Recap-style tweets
// (session_end, chequered) build their text dynamically from OpenF1 results
// rather than a static template, so they're not in TEMPLATES.
const TEMPLATES = {
  safety_car:    '🟡 SAFETY CAR — Lap {lap} at the {race}\n\nLive timing: gridfeed.co',
  sc_ending:     '🟢 Safety Car ending — Lap {lap} at the {race}. Racing resumes\n\nLive: gridfeed.co',
  vsc:           '🟡 VIRTUAL SAFETY CAR — Lap {lap} at the {race}\n\nLive: gridfeed.co',
  red_flag:      '🔴 RED FLAG — {race} suspended on lap {lap}\n\nLive: gridfeed.co',
  penalty:       '⚠️ {reason} — lap {lap} at the {race}\n\ngridfeed.co',
  retirement:    '❌ Retirement on lap {lap} at the {race}\n\ngridfeed.co',
  session_start: '🟢 {sessionName} is underway at the {race}\n\nLive timing: gridfeed.co',
};

const BLOG_HEADLINES = {
  safety_car:        'Safety Car Deployed',
  sc_ending:         'Safety Car Ending',
  vsc:               'Virtual Safety Car Deployed',
  red_flag:          'Red Flag — Session Suspended',
  penalty:           'Penalty Issued',
  retirement:        'Driver Retires',
  session_start:     'Session Started',
  session_end:       'Session Ended',
  session_suspended: 'Session Suspended',
  chequered:         'Chequered Flag',
  yellow_flag:       'Yellow Flag',
  green_flag:        'Track Clear',
  track_limits:      'Lap Time Deleted',
};

// Auto-approve these blog kinds — factual + low-risk so they surface
// immediately in the live blog without an admin review step.
const AUTO_APPROVE_BLOG = new Set([
  'session_start', 'session_end', 'session_suspended', 'chequered',
  'yellow_flag', 'green_flag', 'track_limits',
]);

// Format lap_duration (float seconds) → "M:SS.mmm"
function formatLapTime(seconds) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3);
  return `${m}:${s.padStart(6, '0')}`;
}

// Qualifying-style sessions run three back-to-back segments (Q1/Q2/Q3 or
// SQ1/SQ2/SQ3) and emit CHEQUERED + SESSION FINISHED at the end of each.
// They need per-segment recaps with the right framing — eliminated drivers
// for Q1/Q2, pole + deltas for Q3 — instead of one "Qualifying ENDED"
// tweet that fires off Q1's chequered.
function isQualifyingSession(sessionName) {
  const n = (sessionName || '').toLowerCase();
  return n.includes('qualifying') || n.includes('shootout');
}

// Count prior CHEQUERED rows for this session strictly before the given
// row's date. Returns the segment number for the row passed in (1, 2, or 3).
// Caller guarantees the input row IS a chequered row already in the DB.
async function detectQualifyingSegment(sessionKey, chequeredRow) {
  const prior = await sb(`race_control?session_key=eq.${sessionKey}&flag=eq.CHEQUERED&date=lt.${encodeURIComponent(chequeredRow.date)}&select=date`);
  return (prior?.length || 0) + 1;
}

// Find the SESSION STARTED most recently before the given timestamp. Used
// to bound the segment time window for buildQualifyingSegmentRecap.
async function findSegmentStart(sessionKey, beforeDate) {
  const rows = await sb(`race_control?session_key=eq.${sessionKey}&category=eq.SessionStatus&message=ilike.*STARTED*&date=lt.${encodeURIComponent(beforeDate)}&order=date.desc&limit=1&select=date`);
  return rows?.[0]?.date || null;
}

// Build a per-segment qualifying recap from /v1/laps filtered to the
// segment's [segStart, segEnd] window. Q1 and Q2 list eliminated drivers;
// Q3 lists the top 3 with deltas to pole. Driver standings inside a segment
// are computed as best valid lap_duration ascending.
async function buildQualifyingSegmentRecap(sessionKey, sessionName, raceName, segment, segStart, segEnd) {
  try {
    const [lapsRes, drvRes] = await Promise.all([
      fetchOpenF1(`/v1/laps?session_key=${sessionKey}`),
      fetchOpenF1(`/v1/drivers?session_key=${sessionKey}`).catch(() => ({ ok: false })),
    ]);
    if (!lapsRes.ok) return { ok: false, reason: 'laps_http' };
    const allLaps = await lapsRes.json();
    const drivers = drvRes.ok ? await drvRes.json() : [];
    if (!Array.isArray(allLaps) || !allLaps.length) return { ok: false, reason: 'no_laps' };

    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    // Cars get to finish a hot lap that started before the chequered, so the
    // window is "lap.date_start in [segStart, segEnd]" — not lap_end.
    const segLaps = allLaps.filter(l => {
      if (!l.date_start || !l.lap_duration || l.lap_duration <= 0) return false;
      if (l.is_pit_out_lap) return false;
      return l.date_start >= segStart && l.date_start <= segEnd;
    });
    if (!segLaps.length) return { ok: false, reason: 'no_segment_laps' };

    const best = {};
    for (const l of segLaps) {
      if (!best[l.driver_number] || l.lap_duration < best[l.driver_number]) {
        best[l.driver_number] = l.lap_duration;
      }
    }
    const ranked = Object.entries(best)
      .map(([drv, t]) => ({ driver_number: parseInt(drv, 10), time: t }))
      .sort((a, b) => a.time - b.time);
    if (!ranked.length) return { ok: false, reason: 'no_ranked' };

    const isSprint = (sessionName || '').toLowerCase().includes('sprint');
    const segLabel = (isSprint ? 'SQ' : 'Q') + segment;

    const nameOf = drv => {
      const d = driverMap[drv] || {};
      return d.name_acronym || d.last_name || d.broadcast_name || `#${drv}`;
    };

    if (segment === 3) {
      // Q3 — top 3 with deltas to pole
      const top3 = ranked.slice(0, 3);
      const pole = top3[0]?.time;
      const lines = top3.map((r, i) => {
        if (i === 0) return `P1 ${nameOf(r.driver_number)} ${formatLapTime(r.time)}`;
        const delta = (r.time - pole).toFixed(3);
        return `P${i + 1} ${nameOf(r.driver_number)} +${delta}`;
      });
      const text = `🏁 ${sessionName} ENDED — ${raceName}\n\n${lines.join('\n')}\n\nFull results: gridfeed.co`;
      return { ok: true, text };
    }

    // Q1 / Q2 — eliminated drivers
    // Q1 eliminates positions 16-20, Q2 eliminates positions 11-15. Slice
    // works on best-lap rank, which matches the FIA elimination rule.
    const startPos = segment === 1 ? 16 : 11;
    const sliceStart = startPos - 1;
    const eliminated = ranked.slice(sliceStart, sliceStart + 5);
    if (!eliminated.length) return { ok: false, reason: 'no_eliminated' };
    const lines = eliminated.map((r, i) => {
      const pos = startPos + i;
      return `P${pos} ${nameOf(r.driver_number)} ${formatLapTime(r.time)}`;
    });
    const text = `🏁 ${segLabel} ENDED — ${raceName}\n\nEliminated:\n${lines.join('\n')}\n\ngridfeed.co`;
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: 'exception:' + (e.message || '').slice(0, 80) };
  }
}

// Build a session-end recap from OpenF1: top 3 by latest position + each
// driver's best lap. Used for chequered flag / SESSION ENDED tweets so
// GridFeed can be first to post results with lap times.
async function buildSessionRecap(sessionKey, sessionName, raceName) {
  try {
    const [posRes, lapsRes, drvRes] = await Promise.all([
      fetchOpenF1(`/v1/position?session_key=${sessionKey}`),
      fetchOpenF1(`/v1/laps?session_key=${sessionKey}`).catch(() => ({ ok: false })),
      fetchOpenF1(`/v1/drivers?session_key=${sessionKey}`).catch(() => ({ ok: false })),
    ]);
    if (!posRes.ok) return { ok: false, reason: 'positions_http' };
    const positions = await posRes.json();
    const drivers = drvRes.ok ? await drvRes.json() : [];
    const laps = lapsRes.ok ? await lapsRes.json() : [];
    if (!Array.isArray(positions) || !positions.length) return { ok: false, reason: 'no_positions' };

    const driverMap = {};
    drivers.forEach(d => { driverMap[d.driver_number] = d; });

    // Final standings = latest position row per driver
    const latest = {};
    for (const p of positions) {
      if (!latest[p.driver_number] || p.date > latest[p.driver_number].date) latest[p.driver_number] = p;
    }
    const ranked = Object.values(latest)
      .filter(p => p.position)
      .sort((a, b) => a.position - b.position)
      .slice(0, 3);
    if (!ranked.length) return { ok: false, reason: 'no_ranked' };

    // Best lap per driver (excluding pit-out laps where flagged)
    const bestLap = {};
    for (const lap of laps) {
      if (!lap.lap_duration || lap.lap_duration <= 0) continue;
      if (lap.is_pit_out_lap) continue;
      if (!bestLap[lap.driver_number] || lap.lap_duration < bestLap[lap.driver_number]) {
        bestLap[lap.driver_number] = lap.lap_duration;
      }
    }

    const lines = ranked.map((r, i) => {
      const d = driverMap[r.driver_number] || {};
      const name = d.name_acronym || d.last_name || d.broadcast_name || (`#${r.driver_number}`);
      const t = bestLap[r.driver_number];
      const tStr = t ? ` ${formatLapTime(t)}` : '';
      return `P${i + 1} ${name}${tStr}`;
    });
    const text = `🏁 ${sessionName} ENDED — ${raceName}\n\n${lines.join('\n')}\n\nFull results: gridfeed.co`;
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: 'exception:' + (e.message || '').slice(0, 80) };
  }
}

function classifyEvent(m) {
  const cat = (m.category || '').toLowerCase();
  const flag = (m.flag || '').toUpperCase();
  const msg = (m.message || '');
  const msgU = msg.toUpperCase();

  // === Tweetable: high-impact race events ===
  if (cat === 'safetycar' && msgU.includes('DEPLOYED')) return { kind: 'safety_car', tag: 'sc-deployed', tweetable: true };
  if (cat === 'safetycar' && (msgU.includes('IN THIS LAP') || msgU.includes('ENDING'))) return { kind: 'sc_ending', tag: 'sc-ending', tweetable: true };
  if (msgU.includes('VIRTUAL SAFETY CAR DEPLOYED') || msgU.includes('VSC DEPLOYED')) return { kind: 'vsc', tag: 'vsc-deployed', tweetable: true };
  if (flag === 'RED' && msgU.includes('RED FLAG')) return { kind: 'red_flag', tag: 'red', tweetable: true };
  if (msgU.match(/\b\d+\s*SECOND\s+(STOP|TIME|GRID)/) || msgU.includes('DRIVE THROUGH') || msgU.includes('DISQUALIF')) {
    return { kind: 'penalty', tag: 'pen', tweetable: true };
  }
  if ((msgU.includes('CAR') && msgU.includes('STOPPED')) || msgU.includes('WILL NOT RESTART')) {
    return { kind: 'retirement', tag: 'ret', tweetable: true };
  }

  // === Session lifecycle: tweetable, fires once per session per kind ===
  if (msgU.includes('SESSION STARTED') || cat === 'sessionstatus' && msgU.includes('STARTED')) {
    return { kind: 'session_start', tag: 'sess-start', tweetable: true };
  }
  // SESSION SUSPENDED is functionally the same as a red flag — let red_flag
  // handler take it. Stand-alone SUSPENDED message stays blog-only.
  if (msgU.includes('SESSION SUSPENDED')) {
    return { kind: 'session_suspended', tag: 'sess-susp', tweetable: false };
  }
  // SESSION FINISHED arrives ~0.1s after CHEQUERED. The chequered handler
  // owns the recap tweet (and for qualifying owns the segment-aware path).
  // Keep this as a blog event so the live blog still shows "Session Ended"
  // but skip the tweet to avoid double-firing and to stop SESSION FINISHED
  // from being mis-counted as a separate qualifying segment.
  if (msgU.includes('SESSION ENDED') || msgU.includes('SESSION FINISHED')) {
    return { kind: 'session_end', tag: 'sess-end', tweetable: false };
  }
  if (flag.includes('CHEQUERED') || msgU.includes('CHEQUERED FLAG')) {
    return { kind: 'chequered', tag: 'cheq', tweetable: true };
  }
  if (flag.includes('YELLOW')) {
    const sector = (msgU.match(/SECTOR\s+(\d+)/) || [])[1];
    return { kind: 'yellow_flag', tag: 'yel-' + (sector || flag.replace(/\s+/g, '_').toLowerCase()), tweetable: false };
  }
  if (flag === 'GREEN' || msgU.includes('TRACK CLEAR')) {
    return { kind: 'green_flag', tag: 'grn', tweetable: false };
  }
  if (msgU.includes('DELETED') && msgU.includes('TRACK LIMITS')) {
    // Tag includes the offending car number so multiple deletions don't collapse
    const carMatch = msgU.match(/CAR\s+(\d+)/);
    return { kind: 'track_limits', tag: 'tl-' + (carMatch ? carMatch[1] : 'x'), tweetable: false };
  }
  return null;
}

function buildTweet(template, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll('{' + k + '}', v || ''), template);
}

// Fallback window: if a session's date_end has passed and no recap was
// posted, post one anyway. OpenF1 doesn't always emit a CHEQUERED FLAG /
// SESSION ENDED race_control row (FP1 just had this happen), so the
// chequered-flag-driven recap path can silently miss. The fallback caps
// at 4h so we don't post yesterday's race results when the function
// happens to run hours later.
const RECAP_FALLBACK_WINDOW_MS = 4 * 3600 * 1000;

export default async (req) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session) return json({ ok: true, skipped: 'no_session' });

    const sessionKey = String(session.session_key);
    const raceName = session.meeting_name || session.circuit_short_name || 'the race';
    const sessionName = session.session_name || 'Session';

    // ── Time-based fallback recap ──
    // Fires whenever a session has ended on the clock and we haven't
    // already posted a recap for it. Catches the FP1 case where OpenF1
    // never emitted a chequered/SESSION ENDED message.
    if (!session.isLive) {
      const endMs = session.date_end ? new Date(session.date_end).getTime() : null;
      const now = Date.now();
      if (endMs && now > endMs && (now - endMs) <= RECAP_FALLBACK_WINDOW_MS) {
        const isQualType = isQualifyingSession(sessionName);
        // For qualifying, the fallback only covers the FINAL segment (Q3 / SQ3).
        // Q1 and Q2 chequered tweets fire on their own chequered handlers and
        // shouldn't be retroactively posted from the fallback.
        const recapTag = isQualType ? `${sessionKey}-q3-once` : `${sessionKey}-recap-once`;
        const existing = await sb(`tweets?event_tag=eq.${encodeURIComponent(recapTag)}&limit=1`);
        if (existing.length) {
          return json({ ok: true, skipped: 'recap_already_posted', session_key: sessionKey });
        }
        let recap;
        if (isQualType) {
          // Build Q3 from the most recent SESSION STARTED to date_end — best
          // approximation when fetch-race-control missed the Q3 chequered.
          const seg3Start = await findSegmentStart(sessionKey, session.date_end);
          if (!seg3Start) {
            await logSync('live-race-tweets', 'success', 0, `Fallback Q3 recap deferred (${sessionName}): no SESSION STARTED row`, Date.now() - start);
            return json({ ok: true, skipped: 'qual_fallback_no_start' });
          }
          recap = await buildQualifyingSegmentRecap(sessionKey, sessionName, raceName, 3, seg3Start, session.date_end);
        } else {
          recap = await buildSessionRecap(sessionKey, sessionName, raceName);
        }
        if (!recap.ok) {
          // OpenF1 lag — don't write the dedup row, retry next tick
          await logSync('live-race-tweets', 'success', 0, `Fallback recap deferred (${session.session_name}): ${recap.reason || 'data_not_ready'}`, Date.now() - start);
          return json({ ok: true, skipped: 'recap_data_not_ready', reason: recap.reason });
        }
        const trimmed = recap.text.length <= 280 ? recap.text : recap.text.slice(0, 277) + '...';
        try {
          await sb('tweets', 'POST', {
            tweet_text: trimmed,
            status: 'approved',
            tweet_type: 'live_race',
            event_tag: recapTag,
          });
        } catch (e) {
          await logSync('live-race-tweets', 'error', 0, `Fallback recap insert failed: ${e.message}`, Date.now() - start);
          return json({ ok: false, error: e.message });
        }
        // Fire post-tweet directly so the recap goes to Twitter within seconds
        const siteUrl = process.env.URL || 'https://gridfeed.co';
        fetchWT(siteUrl + '/.netlify/functions/post-tweet', { method: 'POST' }, 20000).catch(() => {});
        await logSync('live-race-tweets', 'success', 1, `Fallback recap posted for ${session.session_name} (no chequered flag in RC)`, Date.now() - start);
        console.log('[live-race-tweets] fallback recap fired for', sessionName, 'session_key', sessionKey);
        return json({ ok: true, queued_recap: 1, fallback: true, session_key: sessionKey });
      }
      return json({ ok: true, skipped: 'no_live_session' });
    }

    // Fetch recent race_control rows from our DB (last 90s window)
    const since = new Date(Date.now() - 90 * 1000).toISOString();
    const rows = await sb(`race_control?session_key=eq.${sessionKey}&fetched_at=gt.${since}&order=date.asc`);
    if (!rows.length) {
      return json({ ok: true, queued: 0, reason: 'no_recent_events' });
    }

    let queued = 0;
    const errors = [];

    let blogged = 0;
    for (const m of rows) {
      const ev = classifyEvent(m);
      if (!ev) continue;

      const lap = m.lap_number;
      const lapStr = (typeof lap === 'number' && lap > 0) ? lap : '?';
      // Unique tag per event so we never double-create
      const eventTag = `${sessionKey}-${ev.tag}-lap${lapStr}-${(m.date || '').slice(0, 19)}`;

      // ── Blog entry (broader coverage — includes practice events) ──
      try {
        const blogTag = 'blog-' + eventTag;
        const existingBlog = await sb(`race_blog_entries?event_tag=eq.${encodeURIComponent(blogTag)}&limit=1`);
        if (!existingBlog.length) {
          const headline = BLOG_HEADLINES[ev.kind] || ev.kind;
          const reason = (m.message || '').replace(/\s+/g, ' ').trim();
          const body = (typeof lap === 'number' && lap > 0)
            ? `Lap ${lap}: ${reason || headline} at ${raceName}.`
            : `${reason || headline} at ${raceName}.`;
          const autoApprove = AUTO_APPROVE_BLOG.has(ev.kind);
          await sb('race_blog_entries', 'POST', {
            session_key: sessionKey,
            lap_number: typeof lap === 'number' ? lap : null,
            event_type: ev.kind,
            headline,
            body,
            status: autoApprove ? 'approved' : 'pending',
            auto_generated: true,
            event_tag: blogTag,
            reviewed_at: autoApprove ? new Date().toISOString() : null,
            reviewed_by: autoApprove ? 'auto' : null,
          });
          blogged++;
        }
      } catch (e) {
        errors.push('blog:' + e.message);
      }

      // ── Tweet (one per kind per session) ──
      if (!ev.tweetable) continue;

      // For qualifying-style sessions, the chequered fires three times — once
      // per segment. Treat each as its own recap with a per-segment dedup tag
      // and segment-specific framing (eliminated drivers for Q1/Q2, top 3 +
      // deltas for Q3). For all other sessions, the existing single recap
      // path runs.
      const isRecap = ev.kind === 'chequered';
      const isQualType = isRecap && isQualifyingSession(sessionName);

      let segment = null, segmentStart = null;
      if (isQualType) {
        segment = await detectQualifyingSegment(sessionKey, m);
        segmentStart = await findSegmentStart(sessionKey, m.date);
      }

      const tweetTag = isQualType
        ? `${sessionKey}-q${segment}-once`
        : isRecap
          ? `${sessionKey}-recap-once`
          : `${sessionKey}-${ev.kind}-once`;

      const existing = await sb(`tweets?event_tag=eq.${encodeURIComponent(tweetTag)}&limit=1`);
      if (existing.length) continue;

      let tweetText = null;
      if (isQualType) {
        if (!segmentStart) {
          // Couldn't find a SESSION STARTED before this chequered — fetch-rc
          // probably missed the start row. Don't write the dedup tag so the
          // next chequered fires a fresh attempt.
          errors.push(`qual_no_seg_start_q${segment}`);
          continue;
        }
        const recap = await buildQualifyingSegmentRecap(sessionKey, sessionName, raceName, segment, segmentStart, m.date);
        if (!recap.ok) {
          errors.push(`qual_recap_skipped_q${segment}:` + (recap.reason || 'unknown'));
          continue;
        }
        tweetText = recap.text;
      } else if (isRecap) {
        const recap = await buildSessionRecap(sessionKey, sessionName, raceName);
        if (!recap.ok) {
          // OpenF1 sometimes lags behind the chequered flag — leave the dedup
          // row unwritten so the next cron tick retries the recap.
          errors.push('recap_skipped:' + (recap.reason || 'unknown'));
          continue;
        }
        tweetText = recap.text;
      } else if (ev.kind === 'session_start') {
        tweetText = buildTweet(TEMPLATES.session_start, { sessionName, race: raceName });
      } else if (TEMPLATES[ev.kind]) {
        tweetText = buildTweet(TEMPLATES[ev.kind], {
          race: raceName,
          lap: lapStr,
          reason: (m.message || '').replace(/\s+/g, ' ').trim(),
          state: ev.state || '',
        });
      }
      if (!tweetText) continue;
      const trimmed = tweetText.length <= 280 ? tweetText : tweetText.slice(0, 277) + '...';

      try {
        await sb('tweets', 'POST', {
          tweet_text: trimmed,
          status: 'approved',
          tweet_type: 'live_race',
          event_tag: tweetTag,
        });
        queued++;
      } catch (e) {
        errors.push('tweet:' + e.message);
      }
    }
    console.log('[live-race-tweets] processed', rows.length, 'rows, blogged', blogged, 'tweets queued', queued, 'errors', errors.length);

    // Fire post-tweet immediately so live events go out within seconds (no approval).
    // Fire as many sequential calls as we have queued so the burst posts in order
    // (post-tweet enforces 60s spacing internally — if it throttles, the next cron
    // tick picks up the leftover).
    if (queued > 0) {
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      // Fire-and-forget — don't await so this function returns fast
      for (let i = 0; i < queued; i++) {
        fetchWT(siteUrl + '/.netlify/functions/post-tweet', { method: 'POST' }, 20000).catch(() => {});
      }
      // Notify admin (informational only — no approval needed)
      fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🏁 Live tweet posting',
          body: `${queued} live race tweet${queued > 1 ? 's' : ''} sent to Twitter`,
          url: '/gf-admin-drafts',
          tag: 'live-tweet-' + Date.now(),
          audience: 'admin',
        }),
      }, 5000).catch(() => {});
    }

    await logSync('live-race-tweets', 'success', blogged + queued, `Blogged ${blogged}, queued ${queued} tweets from ${rows.length} RC events (${session.session_name})`, Date.now() - start);
    return json({ ok: true, queued, blogged, scanned: rows.length, errors });
  } catch (err) {
    await logSync('live-race-tweets', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

