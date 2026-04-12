import { sb, fetchWT, logSync, json, makeSlug } from './lib/shared.js';
import { fixEncoding } from './lib/accuracy.js';

function generateTweet(title, excerpt) {
  const url = 'gridfeed.co';
  const firstSentence = (excerpt || '').split(/[.!?]/)[0]?.trim() || '';

  // Try title + first sentence + URL
  let tweet = `${title}\n\n${firstSentence}\n\n${url}`;
  if (tweet.length <= 270) return tweet;

  // Try title + URL only
  tweet = `${title}\n\n${url}`;
  if (tweet.length <= 270) return tweet;

  // Truncate title
  return title.slice(0, 240) + '...\n\n' + url;
}

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const { id, title, articleBody, excerpt, tags } = body;

    if (!id) return json({ error: 'Missing draft id' }, 400);
    if (!articleBody) return json({ error: 'Article body is empty' }, 400);

    const cleanTitle = fixEncoding(title || 'Untitled');
    const cleanBody = fixEncoding(articleBody || '');
    const cleanExcerpt = fixEncoding(excerpt || '');
    const slug = makeSlug(cleanTitle);

    // 1. Insert into articles
    const article = await sb('articles', 'POST', {
      title: cleanTitle, slug, body: cleanBody, excerpt: cleanExcerpt,
      tags: tags || ['ANALYSIS'], author: 'GridFeed Staff',
      status: 'published', published_at: new Date().toISOString(),
    });

    const articleId = Array.isArray(article) ? article[0]?.id : article?.id;
    if (!articleId) {
      await logSync('approve-draft', 'error', 0, 'Article insert failed: ' + cleanTitle, Date.now() - start);
      return json({ error: 'Publish failed' }, 500);
    }

    // 2. Update draft status
    await sb(`content_drafts?id=eq.${id}`, 'PATCH', {
      review_status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'admin',
      published_article_id: articleId, title: cleanTitle, body: cleanBody, excerpt: cleanExcerpt, tags,
    });

    // 3. Auto-generate tweet draft (non-blocking — article publishes even if this fails)
    try {
      const tweetText = generateTweet(cleanTitle, cleanExcerpt);
      await sb('tweets', 'POST', {
        article_id: articleId,
        tweet_text: tweetText,
        status: 'pending',
      });
      await logSync('approve-draft', 'success', 1, `Published + tweet draft: "${cleanTitle}"`, Date.now() - start);
    } catch (tweetErr) {
      console.warn('[approve-draft] Tweet creation failed:', tweetErr.message);
      await logSync('approve-draft', 'success', 1, `Published (tweet failed): "${cleanTitle}"`, Date.now() - start);
    }

    // 4. Send push notification for published article (non-blocking)
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    fetchWT(siteUrl + '/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New Article Published',
        body: cleanTitle,
        url: '/#/article/' + slug,
        tag: 'article-' + articleId,
        audience: 'public',
      }),
    }, 8000).catch(() => {});

    return json({ ok: true, articleId, slug });
  } catch (err) {
    await logSync('approve-draft', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
