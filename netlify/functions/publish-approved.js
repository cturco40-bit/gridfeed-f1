import { sb, fetchWT, logSync, json, makeSlug } from './lib/shared.js';

// Same tweet generator used by approve-draft so scheduled articles get the
// exact same social copy as instant-publish articles.
function generateTweet(title, articleBody, slug) {
  const cacheBust = Date.now().toString(36).slice(-6);
  const url = `https://gridfeed.co/article/${slug}?v=${cacheBust}`;
  const firstSentence = (articleBody || '').split(/[.!?]/)[0]?.trim() || '';
  const titleLower = (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const sentLower = firstSentence.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isDuplicate = !firstSentence || sentLower.includes(titleLower) || titleLower.includes(sentLower);
  if (!isDuplicate) {
    const tweet = `${title}\n\n${firstSentence}.\n\n${url}`;
    if (tweet.length <= 270) return tweet;
  }
  const tweet = `${title}\n\n${url}`;
  if (tweet.length <= 270) return tweet;
  return title.slice(0, 240) + '...\n\n' + url;
}

export default async (req, context) => {
  const start = Date.now();
  let published = 0;
  try {
    const drafts = await sb(`content_drafts?review_status=eq.approved&published_article_id=is.null&or=(scheduled_publish_at.is.null,scheduled_publish_at.lte.${new Date().toISOString()})&order=created_at.asc&limit=10`);

    if (!drafts.length) {
      await logSync('publish-approved', 'success', 0, 'No approved drafts', Date.now() - start);
      return json({ ok: true, published: 0 });
    }

    for (const draft of drafts) {
      const slug = makeSlug(draft.title || 'untitled');

      // Check slug not taken
      const existing = await sb(`articles?slug=eq.${encodeURIComponent(slug)}&limit=1`);
      if (existing.length) continue;

      // Title similarity dedup — skip if >60% word overlap with recent article from same author
      const recentArticles = await sb(`articles?select=title&order=published_at.desc&limit=20`);
      const titleWords = new Set((draft.title||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2));
      const isDupe = recentArticles.some(a => {
        const aw = new Set((a.title||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2));
        if (!titleWords.size||!aw.size) return false;
        let overlap=0; for(const w of titleWords) if(aw.has(w)) overlap++;
        return overlap/Math.max(titleWords.size,aw.size) > 0.6;
      });
      if (isDupe) { console.warn('[publish-approved] Skipping near-duplicate:', draft.title); continue; }

      // Insert article FIRST
      const article = await sb('articles', 'POST', {
        title: draft.title, slug, body: draft.body, excerpt: draft.excerpt,
        tags: draft.tags || [], author: 'GridFeed Staff',
        race_id: draft.race_id || null, status: 'published',
        published_at: draft.scheduled_publish_at || new Date().toISOString(),
      });

      const articleId = Array.isArray(article) ? article[0]?.id : article?.id;
      if (!articleId) { console.warn('[publish-approved] Insert failed for:', draft.title); continue; }

      // ONLY update draft on success
      await sb(`content_drafts?id=eq.${draft.id}`, 'PATCH', { review_status: 'published', published_article_id: articleId });
      published++;

      // Downstream side effects — match approve-draft.js so scheduled drafts
      // get a tweet draft, a push, and a social image just like immediate ones.
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      try {
        const tweetText = generateTweet(draft.title, draft.body, slug);
        await sb('tweets', 'POST', { article_id: articleId, tweet_text: tweetText, status: 'pending' });
      } catch (twErr) {
        console.warn('[publish-approved] Tweet draft creation failed:', twErr.message);
      }
      const isBreaking = (draft.tags || []).some(t => (t || '').toUpperCase() === 'BREAKING');
      fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: isBreaking ? '🚨 GridFeed Breaking' : '🏁 GridFeed',
          body: draft.title,
          url: '/#/article/' + slug,
          tag: 'article-' + articleId,
          audience: 'public',
        }),
      }, 8000).catch(() => {});
      try {
        await fetchWT(siteUrl + '/.netlify/functions/generate-article-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_id: articleId }),
        }, 25000);
      } catch (imgErr) {
        console.warn('[publish-approved] Image generation failed:', imgErr.message);
      }
    }

    await logSync('publish-approved', 'success', published, `Published ${published} drafts`, Date.now() - start);
    return json({ ok: true, published });
  } catch (err) {
    await logSync('publish-approved', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

