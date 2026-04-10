import { parseStringPromise } from 'xml2js';
import { fetchWT, sb, logSync, json } from './lib/shared.js';

const DRIVERS = ['Verstappen','Hamilton','Leclerc','Norris','Piastri','Russell','Sainz','Alonso','Antonelli','Hadjar','Lindblad','Bottas','Perez'];
const TEAMS = ['Ferrari','Mercedes','McLaren','RedBull','AstonMartin','Alpine','Williams','Haas','Audi','Cadillac'];
const EVENTS = ['crash','penalty','contract','engine','dnf','pole','fastest','championship','transfer','injury','retire','ban','protest','appeal','fire','safety'];
const TIER1 = ['Verstappen','Hamilton','Leclerc','Norris','Antonelli'];

const RSS_FEEDS = [
  { url: 'https://www.formula1.com/content/fom-website/en/latest.xml', source: 'Formula1.com', region: '🌍' },
  { url: 'https://www.autosport.com/rss/f1/news/', source: 'Autosport', region: '🇬🇧' },
  { url: 'https://www.motorsport.com/rss/f1/news/', source: 'Motorsport.com', region: '🇬🇧' },
  { url: 'https://the-race.com/feed/', source: 'The Race', region: '🇬🇧' },
  { url: 'https://www.racefans.net/feed/', source: 'RaceFans', region: '🇬🇧' },
  { url: 'https://www.planetf1.com/feed/', source: 'PlanetF1', region: '🇬🇧' },
  { url: 'https://www.skysports.com/rss/12433', source: 'Sky Sports F1', region: '🇬🇧' },
  { url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml', source: 'BBC Sport F1', region: '🇬🇧' },
  { url: 'https://www.gpblog.com/en/rss', source: 'GPblog', region: '🇳🇱' },
  { url: 'https://wtf1.com/feed/', source: 'WTF1', region: '🇬🇧' },
  { url: 'https://www.crash.net/rss/f1', source: 'Crash.net', region: '🇬🇧' },
  { url: 'https://www.gpfans.com/en/rss/', source: 'GPFans', region: '🇳🇱' },
  { url: 'https://www.espn.com/espn/rss/racing/news', source: 'ESPN F1', region: '🇺🇸' },
  { url: 'https://beyondtheflag.com/feed/', source: 'Beyond the Flag', region: '🇺🇸' },
  { url: 'https://f1chronicle.com/feed/', source: 'F1 Chronicle', region: '🇬🇧' },
  { url: 'https://www.gazzetta.it/rss/formula1.xml', source: 'Gazzetta', region: '🇮🇹' },
  { url: 'https://it.motorsport.com/rss/f1/news/', source: 'Motorsport Italia', region: '🇮🇹' },
  { url: 'https://www.auto-motor-und-sport.de/rss/formel-1/', source: 'Auto Motor Sport', region: '🇩🇪' },
  { url: 'https://www.gptoday.net/en/rss', source: 'GPToday', region: '🇳🇱' },
  { url: 'https://www.marca.com/rss/motor/formula1.xml', source: 'Marca', region: '🇪🇸' },
  { url: 'https://br.motorsport.com/rss/f1/news/', source: 'Motorsport Brasil', region: '🇧🇷' },
];

function wordOverlap(a, b) {
  const wa = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

function makeSignature(title) {
  const t = title.toLowerCase();
  return [...DRIVERS, ...TEAMS, ...EVENTS].filter(e => t.includes(e.toLowerCase())).sort().join('-');
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
    // Daily cap check — count drafts created today only
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const liveRaces = await sb('races?status=eq.in_progress&select=id');
    const isRaceWeekend = liveRaces.length > 0;
    const DAILY_CAP = isRaceWeekend ? 15 : 8;
    const todayDrafts = await sb('content_drafts?select=id&created_at=gte.' + todayStart.toISOString());
    if (todayDrafts.length >= DAILY_CAP) {
      await logSync('monitor-f1', 'success', 0, `Daily cap reached (${todayDrafts.length}/${DAILY_CAP})`, Date.now() - start);
      return json({ ok: true, skipped: 'Daily cap reached', count: todayDrafts.length, cap: DAILY_CAP });
    }

    // Fetch all RSS in parallel (title+link only)
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
            source: f.source,
            region: f.region,
          })).filter(i => i.title);
        } catch { return []; }
      })
    );
    feedResults.forEach(r => { if (r.status === 'fulfilled') headlines.push(...r.value); });

    // Group by signature
    const sigGroups = {};
    for (const h of headlines) {
      const sig = makeSignature(h.title);
      if (!sig) continue;
      if (!sigGroups[sig]) sigGroups[sig] = { titles: [], sources: [], regions: new Set() };
      sigGroups[sig].titles.push(h.title);
      sigGroups[sig].sources.push({ source: h.source, title: h.title, link: h.link, region: h.region });
      sigGroups[sig].regions.add(h.region);
    }

    // Process each signature
    for (const [sig, group] of Object.entries(sigGroups)) {
      if (!sig) continue;
      // Dedup check
      const existing = await sb(`topic_signatures?signature=eq.${encodeURIComponent(sig)}&created_at=gt.${new Date(Date.now() - 48 * 36e5).toISOString()}&limit=1`);
      if (existing.length) continue;

      const score = scoreStory(group.titles[0], group.regions.size);
      if (score < 7) continue;

      // Insert signature
      await sb('topic_signatures', 'POST', { signature: sig, first_seen_title: group.titles[0] });

      // Create content topic
      const sourceContext = group.sources.slice(0, 5).map(s => `${s.region} ${s.source}: "${s.title}"`);
      await sb('content_topics', 'POST', {
        topic: group.titles[0],
        content_type: score >= 12 ? 'breaking' : 'analysis',
        priority: score,
        status: 'pending',
        triggered_by: 'monitor-f1',
      });
      topicsCreated++;

      // If BREAKING, trigger generate-content
      if (score >= 12) {
        try { fetchWT('/.netlify/functions/generate-content', { method: 'POST' }, 5000).catch(() => {}); } catch {}
      }
    }

    // Persist state
    const stateData = { timestamp: new Date().toISOString(), topics_created: topicsCreated, sources_scanned: headlines.length };
    const existing = await sb('monitor_state?key=eq.last_run&limit=1');
    if (existing.length) await sb('monitor_state?key=eq.last_run', 'PATCH', { value: stateData, updated_at: new Date().toISOString() });
    else await sb('monitor_state', 'POST', { key: 'last_run', value: stateData, updated_at: new Date().toISOString() }).catch(() => {});

    await logSync('monitor-f1', 'success', topicsCreated, `Scanned ${headlines.length} headlines, created ${topicsCreated} topics`, Date.now() - start);
    return json({ ok: true, headlines: headlines.length, topicsCreated });
  } catch (err) {
    await logSync('monitor-f1', 'error', 0, err.message, Date.now() - start, err.stack);
    return json({ error: err.message }, 500);
  }
};

export const config = { schedule: '*/5 * * * *' };
