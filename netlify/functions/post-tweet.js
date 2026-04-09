import { TwitterApi } from 'twitter-api-v2';
import { getSupabase, logSync, jsonResponse } from './lib/supabase.js';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();

  try {
    // Validate Twitter credentials
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET ||
        !process.env.TWITTER_ACCESS_TOKEN || !process.env.TWITTER_ACCESS_TOKEN_SECRET) {
      throw new Error('Twitter API credentials not fully configured');
    }

    // 1. Get oldest pending tweet
    const { data: tweets, error: fetchErr } = await sb
      .from('tweets')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchErr) throw new Error(`Fetch tweets: ${fetchErr.message}`);
    if (!tweets?.length) {
      await logSync(sb, { functionName: 'post-tweet', status: 'success', recordsAffected: 0, message: 'No pending tweets', durationMs: Date.now() - start });
      return jsonResponse({ ok: true, posted: 0, reason: 'No pending tweets' });
    }

    const tweet = tweets[0];

    // 2. Skip stale tweets (older than 24 hours)
    const age = Date.now() - new Date(tweet.created_at).getTime();
    if (age > TWENTY_FOUR_HOURS) {
      // Mark as failed so it doesn't block the queue
      await sb.from('tweets').update({ status: 'failed' }).eq('id', tweet.id);
      await logSync(sb, { functionName: 'post-tweet', status: 'success', recordsAffected: 0, message: `Skipped stale tweet (${Math.round(age / 3600000)}h old): "${tweet.tweet_text.slice(0, 50)}..."`, durationMs: Date.now() - start });
      return jsonResponse({ ok: true, posted: 0, reason: 'Tweet too old, marked failed' });
    }

    // 3. Post to Twitter via OAuth 1.0a
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });

    const rwClient = client.readWrite;
    const result = await rwClient.v2.tweet(tweet.tweet_text);

    if (!result?.data?.id) {
      throw new Error('Twitter API returned no tweet ID');
    }

    // 5. Mark as posted
    const { error: updateErr } = await sb.from('tweets').update({
      status: 'posted',
      posted_at: new Date().toISOString(),
    }).eq('id', tweet.id);

    if (updateErr) console.warn('[post-tweet] Failed to update status:', updateErr.message);

    await logSync(sb, {
      functionName: 'post-tweet',
      status: 'success',
      recordsAffected: 1,
      message: `Posted tweet ${result.data.id}: "${tweet.tweet_text.slice(0, 60)}..."`,
      durationMs: Date.now() - start,
    });

    return jsonResponse({ ok: true, posted: 1, tweetId: result.data.id });

  } catch (err) {
    // If posting failed, mark the tweet as failed
    try {
      const { data: pending } = await sb.from('tweets').select('id').eq('status', 'pending').order('created_at', { ascending: true }).limit(1);
      if (pending?.length) {
        await sb.from('tweets').update({ status: 'failed' }).eq('id', pending[0].id);
      }
    } catch (_) { /* ignore cleanup errors */ }

    await logSync(sb, {
      functionName: 'post-tweet',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '20 10 * * *',
};
