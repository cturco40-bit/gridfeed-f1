import { parseStringPromise } from 'xml2js';
import { fetchWT, sb, logSync, json } from './lib/shared.js';

const DRIVERS = ['Verstappen','Hamilton','Leclerc','Norris','Piastri','Russell','Sainz','Alonso','Antonelli','Hadjar','Lindblad','Bottas','Perez','Gasly','Colapinto','Albon','Ocon','Bearman','Lawson','Hulkenberg','Bortoleto','Stroll'];
const TEAMS = ['Ferrari','Mercedes','McLaren','RedBull','Red Bull','AstonMartin','Aston Martin','Alpine','Williams','Haas','Audi','Cadillac','Racing Bulls'];
const EVENTS = ['crash','penalty','contract','engine','dnf','pole','fastest','championship','transfer','injury','retire','ban','protest','appeal','fire','safety','overtake'];
const TIER1 = ['Verstappen','Hamilton','Leclerc','Norris','Antonelli'];
const CIRCUITS = ['Melbourne','Shanghai','Suzuka','Miami','Montreal','Monaco','Barcelona','Madrid','Spielberg','Silverstone','Spa','Budapest','Zandvoort','Monza','Baku','Singapore','Austin','Mexico','Interlagos','Las Vegas','Lusail','Abu Dhabi','Australia','China','Japan','Austria','Belgium','Hungary','Netherlands','Italy','Azerbaijan','Qatar'];
const NON_F1 = [
  'nascar','indycar','indy 500','motogp','wec','le mans','rally','wrc',
  'formula e','super formula','f2','f3','supercars','moto2','moto3','dtm','imsa',
  'bristol motor','daytona','talladega','darlington','martinsville',
  'phoenix raceway','kansas speedway','richmond raceway','pocono',
  'sonoma raceway','watkins glen',
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
];

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
  try {
    // Check recent topic count — max 5 in last hour
    const recentTopics = await sb(`content_topics?select=id&created_at=gt.${new Date(Date.now() - 36e5).toISOString()}`);
    if (recentTopics.length >= 15) {
      await logSync('monitor-f1', 'success', 0, `Topic queue full (${recentTopics.length} in last hour)`, Date.now() - start);
      return json({ ok: true, skipped: 'queue_full' });
    }

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
          return arr.slice(0, 8).map(i => ({
            title: i.title?._ || i.title || '',
            link: i.link?.$ ? i.link.$.href : (i.link || ''),
            source: f.source, region: f.region,
          })).filter(i => i.title);
        } catch { return []; }
      })
    );
    feedResults.forEach(r => { if (r.status === 'fulfilled') headlines.push(...r.value); });

    // Filter non-F1: reject if any non-F1 keyword present, then require at least one F1 keyword
    const f1Headlines = headlines.filter(h => {
      const t = h.title.toLowerCase();
      if (NON_F1.some(kw => t.includes(kw))) return false;
      if (!F1_KEYWORDS.some(kw => t.includes(kw))) return false;
      return true;
    });

    // Group by signature
    const sigGroups = {};
    for (const h of f1Headlines) {
      const sig = makeSignature(h.title);
      if (!sig) continue;
      if (!sigGroups[sig]) sigGroups[sig] = { titles: [], sources: [], regions: new Set() };
      sigGroups[sig].titles.push(h.title);
      sigGroups[sig].sources.push(h);
      sigGroups[sig].regions.add(h.region);
    }

    // Load existing topics from last 24h for title-level dedup (any status)
    // Subject-level dedup window tightened from 24h -> 6h so the pipeline can
    // produce follow-ups on the same drivers/teams as new angles emerge
    const pendingTopics = await sb('content_topics?select=topic,id&created_at=gt.' + new Date(Date.now() - 6 * 36e5).toISOString());
    const recentTitleNorm = new Set(pendingTopics.map(t => normalizeTitle(t.topic)));

    for (const [sig, group] of Object.entries(sigGroups)) {
      if (!sig) continue;

      // Title-level dedup: skip if exact same headline already created as topic in 24h
      const titleNorm = normalizeTitle(group.titles[0]);
      if (recentTitleNorm.has(titleNorm)) continue;

      // Signature dedup (2h window)
      const sigExists = await sb(`topic_signatures?signature=eq.${encodeURIComponent(sig)}&created_at=gt.${new Date(Date.now() - 2 * 36e5).toISOString()}&limit=1`);
      if (sigExists.length) continue;

      const score = scoreStory(group.titles[0], group.regions.size);
      if (score < 3) continue;

      // Subject-level dedup: check if same driver+circuit already pending
      const entities = extractEntities(group.titles[0]);
      if (entities.drivers.length > 0) {
        const subjectDupe = pendingTopics.some(pt => {
          const ptLower = pt.topic.toLowerCase();
          const sameDriver = entities.drivers.some(d => ptLower.includes(d.toLowerCase()));
          const sameCircuit = entities.circuits.length === 0 || entities.circuits.some(c => ptLower.includes(c.toLowerCase()));
          return sameDriver && sameCircuit;
        });
        if (subjectDupe) {
          // Same subject from different source — record signature but skip topic
          await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] }).catch(() => {});
          continue;
        }
      }

      // Re-check queue limit
      if (topicsCreated + recentTopics.length >= 15) break;

      // Breaking news keyword boost
      const BREAKING_KEYWORDS = ['breaking','confirmed','exclusive','shock','sacked','fired','signed','crash','injured','penalty','disqualified','retires','dies','died'];
      const RUMOUR_KEYWORDS = ['rumour','rumor','could','may','might','considering','set to','expected','reportedly','sources say','talks','negotiations','interested in','linked'];
      const titleLower = group.titles[0].toLowerCase();
      const isBreaking = BREAKING_KEYWORDS.some(k => titleLower.includes(k));
      const isRumour = RUMOUR_KEYWORDS.some(k => titleLower.includes(k));
      const priority = isBreaking ? Math.max(score, 10) : score;

      // Pick best source URL (prefer first source with a link)
      const sourceUrl = group.sources.find(s => s.link)?.link || null;

      // Insert signature + topic
      await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] }).catch(() => {});
      await sb('content_topics', 'POST', {
        topic: group.titles[0],
        content_type: isBreaking || score >= 12 ? 'breaking' : isRumour ? 'analysis' : 'analysis',
        priority, status: 'pending', triggered_by: 'monitor-f1',
        source_url: sourceUrl,
      });
      topicsCreated++;

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

    await logSync('monitor-f1', 'success', topicsCreated, `Scanned ${f1Headlines.length} headlines, created ${topicsCreated} topics`, Date.now() - start);
    return json({ ok: true, headlines: f1Headlines.length, topicsCreated });
  } catch (err) {
    await logSync('monitor-f1', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/3 * * * *' };
