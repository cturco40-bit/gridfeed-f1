// Edge function: rewrites OG / Twitter meta tags for /article/:slug requests
// so link unfurlers (Twitter, Slack, Discord, iMessage, Facebook) show the
// per-article photo and headline. Browser users get the same response and the
// SPA's pathname router (initRoute) calls showArtView() on load.

export default async (request, context) => {
  const url = new URL(request.url);
  const slug = url.pathname.replace(/^\/article\//, '').replace(/\/$/, '');

  // Get the underlying index.html response first so we always serve something
  const response = await context.next();

  if (!slug) return response;

  try {
    const sbUrl = Netlify.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
    const sbKey = Netlify.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
      || Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sbUrl || !sbKey) return response;

    const apiRes = await fetch(
      `${sbUrl}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=title,excerpt,image_url,published_at`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!apiRes.ok) return response;
    const articles = await apiRes.json();
    const article = articles?.[0];
    if (!article) return response;

    const html = await response.text();

    const escape = (s) => (s || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const title = escape(article.title || 'GridFeed');
    const desc = escape((article.excerpt || article.title || '').slice(0, 200));
    const image = article.image_url || 'https://gridfeed.co/og-image.png';
    const canonical = `https://gridfeed.co/article/${slug}`;

    const modified = html
      .replace(/<title>[^<]*<\/title>/, `<title>${title} | GridFeed</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}"/>`)
      .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}"/>`)
      .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${desc}"/>`)
      .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}"/>`)
      .replace(/<meta property="og:image" content="[^"]*"\/>/, `<meta property="og:image" content="${image}"/>`)
      .replace(/<meta property="og:image:width"[^>]*>/, `<meta property="og:image:width" content="1080"/>`)
      .replace(/<meta property="og:image:height"[^>]*>/, `<meta property="og:image:height" content="1080"/>`)
      .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}"/>`)
      .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${desc}"/>`)
      .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${image}"/>`);

    return new Response(modified, {
      status: response.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
  } catch (e) {
    console.error('[article-meta]', e);
    return response;
  }
};

export const config = { path: '/article/*' };
