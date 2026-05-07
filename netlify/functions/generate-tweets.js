import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { NEVER_REFUSE, SEASON_CONTEXT, DRIVER_TEAM_MAP, HALLUCINATION_RULES, VOICE_IDENTITY, LEGAL_AND_ETHICS, detectFactualErrors } from './lib/accuracy.js';
import { tweetSimilarity } from './lib/twitter.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export default async (req, context) => {
  const start = Date.now();
  let tweetsCreated = 0;
  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    // Pull last 24h of recent tweets for similarity dedup. Includes pending,
    // approved, and posted — any of those could be a near-dup of what we're
    // about to generate.
    const dayAgo = new Date(Date.now() - 864e5).toISOString();
    const recentTweets = await sb(`tweets?or=(status.eq.pending,status.eq.approved,status.eq.posted)&created_at=gt.${dayAgo}&select=id,tweet_text&limit=100`).catch(() => []);

    // Find all published articles that don't have tweets yet
    const articles = await sb('articles?status=eq.published&order=published_at.desc&limit=10&select=id,title,slug,tags,author,excerpt');
    if (!articles.length) {
      await logSync('generate-tweets', 'success', 0, 'No articles', Date.now() - start);
      return json({ ok: true, tweets: 0 });
    }

    for (const article of articles) {
      // Check if tweet exists for this article
      const existing = await sb(`tweets?article_id=eq.${article.id}&limit=1`);
      if (existing.length) continue;

      const tags = (article.tags || []).join(' ').toLowerCase();
      let tweetType = 'ANALYSIS';
      if (tags.includes('race')) tweetType = 'RESULT';
      else if (tags.includes('betting')) tweetType = 'PICK';
      else if (tags.includes('preview')) tweetType = 'MORNING';

      const urlSlug = article.slug || article.id;
      const articleUrl = 'gridfeed.co/article/' + urlSlug;
      const maxBody = 270 - articleUrl.length;

      const systemPrompt = `${NEVER_REFUSE}\n\n${HALLUCINATION_RULES}\n\n${SEASON_CONTEXT}\n\n${DRIVER_TEAM_MAP}\n\n${VOICE_IDENTITY}\n\n${LEGAL_AND_ETHICS}\n\nWrite a tweet for @GridFeedF1. Max ${maxBody} chars. No hashtags. No em dashes. Write like a sharp paddock insider texting a friend. One specific fact. One take. One link.\nOutput ONLY the tweet text. Nothing else. No JSON. No labels.`;

      try {
        const res = await fetchWT('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: systemPrompt, messages: [{ role: 'user', content: `Type: ${tweetType}\nArticle: "${article.title}"\nExcerpt: ${(article.excerpt || '').slice(0, 200)}\n\nTweet text only.` }] }),
        }, 25000);

        const rJson = await res.json();
        let tweetBody = (rJson.content?.[0]?.text || '').trim().replace(/^"|"$/g, '');
        if (tweetBody.length > maxBody) tweetBody = tweetBody.slice(0, maxBody - 3) + '...';
        const fullTweet = `${tweetBody} ${articleUrl}`;

        const h = hashContent(fullTweet);
        const dupCheck = await sb(`content_hashes?hash=eq.${h}&limit=1`);
        if (dupCheck.length) continue;

        // Numeric-claim validator — block tweets that cite stale/wrong points
        // before they hit the queue
        const factCheck = detectFactualErrors({ title: '', body: fullTweet });
        if (!factCheck.valid) {
          console.warn('[GF] Tweet stats wrong:', factCheck.errors.join('; '), '|', fullTweet.slice(0, 80));
          continue;
        }

        // Similarity dedup against last 24h of pending/approved/posted tweets
        let isDup = false;
        for (const r of recentTweets) {
          const sim = tweetSimilarity(fullTweet, r.tweet_text);
          if (sim.similar) {
            console.warn('[GF] Tweet near-dup of', r.id, '(' + sim.reason + ') — skipped');
            isDup = true;
            break;
          }
        }
        if (isDup) continue;

        await sb('tweets', 'POST', { article_id: article.id, tweet_text: fullTweet, status: 'pending', tweet_type: tweetType });
        await sb('content_hashes', 'POST', { hash: h, type: 'tweet', source: 'generate-tweets' });
        // Track it locally so subsequent iterations in this run also dedup
        recentTweets.push({ id: 'just-created', tweet_text: fullTweet });
        tweetsCreated++;
      } catch (e) { console.warn('[GF] Tweet gen error:', e.message); }
    }

    await logSync('generate-tweets', 'success', tweetsCreated, `Generated ${tweetsCreated} tweets`, Date.now() - start);
    return json({ ok: true, tweets: tweetsCreated });
  } catch (err) {
    await logSync('generate-tweets', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

