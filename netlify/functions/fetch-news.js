import { parseStringPromise } from 'xml2js';
import { getSupabase, logSync, fetchWithTimeout, jsonResponse } from './lib/supabase.js';

const TIMEOUT = 8000;

// F1 RSS feeds
const RSS_FEEDS = [
  { url: 'https://www.autosport.com/rss/f1/news/', source: 'Autosport' },
  { url: 'https://www.motorsport.com/rss/f1/news/', source: 'Motorsport.com' },
  { url: 'https://www.formula1.com/content/fom-website/en/latest/all.xml', source: 'Formula1.com' },
];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function extractTag(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('qualify') || text.includes('grid') || text.includes('pole')) return 'QUALIFYING';
  if (text.includes('race result') || text.includes('wins') || text.includes('podium') || text.includes('victory')) return 'RACE';
  if (text.includes('bet') || text.includes('odds') || text.includes('pick')) return 'BETTING';
  if (text.includes('preview') || text.includes('ahead of')) return 'PREVIEW';
  if (text.includes('break') || text.includes('confirm') || text.includes('announce') || text.includes('sign')) return 'BREAKING';
  return 'ANALYSIS';
}

export default async (req, context) => {
  const start = Date.now();
  const sb = getSupabase();
  let totalInserted = 0;

  try {
    for (const feed of RSS_FEEDS) {
      let xml;
      try {
        const res = await fetchWithTimeout(feed.url, {}, TIMEOUT);
        if (!res.ok) { console.warn(`[fetch-news] ${feed.source} HTTP ${res.status}`); continue; }
        xml = await res.text();
      } catch (e) {
        console.warn(`[fetch-news] ${feed.source} fetch error:`, e.message);
        continue;
      }

      let parsed;
      try {
        parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
      } catch (e) {
        console.warn(`[fetch-news] ${feed.source} XML parse error:`, e.message);
        continue;
      }

      // Handle both RSS 2.0 (<rss><channel><item>) and Atom (<feed><entry>)
      const items = parsed?.rss?.channel?.item
        || parsed?.feed?.entry
        || [];

      const entries = Array.isArray(items) ? items : [items];

      for (const item of entries.slice(0, 10)) {
        const title = item.title?._ || item.title || '';
        if (!title) continue;

        const slug = slugify(title);
        const description = item.description?._ || item.description || item.summary?._ || item.summary || '';
        const link = item.link?.$ ? item.link.$.href : (item.link || '');
        const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
        const tag = extractTag(title, description);

        // Check for duplicates by slug
        const { data: existing } = await sb
          .from('articles')
          .select('id')
          .eq('slug', slug)
          .limit(1);

        if (existing?.length) continue;

        // Clean description — strip HTML tags
        const cleanBody = description.replace(/<[^>]*>/g, '').trim();
        const excerpt = cleanBody.slice(0, 200);

        const { error } = await sb.from('articles').insert({
          title,
          slug,
          body: cleanBody || null,
          excerpt: excerpt || null,
          author: feed.source,
          tags: [tag],
          status: 'published',
          source_url: link,
          published_at: new Date(pubDate).toISOString(),
        });

        if (error) {
          // Likely a duplicate slug conflict — skip
          if (error.code === '23505') continue;
          console.warn(`[fetch-news] Insert error:`, error.message);
          continue;
        }

        totalInserted++;
      }
    }

    await logSync(sb, {
      functionName: 'fetch-news',
      status: 'success',
      recordsAffected: totalInserted,
      message: `Fetched ${totalInserted} new articles from ${RSS_FEEDS.length} feeds`,
      durationMs: Date.now() - start,
    });

    return jsonResponse({ ok: true, articles: totalInserted });

  } catch (err) {
    await logSync(sb, {
      functionName: 'fetch-news',
      status: 'error',
      message: err.message,
      durationMs: Date.now() - start,
      errorDetail: err.stack,
    });
    return jsonResponse({ error: err.message }, 500);
  }
};

export const config = {
  schedule: '*/10 * * * *',
};
