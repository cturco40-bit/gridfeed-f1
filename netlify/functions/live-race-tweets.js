import { fetchWT, sb, logSync, json, getLatestSession } from './lib/shared.js';

/* Live race tweet automation
 *
 * Runs every minute. During an in-progress race session it scans
 * race_control for new events from the last 90s, generates a tweet,
 * inserts it as pending with priority=10 and an event_tag for dedup,
 * then fires an admin push so you can approve in 2 taps.
 */

// Tweets only fire for high-impact race events (avoid spam during practice).
// Blog covers everything classified — including session starts, yellow flags,
// and track-limits deletions that are useful commentary during FP1/Quali.
const TEMPLATES = {
  safety_car: '🟡 SAFETY CAR — Lap {lap} at the {race}\n\nLive timing: gridfeed.co',
  sc_ending:  '🟢 Safety Car ending — Lap {lap} at the {race}. Racing resumes\n\nLive: gridfeed.co',
  vsc:        '🟡 VIRTUAL SAFETY CAR — Lap {lap} at the {race}\n\nLive: gridfeed.co',
  red_flag:   '🔴 RED FLAG — {race} suspended on lap {lap}\n\nLive: gridfeed.co',
  penalty:    '⚠️ {reason} — lap {lap} at the {race}\n\ngridfeed.co',
  retirement: '❌ Retirement on lap {lap} at the {race}\n\ngridfeed.co',
};

const BLOG_HEADLINES = {
  safety_car:    'Safety Car Deployed',
  sc_ending:     'Safety Car Ending',
  vsc:           'Virtual Safety Car Deployed',
  red_flag:      'Red Flag — Session Suspended',
  penalty:       'Penalty Issued',
  retirement:    'Driver Retires',
  session_start: 'Session Started',
  session_end:   'Session Ended',
  chequered:     'Chequered Flag',
  yellow_flag:   'Yellow Flag',
  green_flag:    'Track Clear',
  track_limits:  'Lap Time Deleted',
};

// Auto-approve these blog kinds — factual + low-risk so they surface
// immediately in the live blog without an admin review step.
const AUTO_APPROVE_BLOG = new Set([
  'session_start', 'session_end', 'chequered',
  'yellow_flag', 'green_flag', 'track_limits',
]);

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

  // === Blog-only: session lifecycle, flags, track limits ===
  if (cat === 'sessionstatus' || msgU.includes('SESSION STARTED')) {
    return { kind: 'session_start', tag: 'sess-start', tweetable: false };
  }
  if (msgU.includes('SESSION ENDED') || msgU.includes('SESSION FINISHED') || msgU.includes('SESSION SUSPENDED')) {
    return { kind: 'session_end', tag: 'sess-end', tweetable: false };
  }
  if (flag.includes('CHEQUERED') || msgU.includes('CHEQUERED FLAG')) {
    return { kind: 'chequered', tag: 'cheq', tweetable: false };
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

      // ── Tweet (only high-impact race events) ──
      if (!ev.tweetable || !TEMPLATES[ev.kind]) continue;

      const existing = await sb(`tweets?event_tag=eq.${encodeURIComponent(eventTag)}&limit=1`);
      if (existing.length) continue;

      const tweetText = buildTweet(TEMPLATES[ev.kind], {
        race: raceName,
        lap: lapStr,
        reason: (m.message || '').replace(/\s+/g, ' ').trim(),
        state: ev.state || '',
      });
      const trimmed = tweetText.length <= 280 ? tweetText : tweetText.slice(0, 277) + '...';

      try {
        await sb('tweets', 'POST', {
          tweet_text: trimmed,
          status: 'approved',
          tweet_type: 'live_race',
          event_tag: eventTag,
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

