import { sb, fetchWT, logSync, json } from './lib/shared.js';

/* One-shot backfill: generates broadcast-style images for every
 * published article that doesn't have one yet. Calls
 * generate-article-image sequentially with a 2-second delay
 * to avoid overwhelming canvas rendering / Supabase storage uploads.
 *
 * Usage: GET or POST /.netlify/functions/backfill-images
 */

export default async (req) => {
  const start = Date.now();
  try {
    // ?force=1 regenerates EVERY published article (even if image_url already set)
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';
    const filter = force ? '' : '&image_url=is.null';
    const articles = await sb('articles?status=eq.published' + filter + '&select=id,title&order=published_at.desc');

    if (!articles?.length) {
      await logSync('backfill-images', 'success', 0, 'No articles need images', Date.now() - start);
      return json({ message: 'No articles need images', processed: 0 });
    }

    const siteUrl = process.env.URL || 'https://gridfeed.co';
    const results = [];

    for (const a of articles) {
      try {
        const res = await fetchWT(siteUrl + '/.netlify/functions/generate-article-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_id: a.id }),
        }, 30000);
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.success) {
          results.push({ title: (a.title || '').slice(0, 60), status: 'ok', drivers: j.drivers_detected, team: j.team_detected });
          console.log('OK:', (a.title || '').slice(0, 60));
        } else {
          results.push({ title: (a.title || '').slice(0, 60), status: 'error', error: j.error || ('HTTP ' + res.status) });
          console.warn('FAIL:', (a.title || '').slice(0, 60), j.error);
        }
      } catch (e) {
        results.push({ title: (a.title || '').slice(0, 60), status: 'error', error: e.message });
        console.warn('FAIL:', (a.title || '').slice(0, 60), e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    const okCount = results.filter(r => r.status === 'ok').length;
    await logSync('backfill-images', 'success', okCount, `${okCount}/${results.length} images generated`, Date.now() - start);

    return json({ processed: results.length, ok: okCount, failed: results.length - okCount, results });
  } catch (err) {
    await logSync('backfill-images', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
