import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { sb } from './lib/shared.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Serves /article/:slug with per-article og:image, og:title and og:description
// rewritten so Twitter / Slack / Discord / iMessage cards show the article photo
// and headline. Browser users hit the same URL and JS picks up location.pathname
// in initRoute() to render the article view.

let _baseHtml = null;
async function loadBaseHtml() {
  if (_baseHtml) return _baseHtml;
  const candidates = [
    path.join(HERE, '..', '..', 'index.html'),
    path.join(process.cwd(), 'index.html'),
  ];
  for (const p of candidates) {
    try {
      _baseHtml = await readFile(p, 'utf8');
      return _baseHtml;
    } catch {}
  }
  throw new Error('index.html not found');
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async (req) => {
  try {
    // Pull slug from /article/:slug
    const url = new URL(req.url);
    const slug = url.pathname.replace(/^\/article\//, '').replace(/\/$/, '');
    if (!slug) return new Response('Missing slug', { status: 400 });

    // Fetch article
    const rows = await sb('articles?slug=eq.' + encodeURIComponent(slug) + '&select=title,excerpt,image_url,published_at,author');
    const article = rows[0];

    let html = await loadBaseHtml();

    if (article) {
      const title = escapeHtml(article.title || 'GridFeed');
      const desc = escapeHtml((article.excerpt || article.title || '').slice(0, 200));
      const img = article.image_url || 'https://gridfeed.co/og-image.png';
      const canonical = 'https://gridfeed.co/article/' + slug;

      // Replace meta tags. Order matters — replace og:image first since others
      // share substrings.
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${title} | GridFeed</title>`)
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}"/>`)
        .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}"/>`)
        .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${desc}"/>`)
        .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}"/>`)
        .replace(/<meta property="og:image" content="[^"]*"\/>/, `<meta property="og:image" content="${img}"/>`)
        .replace(/<meta property="og:image:width"[^>]*>/, `<meta property="og:image:width" content="1080"/>`)
        .replace(/<meta property="og:image:height"[^>]*>/, `<meta property="og:image:height" content="1080"/>`)
        .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}"/>`)
        .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${desc}"/>`)
        .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${img}"/>`);
    }

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('[article-page]', err);
    // Fallback to base html if anything goes wrong
    try {
      const html = await loadBaseHtml();
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch {
      return new Response('Server error', { status: 500 });
    }
  }
};
