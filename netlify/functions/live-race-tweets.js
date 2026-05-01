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
  if (msgU.includes('SESSION ENDED') || msgU.includes('SESSION FINISHED')) {
    return { kind: 'session_end', tag: 'sess-end', tweetable: true };
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

export default async (req) => {
  const start = Date.now();
  try {
    const session = await getLatestSession();
    if (!session?.isLive) {
      return json({ ok: true, skipped: 'no_live_session' });
    }
    const sessionKey = String(session.session_key);
    const raceName = session.meeting_name || session.circuit_short_name || 'the race';
    const sessionName = session.session_name || 'Session';

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

      // chequered + session_end share a single dedup tag — they're effectively
      // the same event (session results) and OpenF1 may emit both.
      const isRecap = ev.kind === 'chequered' || ev.kind === 'session_end';
      const tweetTag = isRecap ? `${sessionKey}-recap-once` : `${sessionKey}-${ev.kind}-once`;

      const existing = await sb(`tweets?event_tag=eq.${encodeURIComponent(tweetTag)}&limit=1`);
      if (existing.length) continue;

      let tweetText = null;
      if (isRecap) {
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

