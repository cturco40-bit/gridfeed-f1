import { sb } from './lib/shared.js';

const STATIC = ['', '/results', '/news', '/picks', '/standings', '/schedule'];

export default async (req, context) => {
  try {
    const articles = await sb('articles?status=eq.published&select=slug,published_at&order=published_at.desc&limit=500');
    const now = new Date().toISOString().slice(0, 10);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const p of STATIC) {
      xml += `  <url><loc>https://gridfeed.co${p}</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>${p === '' ? '1.0' : '0.8'}</priority></url>\n`;
    }

    for (const a of articles) {
      const date = a.published_at ? a.published_at.slice(0, 10) : now;
      xml += `  <url><loc>https://gridfeed.co/article/${a.slug}</loc><lastmod>${date}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
    }

    xml += '</urlset>';
    return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
  } catch (err) {
    return new Response('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { 'Content-Type': 'application/xml' } });
  }
};

export const config = { path: '/sitemap.xml' };
