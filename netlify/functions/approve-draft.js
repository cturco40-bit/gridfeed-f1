import { sb, fetchWT, logSync, json, makeSlug } from './lib/shared.js';
import { fixEncoding } from './lib/accuracy.js';

// INLINED subject key extractor + recorder — duplicated from
// lib/subject-registry.js to bypass Netlify's function bundle cache.
// Keep in sync with seed-subjects.js / monitor-f1.js.
const SUBJECT_NEXT_RACE_DAYS = 7;
function getSubjectKeyLocal(title) {
  const h = (title || '').toLowerCase();
  if (!h) return null;
  if (h.includes('aduo')) return 'aduo:engine';
  if (h.includes('bahrain')) return 'bahrain:calendar';
  if (h.includes('saudi')) return 'saudi:calendar';
  if (h.includes('goodwood')) return 'goodwood:general';
  if (h.includes('formula 2')) return 'f2:calendar';
  if (h.includes('formula 3')) return 'f3:calendar';
  if (h.includes('overtake mode')) return 'f1:regulation';
  if (h.includes('active aero')) return 'f1:regulation';
  if (/power.*rank|champion.*(stand|check)|all.*drivers/i.test(h)) return 'f1:standings';
  const drivers = ['antonelli','russell','hamilton','leclerc','norris','piastri','verstappen','bearman','gasly','alonso','stroll','sainz','albon','ocon','lawson','lindblad','hadjar','hulkenberg','bortoleto','perez','bottas','colapinto'];
  const teams = ['mercedes','ferrari','mclaren','red bull','aston martin','alpine','haas','williams','audi','cadillac','racing bulls'];
  const entity = drivers.find(d => h.includes(d)) || teams.find(t => h.includes(t)) || '';
  if (!entity) return null;
  const NOISE = new Set(['the','a','an','in','at','of','for','and','is','has','with','from','after','how','why','what','not','his','her','f1','formula','grand','prix','race','driver','team','season','championship','points','2026']);
  const SYNONYMS = { leads:'leads',lead:'leads',leading:'leads',extends:'leads',dominates:'leads',dominant:'leads',dominance:'leads',standings:'leads', crash:'crash',crashes:'crash',incident:'crash',collision:'crash', contract:'contract',signs:'contract',deal:'contract',extension:'contract', departs:'departs',leaves:'departs',exit:'departs',departure:'departs',fired:'departs',sacked:'departs', start:'start',launch:'start',getaway:'start',clutch:'start', penalty:'penalty',penalised:'penalty',stewards:'penalty', upgrade:'upgrade',development:'upgrade',floor:'upgrade', engine:'engine',power:'engine',unit:'engine',reliability:'engine', hire:'hire',hires:'hire',recruit:'hire',appoint:'hire', pace:'pace',speed:'pace',fastest:'pace',performance:'pace',deficit:'pace', wins:'wins',win:'wins',victory:'wins',winner:'wins', pole:'pole',qualifying:'pole',qualified:'pole', preview:'preview',expect:'preview',watch:'preview',prediction:'preview',predict:'preview', rankings:'rankings',ranked:'rankings',rating:'rankings', rookie:'rookie',debut:'rookie',youngest:'rookie',teenager:'rookie' };
  const words = h.split(/[\s\-:,.']+/).filter(w => w.length > 3 && !NOISE.has(w) && w !== entity);
  const sorted = words.sort((a, b) => b.length - a.length);
  const angle = SYNONYMS[sorted[0]] || sorted[0] || 'general';
  return entity + ':' + angle;
}
async function recordSubjectPublishedLocal(title, articleId) {
  const key = getSubjectKeyLocal(title);
  if (!key) return null;
  try {
    await sb('published_subjects', 'POST', {
      subject: key,
      article_id: articleId || null,
      expires_at: new Date(Date.now() + SUBJECT_NEXT_RACE_DAYS * 86400e3).toISOString(),
    });
    return key;
  } catch { return null; }
}

function generateTweet(title, articleBody, slug) {
  // Cache-buster: Twitter caches per-URL permanently, so even after we fix
  // og:image on the server, a previously-scraped URL will keep serving the
  // stale preview. A unique v=N param guarantees Twitter treats every new
  // tweet as a fresh URL and re-scrapes OG meta (server ignores the param).
  const cacheBust = Date.now().toString(36).slice(-6);
  const url = `https://gridfeed.co/article/${slug}?v=${cacheBust}`;
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
    const { id, title, articleBody, excerpt, tags, publishAt } = body;

    if (!id) return json({ error: 'Missing draft id' }, 400);
    if (!articleBody) return json({ error: 'Article body is empty' }, 400);

    const cleanTitle = fixEncoding(title || 'Untitled');
    const cleanBody = fixEncoding(articleBody || '');
    const cleanExcerpt = fixEncoding(excerpt || '');

    // Scheduled mode — if publishAt is a valid future timestamp (>10s from now),
    // we don't insert into articles here. The draft is marked approved with
    // scheduled_publish_at, and publish-approved.js picks it up on its cron tick.
    // This routes through the same pipeline publish-approved uses for cron
    // drafts, so scheduled articles get the same slug dedup / title dedup
    // guards and the same downstream tweet+push+image side-effects.
    const publishTs = publishAt ? Date.parse(publishAt) : NaN;
    const isScheduled = Number.isFinite(publishTs) && publishTs > Date.now() + 10_000;
    if (isScheduled) {
      await sb(`content_drafts?id=eq.${id}`, 'PATCH', {
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
        title: cleanTitle,
        body: cleanBody,
        excerpt: cleanExcerpt,
        tags: tags || ['ANALYSIS'],
        scheduled_publish_at: new Date(publishTs).toISOString(),
      });
      recordSubjectPublishedLocal(cleanTitle, null).catch(() => {});
      await logSync('approve-draft', 'success', 1, `Scheduled "${cleanTitle}" for ${new Date(publishTs).toISOString()}`, Date.now() - start);
      return json({ ok: true, scheduled: true, scheduled_publish_at: new Date(publishTs).toISOString() });
    }

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

    // 2b. Record the article subject so the same angle can't be re-drafted
    recordSubjectPublishedLocal(cleanTitle, articleId).catch(() => {});

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

    // 5. Generate broadcast-style article image. Awaited (not fire-and-forget)
    // because Netlify will kill in-flight outbound requests once the parent
    // function returns, which sometimes left new articles without images.
    try {
      await fetchWT(siteUrl + '/.netlify/functions/generate-article-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      }, 25000);
    } catch (imgErr) {
      console.warn('[approve-draft] Image generation failed:', imgErr.message);
    }

    return json({ ok: true, articleId, slug });
  } catch (err) {
    await logSync('approve-draft', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
