import { fetchWT, sb, logSync, json, hashContent } from './lib/shared.js';
import { NEVER_REFUSE, SEASON_CONTEXT, DRIVER_TEAM_MAP, HALLUCINATION_RULES, TWEET_VOICE, LEGAL_AND_ETHICS, detectFactualErrors, validateTweet } from './lib/accuracy.js';
import { tweetSimilarity } from './lib/twitter.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_TWEET_ATTEMPTS = 3;

// Single Haiku call. Returns the trimmed tweet body (no URL appended) so the
// caller can run validators on the body first, then append the URL when it
// inserts the row.
async function callHaikuForTweet({ systemPrompt, article, tweetType, maxBody, lastReason }) {
  const retryHint = lastReason
    ? `\n\nPREVIOUS DRAFT WAS REJECTED FOR THIS REASON: ${lastReason}\nFix that exact issue. Do not repeat the same mistake.`
    : '';
  const userPrompt = `Type: ${tweetType}\nArticle: "${article.title}"\nExcerpt: ${(article.excerpt || '').slice(0, 200)}${retryHint}\n\nTweet text only.`;
  const res = await fetchWT('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
  }, 25000);
  const rJson = await res.json();
  let tweetBody = (rJson.content?.[0]?.text || '').trim().replace(/^"|"$/g, '');
  if (tweetBody.length > maxBody) tweetBody = tweetBody.slice(0, maxBody - 3) + '...';
  return tweetBody;
}

export default async (req, context) => {
  const start = Date.now();
  let tweetsCreated = 0;
  let attemptsTotal = 0;
  let rejectedTotal = 0;
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
      const maxBody = 270 - articleUrl.length - 1; // -1 for space

      const systemPrompt = `${NEVER_REFUSE}\n\n${HALLUCINATION_RULES}\n\n${SEASON_CONTEXT}\n\n${DRIVER_TEAM_MAP}\n\n${TWEET_VOICE}\n\n${LEGAL_AND_ETHICS}\n\nWrite a single tweet for @GridFeedF1, max ${maxBody} characters (do NOT include the URL — system appends it).\nOutput ONLY the tweet text. No JSON. No labels. No quotes around it.`;

      // Up to MAX_TWEET_ATTEMPTS shots — each retry feeds the last rejection
      // reason back to Haiku so it fixes the specific issue. Drafts that
      // arrive pass the validators or never arrive at all.
      let inserted = false;
      let lastReason = null;
      for (let attempt = 1; attempt <= MAX_TWEET_ATTEMPTS && !inserted; attempt++) {
        attemptsTotal++;
        try {
          const tweetBody = await callHaikuForTweet({ systemPrompt, article, tweetType, maxBody, lastReason });
          if (!tweetBody) {
            lastReason = 'Empty Haiku response';
            console.warn('[GF] Tweet attempt', attempt, 'empty body for', article.id);
            continue;
          }
          const fullTweet = `${tweetBody} ${articleUrl}`;

          // 1. Hard validator — banned words, driver-team mismatch, hallucinated
          //    tokens, stale snapshots, hashtags, DRS-in-2026, Hamilton 6x, etc.
          const tweetVal = validateTweet(tweetBody);
          if (!tweetVal.valid) {
            lastReason = tweetVal.reason;
            rejectedTotal++;
            await logSync('generate-tweets', 'validation_retry', 0, `Attempt ${attempt}/${MAX_TWEET_ATTEMPTS} rejected: ${tweetVal.reason} — "${tweetBody.slice(0, 60)}"`, Date.now() - start);
            continue;
          }
          // 2. Numeric-claim validator — stale points, wrong totals
          const factCheck = detectFactualErrors({ title: '', body: fullTweet });
          if (!factCheck.valid) {
            lastReason = 'Stats: ' + factCheck.errors.join('; ');
            rejectedTotal++;
            await logSync('generate-tweets', 'stats_retry', 0, `Attempt ${attempt}/${MAX_TWEET_ATTEMPTS} stats: ${factCheck.errors.join('; ')} — "${tweetBody.slice(0, 60)}"`, Date.now() - start);
            continue;
          }
          // 3. Content-hash dedup
          const h = hashContent(fullTweet);
          const dupCheck = await sb(`content_hashes?hash=eq.${h}&limit=1`);
          if (dupCheck.length) {
            lastReason = 'Duplicate of an existing tweet — try a different angle';
            rejectedTotal++;
            continue;
          }
          // 4. Similarity dedup against last 24h of pending/approved/posted
          let dupOf = null;
          for (const r of recentTweets) {
            const sim = tweetSimilarity(fullTweet, r.tweet_text);
            if (sim.similar) { dupOf = r; break; }
          }
          if (dupOf) {
            lastReason = 'Near-duplicate of a recent tweet — use a different angle / different stat';
            rejectedTotal++;
            continue;
          }

          // Passed every gate — insert.
          await sb('tweets', 'POST', { article_id: article.id, tweet_text: fullTweet, status: 'pending', tweet_type: tweetType });
          await sb('content_hashes', 'POST', { hash: h, type: 'tweet', source: 'generate-tweets' });
          recentTweets.push({ id: 'just-created', tweet_text: fullTweet });
          tweetsCreated++;
          inserted = true;
          if (attempt > 1) console.log('[generate-tweets] OK on attempt', attempt, 'for', article.id);
        } catch (e) {
          lastReason = e.message;
          console.warn('[GF] Tweet attempt', attempt, 'error:', e.message);
        }
      }

      if (!inserted) {
        await logSync('generate-tweets', 'attempts_exhausted', 0, `${MAX_TWEET_ATTEMPTS} attempts failed for article ${article.id} — last: ${lastReason}`, Date.now() - start);
      }
    }

    await logSync('generate-tweets', 'success', tweetsCreated, `Generated ${tweetsCreated} tweets (${attemptsTotal} attempts, ${rejectedTotal} rejected)`, Date.now() - start);
    return json({ ok: true, tweets: tweetsCreated, attempts: attemptsTotal, rejected: rejectedTotal });
  } catch (err) {
    await logSync('generate-tweets', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

