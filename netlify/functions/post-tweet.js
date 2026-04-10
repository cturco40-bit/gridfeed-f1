import { createHmac, randomBytes } from 'crypto';
import { fetchWT, sb, logSync, json } from './lib/shared.js';

const TWENTY_FOUR_HOURS = 864e5;

function oauthSign(method, url, params, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams = {
    oauth_consumer_key: consumerKey, oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: timestamp,
    oauth_token: tokenKey, oauth_version: '1.0',
  };
  const allParams = { ...oauthParams, ...params };
  const paramStr = Object.keys(allParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&');
  const baseStr = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramStr)}`;
  const sigKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const sig = createHmac('sha1', sigKey).update(baseStr).digest('base64');
  oauthParams.oauth_signature = sig;
  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
  return authHeader;
}

export default async (req, context) => {
  const start = Date.now();
  try {
    const ck = process.env.TWITTER_API_KEY, cs = process.env.TWITTER_API_SECRET;
    const tk = process.env.TWITTER_ACCESS_TOKEN, ts = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    if (!ck || !cs || !tk || !ts) throw new Error('Twitter creds not set');

    // Get oldest approved tweet ready to post
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

    // Post via OAuth 1.0a
    const tweetUrl = 'https://api.twitter.com/2/tweets';
    const body = JSON.stringify({ text: tweet.tweet_text });
    const auth = oauthSign('POST', tweetUrl, {}, ck, cs, tk, ts);

    const res = await fetchWT(tweetUrl, {
      method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body,
    }, 15000);

    const rData = await res.json();
    if (!res.ok || !rData?.data?.id) {
      await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'failed' });
      throw new Error('Twitter API: ' + JSON.stringify(rData?.errors || rData?.detail || rData));
    }

    await sb(`tweets?id=eq.${tweet.id}`, 'PATCH', { status: 'posted', posted_at: new Date().toISOString() });

    await logSync('post-tweet', 'success', 1, `Posted ${rData.data.id}: "${tweet.tweet_text.slice(0, 60)}..."`, Date.now() - start);
    return json({ ok: true, posted: 1, tweetId: rData.data.id });
  } catch (err) {
    await logSync('post-tweet', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/10 * * * *' };
