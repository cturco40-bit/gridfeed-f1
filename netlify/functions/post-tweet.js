import { sb, logSync, json } from './lib/shared.js';
import { postTweetNow } from './lib/twitter.js';

const TWENTY_FOUR_HOURS = 864e5;

export default async (req, context) => {
  const start = Date.now();
  try {
    // Pick up any approved tweets that weren't posted immediately (fallback)
    const tweets = await sb(`tweets?status=eq.approved&or=(scheduled_post_at.is.null,scheduled_post_at.lte.${new Date().toISOString()})&order=created_at.asc&limit=1`);
    if (!tweets.length) {
      await logSync('post-tweet', 'success', 0, 'No approved tweets ready', Date.now() - start);
      return json({ ok: true, posted: 0 });
    }

    const tweet = tweets[0];

    // Skip stale
    if (Date.now() - new Date(tweet.created_at).getTime() > TWENTY_FOUR_HOURS) {
      await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'failed' });
      await logSync('post-tweet', 'success', 0, 'Skipped stale tweet', Date.now() - start);
      return json({ ok: true, posted: 0, reason: 'stale' });
    }

    const { tweetId } = await postTweetNow(tweet.tweet_text);
    await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'posted', posted_at: new Date().toISOString() });

    await logSync('post-tweet', 'success', 1, `Posted ${tweetId}: "${tweet.tweet_text.slice(0, 60)}..."`, Date.now() - start);
    return json({ ok: true, posted: 1, tweetId });
  } catch (err) {
    await logSync('post-tweet', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/5 * * * *' };
