import { sb, logSync, json, makeSlug } from './lib/shared.js';

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
    }

    await logSync('publish-approved', 'success', published, `Published ${published} drafts`, Date.now() - start);
    return json({ ok: true, published });
  } catch (err) {
    await logSync('publish-approved', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/5 * * * *' };
