import { createHmac, randomBytes } from 'crypto';
import { fetchWT, sb } from './shared.js';

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
  return 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
}

/**
 * Post a tweet immediately via Twitter API.
 * Returns { ok, tweetId } or throws on failure.
 *
 * Logs the full Twitter response (status + body, truncated to 1500 chars)
 * to the Netlify function log on every call. Errors include the HTTP
 * status code so post-tweet.js can write meaningful diagnostics into
 * tweets.error_detail.
 */
export async function postTweetNow(text) {
  const ck = process.env.TWITTER_API_KEY, cs = process.env.TWITTER_API_SECRET;
  const tk = process.env.TWITTER_ACCESS_TOKEN, ts = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  if (!ck || !cs || !tk || !ts) throw new Error('Twitter creds not set');

  const tweetUrl = 'https://api.twitter.com/2/tweets';
  const auth = oauthSign('POST', tweetUrl, {}, ck, cs, tk, ts);
  let res, bodyText;
  try {
    res = await fetchWT(tweetUrl, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }, 15000);
    bodyText = await res.text();
  } catch (e) {
    console.error('[twitter] POST /2/tweets network error:', e.message, '| input head:', (text || '').slice(0, 80));
    throw new Error(`Twitter API network: ${e.message}`);
  }

  console.log('[twitter] POST /2/tweets →', res.status, '| body:', bodyText.slice(0, 1500), '| input head:', (text || '').slice(0, 80));

  let data;
  try { data = JSON.parse(bodyText); } catch { data = null; }

  if (!res.ok || !data?.data?.id) {
    const detail = data?.errors || data?.detail || data?.title || bodyText || `HTTP ${res.status}`;
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);
    throw new Error(`Twitter API ${res.status}: ${detailStr}`);
  }
  return { ok: true, tweetId: data.data.id };
}

/**
 * Create a tweet record in DB and post it immediately.
 * Falls back to pending status if posting fails.
 */
export async function createAndPostTweet(text, articleId) {
  const row = await sb('tweets', 'POST', {
    article_id: articleId || null,
    tweet_text: text,
    status: 'approved',
  });
  const tweetDbId = Array.isArray(row) ? row[0]?.id : row?.id;

  try {
    const { tweetId } = await postTweetNow(text);
    if (tweetDbId) await sb(`tweets?id=eq.${tweetDbId}`, 'PATCH', { status: 'posted', posted_at: new Date().toISOString() });
    return { ok: true, tweetId, posted: true };
  } catch (e) {
    console.warn('[twitter] Post failed, left as approved for retry:', e.message);
    return { ok: false, error: e.message, posted: false };
  }
}
