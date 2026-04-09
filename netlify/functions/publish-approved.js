import { getSupabase, logSync, jsonResponse } from './lib/supabase.js';

// Publishes content_drafts that have been marked review_status = 'approved'
// Moves them into the articles table as published

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let published = 0;

  try {
    // Find approved drafts not yet published
    const { data: approved, error: fetchErr } = await sb
      .from('content_drafts')
      .select('*')
      .eq('review_status', 'approved')
      .is('published_article_id', null)
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchErr) throw new Error(`Fetch drafts: ${fetchErr.message}`);
    if (!approved?.length) {
      await logSync(sb, { functionName: 'publish-approved', status: 'success', recordsAffected: 0, message: 'No approved drafts to publish', durationMs: Date.now() - start });
      return jsonResponse({ ok: true, published: 0 });
    }

    for (const draft of approved) {
      const slug = (draft.title || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      // Insert into articles
      const { data: article, error: insertErr } = await sb.from('articles').insert({
        title: draft.title,
        slug,
        body: draft.body,
        excerpt: draft.excerpt,
        author: 'GridFeed AI',
        tags: draft.tags || [],
        race_id: draft.race_id,
        status: 'published',
        published_at: new Date().toISOString(),
      }).select('id').single();

      if (insertErr) {
        console.warn(`[publish-approved] Insert error for "${draft.title}":`, insertErr.message);
        continue;
      }

      // Link draft to published article
      await sb.from('content_drafts').update({
        review_status: 'approved',
        published_article_id: article.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', draft.id);

      published++;
    }

    await logSync(sb, {
      functionName: 'publish-approved',
      status: 'success',
      recordsAffected: published,
      message: `Published ${published} approved drafts`,
      durationMs: Date.now() - start,
    });

    return jsonResponse({ ok: true, published });

  } catch (err) {
    await logSync(sb, { functionName: 'publish-approved', status: 'error', message: err.message, durationMs: Date.now() - start, errorDetail: err.stack });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '*/5 * * * *',
};
