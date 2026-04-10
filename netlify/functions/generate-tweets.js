import { fetchWT, sb, logSync, json, NEVER_REFUSE, SEASON_CONTEXT, hashContent } from './lib/shared.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async (req, context) => {
  const start = Date.now();
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // Daily cap
    const todayStr = new Date().toISOString().slice(0, 10);
    const posted = await sb(`tweets?status=eq.posted&posted_at=gte.${todayStr}T00:00:00Z`);
    if (posted.length >= 4) {
      await logSync('generate-tweets', 'success', 0, `Daily cap (${posted.length}/4)`, Date.now() - start);
      return json({ ok: true, tweets: 0, reason: 'Daily cap' });
    }

    // Get latest article
    const articles = await sb('articles?status=eq.published&order=published_at.desc&limit=1');
    if (!articles.length) {
      await logSync('generate-tweets', 'success', 0, 'No articles', Date.now() - start);
      return json({ ok: true, tweets: 0 });
    }
    const article = articles[0];

    // Check if tweet exists for this article
    const existing = await sb(`tweets?article_id=eq.${article.id}&limit=1`);
    if (existing.length) {
      await logSync('generate-tweets', 'success', 0, 'Tweet exists for latest article', Date.now() - start);
      return json({ ok: true, tweets: 0 });
    }

    // Determine tweet type
    const tags = (article.tags || []).join(' ').toLowerCase();
    let tweetType = 'ANALYSIS';
    if (tags.includes('race')) tweetType = 'RESULT';
    else if (tags.includes('betting')) tweetType = 'PICK';
    else if (tags.includes('preview')) tweetType = 'MORNING';

    const urlSlug = article.slug || article.id;
    const articleUrl = `gridfeed.co/article/${urlSlug}`;
    const maxBody = 270 - articleUrl.length;

    const systemPrompt = `${NEVER_REFUSE}\n\n${SEASON_CONTEXT}\n\nWrite a tweet for @GridFeedF1. Max ${maxBody} chars. No hashtags. No em dashes.\nInclude one specific data point. Conversational. Confident. Never hyperbolic.\nOutput ONLY the tweet text, nothing else.`;

    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: systemPrompt, messages: [{ role: 'user', content: `Type: ${tweetType}\nArticle: "${article.title}"\nExcerpt: ${(article.excerpt || '').slice(0, 200)}\n\nTweet text only.` }] }),
    }, 25000);

    const rJson = await res.json();
    let tweetBody = (rJson.content?.[0]?.text || '').trim().replace(/^"|"$/g, '');
    if (tweetBody.length > maxBody) tweetBody = tweetBody.slice(0, maxBody - 3) + '...';
    const fullTweet = `${tweetBody} ${articleUrl}`;

    // Dedup
    const h = hashContent(fullTweet);
    const dupCheck = await sb(`content_hashes?hash=eq.${h}&limit=1`);
    if (dupCheck.length) {
      await logSync('generate-tweets', 'success', 0, 'Duplicate tweet', Date.now() - start);
      return json({ ok: true, tweets: 0 });
    }

    await sb('tweets', 'POST', { article_id: article.id, tweet_text: fullTweet, status: 'pending', tweet_type: tweetType });
    await sb('content_hashes', 'POST', { hash: h, type: 'tweet', source: 'generate-tweets' });

    await logSync('generate-tweets', 'success', 1, `Tweet: ${fullTweet.slice(0, 80)}...`, Date.now() - start);
    return json({ ok: true, tweets: 1, tweet: fullTweet });
  } catch (err) {
    await logSync('generate-tweets', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '0 10 * * *' };
