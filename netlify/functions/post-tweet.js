import { sb, logSync, json } from './lib/shared.js';
import { postTweetNow } from './lib/twitter.js';

// Safety caps to prevent Twitter suspension — type-based limits so social
// chatter doesn't crowd out live race alerts
const TWENTY_FOUR_HOURS = 864e5;
const TYPE_LIMITS = {
  social:    { hourly: 2,  daily: 15 },
  article:   { hourly: 10, daily: 30 },
  live_race: { hourly: 5,  daily: 25 },
  live:      { hourly: 5,  daily: 25 },
  recap:     { hourly: 10, daily: 30 },
};
const DEFAULT_LIMIT = TYPE_LIMITS.social;
const MIN_SPACING_MS = 30 * 1000;
const LIVE_MIN_SPACING_MS = 20 * 1000;

function tooSimilar(a, b) {
  // Compare normalized text — Twitter rejects near-duplicates
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 90%+ overlap counts as duplicate
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length / longer.length > 0.85) return true;
  return false;
}

export default async (req, context) => {
  const start = Date.now();
  try {
    // Fetch the last 24h of posted tweets once; all cap checks reuse it
    const dayAgo = new Date(Date.now() - TWENTY_FOUR_HOURS).toISOString();
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const dayPosted = await sb(`tweets?status=eq.posted&posted_at=gt.${dayAgo}&select=id,posted_at,tweet_text,tweet_type`);

    // ── 1. Pick next approved tweet (with live race priority) ──
    const queue = await sb(`tweets?status=eq.approved&or=(scheduled_post_at.is.null,scheduled_post_at.lte.${new Date().toISOString()})&order=created_at.asc&limit=5`);
    if (!queue.length) {
      await logSync('post-tweet', 'success', 0, 'No approved tweets ready', Date.now() - start);
      return json({ ok: true, posted: 0 });
    }
    queue.sort((a, b) => {
      const aLive = a.tweet_type === 'live_race' ? 0 : 1;
      const bLive = b.tweet_type === 'live_race' ? 0 : 1;
      return aLive - bLive;
    });

    let tweet = queue[0];
    const isLive = tweet.tweet_type === 'live_race';

    // ── 2. Per-type hourly + daily caps ──
    const type = tweet.tweet_type || 'social';
    const typeLimit = TYPE_LIMITS[type] || DEFAULT_LIMIT;
    const sameTypePosted = dayPosted.filter(t => (t.tweet_type || 'social') === type);
    const typeHourly = sameTypePosted.filter(t => t.posted_at >= hourAgo).length;
    const typeDaily = sameTypePosted.filter(t => t.posted_at >= todayStart.toISOString()).length;
    if (typeHourly >= typeLimit.hourly) {
      await logSync('post-tweet', 'success', 0, `${type} hourly cap: ${typeHourly}/${typeLimit.hourly}`, Date.now() - start);
      return json({ ok: true, posted: 0, reason: 'hourly_cap', type, count: typeHourly });
    }
    if (typeDaily >= typeLimit.daily) {
      await logSync('post-tweet', 'success', 0, `${type} daily cap: ${typeDaily}/${typeLimit.daily}`, Date.now() - start);
      return json({ ok: true, posted: 0, reason: 'daily_cap', type, count: typeDaily });
    }

    // ── 3. Min spacing (live tweets get faster spacing) ──
    const lastPosted = dayPosted.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))[0];
    if (lastPosted) {
      const sinceLast = Date.now() - new Date(lastPosted.posted_at).getTime();
      const minGap = isLive ? LIVE_MIN_SPACING_MS : MIN_SPACING_MS;
      if (sinceLast < minGap) {
        await logSync('post-tweet', 'success', 0, `Spacing: ${Math.round(sinceLast/1000)}s since last (need ${minGap/1000}s)`, Date.now() - start);
        return json({ ok: true, posted: 0, reason: 'spacing', wait_ms: minGap - sinceLast });
      }
    }

    // ── 5. Stale check ──
    if (Date.now() - new Date(tweet.created_at).getTime() > TWENTY_FOUR_HOURS) {
      await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'failed' });
      await logSync('post-tweet', 'success', 0, 'Skipped stale tweet', Date.now() - start);
      return json({ ok: true, posted: 0, reason: 'stale' });
    }

    // ── 6. Near-duplicate guard against last 3 posted tweets ──
    const recentPosted = dayPosted.slice(0, 3);
    for (const r of recentPosted) {
      if (tooSimilar(tweet.tweet_text, r.tweet_text)) {
        await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'failed' });
        await logSync('post-tweet', 'success', 0, `Near-duplicate of recent post — failed: "${tweet.tweet_text.slice(0,40)}"`, Date.now() - start);
        return json({ ok: true, posted: 0, reason: 'duplicate' });
      }
    }

    // ── 7. POST ──
    let tweetId;
    try {
      ({ tweetId } = await postTweetNow(tweet.tweet_text));
    } catch (postErr) {
      const msg = (postErr.message || '').toLowerCase();
      // Twitter rejects near-duplicates and content rule violations indefinitely
      // — mark the row failed so we stop retrying it every cron tick
      const isPermanent = msg.includes('duplicate') || msg.includes('not allowed') || msg.includes('forbidden') || msg.includes('403');
      if (isPermanent) {
        await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'failed' });
        await logSync('post-tweet', 'success', 0, `Twitter rejected (marked failed): ${postErr.message.slice(0, 200)} — "${tweet.tweet_text.slice(0,40)}"`, Date.now() - start);
        return json({ ok: true, posted: 0, reason: 'twitter_rejected', error: postErr.message });
      }
      throw postErr;
    }
    await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'posted', posted_at: new Date().toISOString() });

    await logSync('post-tweet', 'success', 1, `Posted ${tweetId} (${dayPosted.length+1}/${DAILY_CAP} today): "${tweet.tweet_text.slice(0, 60)}..."`, Date.now() - start);
    return json({ ok: true, posted: 1, tweetId, daily: dayPosted.length + 1, hourly: hourPosted.length + 1 });
  } catch (err) {
    await logSync('post-tweet', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

