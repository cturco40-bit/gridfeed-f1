import { sb, fetchWT, logSync, json, makeSlug } from './lib/shared.js';
import { fixEncoding } from './lib/accuracy.js';

function generateTweet(title, articleBody, slug) {
  const url = 'gridfeed.co/#/article/' + slug;
  const firstSentence = (articleBody || '').split(/[.!?]/)[0]?.trim() || '';

  // Only use first sentence if it's meaningfully different from the title
  const titleLower = (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sentLower = firstSentence.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isDuplicate = !firstSentence || sentLower.includes(titleLower) || titleLower.includes(sentLower);

  if (!isDuplicate) {
    const tweet = `${title}\n\n${firstSentence}.\n\n${url}`;
    if (tweet.length <= 270) return tweet;
  }

  // Fallback: title + URL only
  const tweet = `${title}\n\n${url}`;
  if (tweet.length <= 270) return tweet;

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

    // 3. Create tweet draft as pending — needs manual approval before posting
    try {
      const tweetText = generateTweet(cleanTitle, cleanBody, slug);
      await sb('tweets', 'POST', {
        article_id: articleId,
        tweet_text: tweetText,
        status: 'pending',
      });
      await logSync('approve-draft', 'success', 1, `Published + tweet draft created: "${cleanTitle}"`, Date.now() - start);
    } catch (tweetErr) {
      console.warn('[approve-draft] Tweet creation failed:', tweetErr.message);
      await logSync('approve-draft', 'success', 1, `Published (tweet failed): "${cleanTitle}"`, Date.now() - start);
    }

    // 4. Send push notification to public app subscribers (non-blocking)
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    const isBreaking = (tags || []).some(t => (t || '').toUpperCase() === 'BREAKING');
    fetchWT(siteUrl + '/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: isBreaking ? '🚨 GridFeed Breaking' : '🏁 GridFeed',
        body: cleanTitle,
        url: '/#/article/' + slug,
        tag: 'article-' + articleId,
        audience: 'public',
      }),
    }, 8000).catch(() => {});

    // 5. Generate broadcast-style article image (fire-and-forget)
    fetchWT(siteUrl + '/.netlify/functions/generate-article-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId }),
    }, 30000).catch(() => {});

    return json({ ok: true, articleId, slug });
  } catch (err) {
    await logSync('approve-draft', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
