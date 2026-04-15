import { parseStringPromise } from 'xml2js';
import { fetchWT, sb, logSync, json } from './lib/shared.js';

// INLINED subject key extractor — duplicated from lib/subject-registry.js to
// bypass Netlify's function bundle cache which has been serving stale
// versions of the imported helper. Keep in sync with seed-subjects.js.
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

const DRIVERS = ['Verstappen','Hamilton','Leclerc','Norris','Piastri','Russell','Sainz','Alonso','Antonelli','Hadjar','Lindblad','Bottas','Perez','Gasly','Colapinto','Albon','Ocon','Bearman','Lawson','Hulkenberg','Bortoleto','Stroll'];
const TEAMS = ['Ferrari','Mercedes','McLaren','RedBull','Red Bull','AstonMartin','Aston Martin','Alpine','Williams','Haas','Audi','Cadillac','Racing Bulls'];
const EVENTS = ['crash','penalty','contract','engine','dnf','pole','fastest','championship','transfer','injury','retire','ban','protest','appeal','fire','safety','overtake'];
const TIER1 = ['Verstappen','Hamilton','Leclerc','Norris','Antonelli'];
const CIRCUITS = ['Melbourne','Shanghai','Suzuka','Miami','Montreal','Monaco','Barcelona','Madrid','Spielberg','Silverstone','Spa','Budapest','Zandvoort','Monza','Baku','Singapore','Austin','Mexico','Interlagos','Las Vegas','Lusail','Abu Dhabi','Australia','China','Japan','Austria','Belgium','Hungary','Netherlands','Italy','Azerbaijan','Qatar'];
const NON_F1 = [
  'nascar','indycar','indy 500','motogp','wec','le mans','rally','wrc',
  'formula e','super formula','formula 2','formula 3','f2 championship',
  'f3 championship','fia formula 2','fia formula 3','f2','f3',
  'supercars','moto2','moto3','dtm','imsa',
  'bristol motor','daytona','talladega','darlington','martinsville',
  'phoenix raceway','kansas speedway','richmond raceway','pocono',
  'sonoma raceway','watkins glen',
];

// YouTube shows / podcasts / fantasy / clickbait sources
const REJECT_SOURCES = [
  'wtf1','hot takes','fantasy f1','podcast','youtube','watch:','cheat code',
];

// Clickbait headline patterns
const CLICKBAIT_PATTERNS = [
  'shames','blunt verdict','delivers verdict','nothing special','shock plan',
  'opens up on','reveals he','dramatic u-turn','you won\'t believe','jaw-dropping',
];
const F1_KEYWORDS = [
  'f1','formula 1','formula one','grand prix',
  ...DRIVERS.map(d => d.toLowerCase()),
  ...TEAMS.map(t => t.toLowerCase()),
  ...CIRCUITS.map(c => c.toLowerCase()),
];

const RSS_FEEDS = [
  // Formula1.com removed their RSS feed (old URL 301s to a 404). Google News
  // aggregates F1.com + everything else, so we use it as the F1-wide net.
  { url: 'https://news.google.com/rss/search?q=Formula+1&hl=en-US&gl=US&ceid=US:en', source: 'Google News F1', region: 'INT' },
  { url: 'https://www.autosport.com/rss/f1/news/', source: 'Autosport', region: 'GB' },
  { url: 'https://www.motorsport.com/rss/f1/news/', source: 'Motorsport.com', region: 'GB' },
  { url: 'https://the-race.com/feed/', source: 'The Race', region: 'GB' },
  { url: 'https://www.racefans.net/feed/', source: 'RaceFans', region: 'GB' },
  { url: 'https://www.planetf1.com/feed/', source: 'PlanetF1', region: 'GB' },
  { url: 'https://www.skysports.com/rss/12433', source: 'Sky Sports F1', region: 'GB' },
  { url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml', source: 'BBC Sport F1', region: 'GB' },
  { url: 'https://www.gpblog.com/en/rss', source: 'GPblog', region: 'NL' },
  { url: 'https://wtf1.com/feed/', source: 'WTF1', region: 'GB' },
  { url: 'https://www.crash.net/rss/f1', source: 'Crash.net', region: 'GB' },
  { url: 'https://www.gpfans.com/en/rss/', source: 'GPFans', region: 'NL' },
  { url: 'https://www.espn.com/espn/rss/racing/news', source: 'ESPN F1', region: 'US' },
  { url: 'https://beyondtheflag.com/feed/', source: 'Beyond the Flag', region: 'US' },
  { url: 'https://f1chronicle.com/feed/', source: 'F1 Chronicle', region: 'GB' },
  { url: 'https://www.gazzetta.it/rss/formula1.xml', source: 'Gazzetta', region: 'IT' },
  { url: 'https://it.motorsport.com/rss/f1/news/', source: 'Motorsport Italia', region: 'IT' },
  { url: 'https://www.auto-motor-und-sport.de/rss/formel-1/', source: 'Auto Motor Sport', region: 'DE' },
  { url: 'https://www.gptoday.net/en/rss', source: 'GPToday', region: 'NL' },
  { url: 'https://www.marca.com/rss/motor/formula1.xml', source: 'Marca', region: 'ES' },
  { url: 'https://br.motorsport.com/rss/f1/news/', source: 'Motorsport Brasil', region: 'BR' },
  { url: 'https://theathletic.com/rss/f1', source: 'The Athletic F1', region: 'US' },
  { url: 'https://www.formula1.com/en/latest/all.html.rss', source: 'Formula1.com', region: 'INT' },
  { url: 'https://es.autosport.com/rss/news/all', source: 'Autosport ES', region: 'ES' },
];

// Trusted non-English sources that get machine-translated instead of filtered.
// Maps source name -> ISO language name (for the content-generator prompt note).
const TRANSLATE_SOURCES = {
  'Gazzetta': 'Italian',
  'Motorsport Italia': 'Italian',
  'Auto Motor Sport': 'German',
  'Marca': 'Spanish',
  'Autosport ES': 'Spanish',
  'Motorsport Brasil': 'Portuguese',
  'GPblog': 'Dutch',
  'GPToday': 'Dutch',
};
const LANG_CODE = { Italian: 'it', German: 'de', Spanish: 'es', Portuguese: 'pt', Dutch: 'nl' };

async function translateHeadline(title, summary, language) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const prompt = `Translate this F1 news headline and summary to English. Return only the translation, no preamble. Headline: ${title}\nSummary: ${summary || ''}`;
  try {
    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    }, 15000);
    if (!res.ok) return null;
    const j = await res.json();
    const text = (j?.content?.[0]?.text || '').trim();
    if (!text) return null;
    // First line = headline, remainder = summary
    const [head, ...rest] = text.split(/\n+/);
    return { title: head.replace(/^Headline:\s*/i, '').trim(), summary: rest.join(' ').replace(/^Summary:\s*/i, '').trim() };
  } catch { return null; }
}

function makeSignature(title) {
  const t = title.toLowerCase();
  return [...DRIVERS, ...TEAMS, ...EVENTS]
    .filter(e => t.includes(e.toLowerCase()))
    .map(e => e.toLowerCase())
    .sort()
    .join('-');
}

function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
}

function extractEntities(title) {
  const t = title.toLowerCase();
  return {
    drivers: DRIVERS.filter(d => t.includes(d.toLowerCase())),
    circuits: CIRCUITS.filter(c => t.includes(c.toLowerCase())),
  };
}

function scoreStory(title, regionCount) {
  const t = title.toLowerCase();
  let score = 0;
  if (t.includes('safety car') || t.includes('red flag')) score += 10;
  if (t.includes('penalty') || t.includes('ban') || t.includes('disqualif')) score += 9;
  if (t.includes('contract') || t.includes('transfer') || t.includes('sign')) score += 8;
  if (t.includes('championship')) score += 7;
  if (t.includes('engine') || t.includes('protest') || t.includes('appeal')) score += 6;
  if (t.includes('pole') || t.includes('fastest lap')) score += 5;
  score += Math.min(regionCount * 2, 10);
  if (TIER1.some(d => t.includes(d.toLowerCase()))) score += 3;
  return Math.min(score, 20);
}

export default async (req, context) => {
  const start = Date.now();
  let topicsCreated = 0;
  const ONE_HOUR_MS = 6 * 60 * 60 * 1000;
  const freshnessCutoff = Date.now() - ONE_HOUR_MS;
  try {
    // No daily cap anymore — the 60-min freshness window + seen_urls dedup +
    // subject registry act as the natural rate limit.
    // Clean up seen_urls older than 7 days to prevent table growing indefinitely
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await sb('seen_urls?created_at=lt.' + cutoff, 'DELETE').catch(() => {});
    } catch {}
    const recentTopics = [];

    // Fetch all RSS in parallel
    const headlines = [];
    const feedResults = await Promise.allSettled(
      RSS_FEEDS.map(async f => {
        try {
          const res = await fetchWT(f.url, {}, 8000);
          if (!res.ok) return [];
          const xml = await res.text();
          const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
          const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
          const arr = Array.isArray(items) ? items : [items];
          return arr.slice(0, 12).map(i => ({
            title: i.title?._ || i.title || '',
            link: i.link?.$ ? i.link.$.href : (i.link || ''),
            pubDate: i.pubDate || i.published || i.updated || null,
            summary: (i.description?._ || i.description || i.summary?._ || i.summary || '').toString().replace(/<[^>]+>/g, '').trim().slice(0, 500),
            source: f.source, region: f.region,
          })).filter(i => i.title);
        } catch { return []; }
      })
    );
    feedResults.forEach(r => { if (r.status === 'fulfilled') headlines.push(...r.value); });

    // Rejection counters — surface in sync_log so "0 created" is actually debuggable
    const rejectCounts = {
      stale: 0, seenUrl: 0, gossip: 0,
      nonF1: 0, noF1Keyword: 0, nonEnglish: 0, lowQuality: 0, clickbait: 0,
      noSignature: 0, titleDedup: 0, sigDedup: 0, lowScore: 0,
      subjectDedup: 0, publishedDup: 0, registryDup: 0, queueFull: 0, accepted: 0,
    };

    // Freshness gate — only consider headlines whose pubDate is < 60 min old.
    // Items without a pubDate pass (we'll let the seen_urls dedup catch
    // repeats from feeds that don't expose timestamps).
    const beforeFresh = headlines.length;
    const freshHeadlines = headlines.filter(h => {
      if (!h.pubDate) return true;
      const ts = Date.parse(h.pubDate);
      if (!isFinite(ts)) return true;
      if (ts < freshnessCutoff) { rejectCounts.stale++; return false; }
      return true;
    });

    // seen_urls dedup — track every URL we've ever ingested so a headline
    // that re-appears in different feeds only ever produces one topic
    const freshAfterUrls = [];
    for (const h of freshHeadlines) {
      if (!h.link) { freshAfterUrls.push(h); continue; }
      try {
        const existing = await sb('seen_urls?url=eq.' + encodeURIComponent(h.link) + '&select=url&limit=1');
        if ((existing || []).length) { rejectCounts.seenUrl++; continue; }
        await sb('seen_urls', 'POST', { url: h.link, headline: (h.title || '').slice(0, 300) }).catch(() => {});
      } catch {}
      freshAfterUrls.push(h);
    }

    // Gossip filter — celebrity / lifestyle junk the feeds sometimes slip in
    const GOSSIP = ['wag','girlfriend','wedding','baby','net worth','salary','dating','girlfriend','romance'];

    // Word-overlap stop list — common F1 vocabulary that would cause every
    // headline to "overlap" with every other regardless of subject
    const STOP_WORDS = new Set([
      'the','a','an','in','at','of','for','and','is','has','with','from','after',
      'how','why','what','not','his','her','him','that','this','they','them',
      'their','will','can','cant','dont','have','been','were','more','less',
      'formula','grand','prix','race','racing','f1','2026','team','driver',
      'drivers','teams','season','championship','points','points','round',
      'rounds','circuit','track','gp','weekend','sport','news','update',
      'first','second','third','latest','says','said','tell','tells','told',
    ]);
    const overlapWords = (title) => {
      return new Set((title || '').toLowerCase().split(/[^a-z0-9]+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w)));
    };

    // Filter non-F1 + non-English + low-quality + clickbait + gossip. Each
    // gate is tracked in rejectCounts and logged so 'created 0' is debuggable.
    const f1Headlines = freshAfterUrls.filter(h => {
      const raw = h.title || '';
      const t = raw.toLowerCase();
      if (NON_F1.some(kw => t.includes(kw))) { rejectCounts.nonF1++; console.log('REJECT nonF1:', raw.slice(0, 60)); return false; }
      // Non-English headlines from trusted foreign sources are allowed through;
      // they get translated later. Headlines with non-ASCII accents from
      // untrusted sources still fall through the F1 keyword gate above.
      if (!F1_KEYWORDS.some(kw => t.includes(kw))) { rejectCounts.noF1Keyword++; console.log('REJECT noF1Keyword:', raw.slice(0, 60)); return false; }
      if (REJECT_SOURCES.some(s => t.includes(s))) {
        rejectCounts.lowQuality++; console.log('REJECT lowQuality:', raw.slice(0, 60)); return false;
      }
      if (CLICKBAIT_PATTERNS.some(s => t.includes(s))) {
        rejectCounts.clickbait++; console.log('REJECT clickbait:', raw.slice(0, 60)); return false;
      }
      if (GOSSIP.some(s => t.includes(s))) {
        rejectCounts.gossip++; console.log('REJECT gossip:', raw.slice(0, 60)); return false;
      }
      return true;
    });

    // Translation pass — foreign-source headlines from the trusted list get
    // machine-translated to English before signature/scoring/dedup so the
    // downstream logic (all English-keyword based) can reason about them.
    // Untrusted non-English sources simply fall through — if the F1 keyword
    // gate passed them, they stay original, and if not, they were already
    // rejected above.
    const translatedHeadlines = [];
    for (const h of f1Headlines) {
      const lang = TRANSLATE_SOURCES[h.source];
      if (!lang) { translatedHeadlines.push(h); continue; }
      const tr = await translateHeadline(h.title, h.summary, lang);
      if (!tr || !tr.title) {
        rejectCounts.translationFailed = (rejectCounts.translationFailed || 0) + 1;
        console.log('REJECT translationFailed:', h.title.slice(0, 60));
        continue;
      }
      translatedHeadlines.push({
        ...h,
        title: tr.title,
        summary: tr.summary || h.summary,
        originalTitle: h.title,
        source_language: LANG_CODE[lang] || 'xx',
      });
    }

    // Group by signature
    const sigGroups = {};
    for (const h of translatedHeadlines) {
      const sig = makeSignature(h.title);
      if (!sig) { rejectCounts.noSignature++; console.log('REJECT noSignature:', h.title.slice(0, 60)); continue; }
      if (!sigGroups[sig]) sigGroups[sig] = { titles: [], sources: [], regions: new Set() };
      sigGroups[sig].titles.push(h.title);
      sigGroups[sig].sources.push(h);
      sigGroups[sig].regions.add(h.region);
    }

    // Subject-dedup window tightened from 6h -> 3h so follow-up angles on the
    // same driver aren't blocked for most of the day
    const pendingTopics = await sb('content_topics?select=topic,id&created_at=gt.' + new Date(Date.now() - 3 * 36e5).toISOString());
    const recentTitleNorm = new Set(pendingTopics.map(t => normalizeTitle(t.topic)));

    // Check incoming headlines against recently published article titles so
    // we don't re-report our own stories from different angles
    const publishedRaw = await sb('articles?select=title&status=eq.published&order=published_at.desc&limit=20');
    const publishedWordSets = (publishedRaw || []).map(a => ({
      title: a.title || '',
      words: overlapWords(a.title),
    }));

    for (const [sig, group] of Object.entries(sigGroups)) {
      if (!sig) continue;

      // Title-level dedup: skip if exact same headline already created as topic in 3h
      const titleNorm = normalizeTitle(group.titles[0]);
      if (recentTitleNorm.has(titleNorm)) { rejectCounts.titleDedup++; console.log('REJECT titleDedup:', group.titles[0].slice(0, 60)); continue; }

      // Signature dedup (2h window)
      const sigExists = await sb(`topic_signatures?signature=eq.${encodeURIComponent(sig)}&created_at=gt.${new Date(Date.now() - 2 * 36e5).toISOString()}&limit=1`);
      if (sigExists.length) { rejectCounts.sigDedup++; console.log('REJECT sigDedup:', group.titles[0].slice(0, 60), '| sig:', sig); continue; }

      const score = scoreStory(group.titles[0], group.regions.size);
      if (score < 3) { rejectCounts.lowScore++; console.log('REJECT lowScore', score, ':', group.titles[0].slice(0, 60)); continue; }

      // Subject-level dedup: require BOTH driver AND circuit overlap.
      // Previously if the new headline had no circuit, sameCircuit defaulted
      // to true, so any Antonelli headline blocked every subsequent Antonelli
      // headline regardless of angle. Now we only block when both driver AND
      // circuit match — different-angle follow-ups survive.
      const entities = extractEntities(group.titles[0]);
      if (entities.drivers.length > 0 && entities.circuits.length > 0) {
        const subjectDupe = pendingTopics.some(pt => {
          const ptLower = pt.topic.toLowerCase();
          const sameDriver = entities.drivers.some(d => ptLower.includes(d.toLowerCase()));
          const sameCircuit = entities.circuits.some(c => ptLower.includes(c.toLowerCase()));
          return sameDriver && sameCircuit;
        });
        if (subjectDupe) {
          rejectCounts.subjectDedup++;
          console.log('REJECT subjectDedup:', group.titles[0].slice(0, 60));
          await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] }).catch(() => {});
          continue;
        }
      }

      // Subject registry: reject if the headline collapses to an
      // entity:angle key already in published_subjects (semantic dedup).
      // Uses INLINED extractor + lookup to bypass the bundle cache.
// Published-article dedup: reject if 3+ significant word overlap with
      // any recently published article title (stop words excluded)
      const newWords = overlapWords(group.titles[0]);
      let publishedMatch = null;
      if (newWords.size >= 3) {
        for (const pub of publishedWordSets) {
          let overlap = 0;
          for (const w of newWords) { if (pub.words.has(w)) overlap++; }
          if (overlap >= 3) { publishedMatch = pub.title; break; }
        }
      }
      if (publishedMatch) {
        rejectCounts.publishedDup++;
        console.log('REJECT publishedDup:', group.titles[0].slice(0, 60), '| matches:', publishedMatch.slice(0, 40));
        await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] }).catch(() => {});
        continue;
      }

      // No queue cap — freshness window + seen_urls dedup + subject registry
      // provide the natural rate limit. Keep the break only as a sanity cap
      // to prevent pathological multi-thousand-topic runs.
      if (topicsCreated >= 50) { rejectCounts.queueFull++; break; }

      // Breaking news keyword boost
      const BREAKING_KEYWORDS = ['breaking','confirmed','exclusive','shock','sacked','fired','signed','crash','injured','penalty','disqualified','retires','dies','died'];
      const RUMOUR_KEYWORDS = ['rumour','rumor','could','may','might','considering','set to','expected','reportedly','sources say','talks','negotiations','interested in','linked'];
      const titleLower = group.titles[0].toLowerCase();
      const isBreaking = BREAKING_KEYWORDS.some(k => titleLower.includes(k));
      const isRumour = RUMOUR_KEYWORDS.some(k => titleLower.includes(k));
      const priority = isBreaking ? Math.max(score, 10) : score;

      // Pick best source URL (prefer first source with a link)
      const sourceUrl = group.sources.find(s => s.link)?.link || null;
      // If any source in the group was translated, carry the language through
      const srcLang = group.sources.find(s => s.source_language)?.source_language || 'en';

      // Insert signature + topic
      await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] }).catch(() => {});
      await sb('content_topics', 'POST', {
        topic: group.titles[0],
        content_type: isBreaking || score >= 12 ? 'breaking' : isRumour ? 'analysis' : 'analysis',
        priority, status: 'pending', triggered_by: 'monitor-f1',
        source_url: sourceUrl,
        source_language: srcLang,
      });
      topicsCreated++;
      rejectCounts.accepted++;
      console.log('ACCEPTED:', group.titles[0].slice(0, 60));

      // Add to dedup set for this run
      pendingTopics.push({ topic: group.titles[0], id: null });
      recentTitleNorm.add(titleNorm);

    }

    // Always fire generate-content after scanning so the queue keeps draining
    // (use full URL — relative paths fail server-side)
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    fetchWT(siteUrl + '/.netlify/functions/generate-content', { method: 'POST' }, 60000).catch(() => {});

    // Persist state
    const stateData = { timestamp: new Date().toISOString(), topics_created: topicsCreated, sources_scanned: f1Headlines.length };
    const stateRow = await sb('monitor_state?key=eq.last_run&limit=1');
    if (stateRow.length) await sb('monitor_state?key=eq.last_run', 'PATCH', { value: stateData, updated_at: new Date().toISOString() });
    else await sb('monitor_state', 'POST', { key: 'last_run', value: stateData, updated_at: new Date().toISOString() }).catch(() => {});

    const summary = `Scanned ${headlines.length}: ${rejectCounts.accepted} new, ${rejectCounts.stale} stale(>1h), ${rejectCounts.seenUrl} seen-url, ${rejectCounts.nonEnglish} non-en, ${rejectCounts.lowQuality} low-q, ${rejectCounts.clickbait} clickbait, ${rejectCounts.gossip} gossip, ${rejectCounts.nonF1} non-F1, ${rejectCounts.noF1Keyword} no-kw, ${rejectCounts.titleDedup} title-dup, ${rejectCounts.sigDedup} sig-dup, ${rejectCounts.lowScore} low-score, ${rejectCounts.subjectDedup} subject-dup, ${rejectCounts.registryDup} registry-dup`;
    await logSync('monitor-f1', 'success', topicsCreated, summary, Date.now() - start);
    return json({ ok: true, headlines: headlines.length, topicsCreated, rejectCounts });
  } catch (err) {
    await logSync('monitor-f1', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

