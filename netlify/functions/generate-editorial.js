import { sb, fetchWT, logSync, json } from './lib/shared.js';
import { validateArticle, fixEncoding } from './lib/accuracy.js';
import { qualityCheck } from './lib/quality-check.js';
import { classifySemanticallyBlocked } from './lib/semantic-classifier.js';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Permanent editorial blocks — topics we've decided are played out.
// Seeded into published_subjects with a 90-day expiry. Also drive a keyword
// match on the raw prompt text because getSubjectKeyLocal won't always
// produce these exact keys from a phrasing like "midfield battle".
const PERMANENT_BLOCKS = [
  'midfield:battle',
  'regulations:failure',
  'mercedes:dominance',
  'verstappen:retire',
  'verstappen:regulations',
  'history:reset',
];

const DAILY_DRAFT_CAP = 30;

// INLINED subject key extractor — duplicated from lib/subject-registry.js to
// bypass Netlify's function bundle cache. Keep in sync with seed-subjects.js,
// monitor-f1.js, and approve-draft.js.
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

async function isSubjectPublishedLocal(key) {
  if (!key) return false;
  const now = new Date().toISOString();
  try {
    const rows = await sb(`published_subjects?subject=eq.${encodeURIComponent(key)}&or=(expires_at.is.null,expires_at.gt.${now})&select=id&limit=1`);
    return (rows || []).length > 0;
  } catch { return false; }
}

// ═══ VERIFIED 2026 DATA — update after each race weekend ═══
// nextRace + nextRound + nextDate must be the UPCOMING weekend, never a
// race that has already happened. Stale values here generate retrospective
// previews / predictions / betting guides for a race already in the books.
// TODO: pull from races table dynamically so post-race weekend updates are
// not manual.
const STANDINGS = {
  races: 4,
  remaining: 18,
  nextRace: 'Canadian Grand Prix',
  nextRound: 5,
  nextDate: 'May 22-24',
  leaderPts: 100,
  constructorPts: 180,
  keyStats: {
    antonelliWins: 3,
    bearmanPts: 17,
    verstappenPts: 26,
    norrisMiamiP2: true,
  },
};

// ═══ EDITORIAL CONTENT TYPES ═══
const EDITORIAL_TYPES = [
  {
    type: 'POWER_RANKINGS',
    frequency: 'weekly',
    prompts: [
      'Write a power rankings article ranking all 11 F1 teams after {races} races. For each team give a 2-3 sentence verdict and a rating out of 10. Be opinionated — call out who is overperforming and underperforming. Use specific points totals and results.',
      'Write a driver power rankings article ranking the top 10 drivers after {races} races. Focus on who is extracting the most from their machinery. Compare teammates directly. Use specific race results and points.',
    ],
  },
  {
    type: 'RACE_PREVIEW',
    frequency: 'pre-race',
    prompts: [
      'Write a race preview for the {nextRace} (Round {nextRound}, {nextDate}). Cover 5 key storylines: the championship battle, which teams could gain or lose ground, circuit characteristics that suit specific cars, sprint weekend implications, and one wildcard prediction. Use specific standings data.',
      'Write a "5 things to watch" article for the {nextRace}. Each section should be a specific question that will be answered during the weekend. Make each question data-driven with specific numbers.',
      'Write a circuit guide for {nextRace}. Cover track layout, key overtaking zones, how Overtake Mode and Active Aero will be used, tyre strategy options, and historical results. Mention this is a sprint weekend if applicable.',
    ],
  },
  {
    type: 'PREDICTION',
    frequency: 'pre-race',
    prompts: [
      'Write a predictions article for the {nextRace}. Predict: pole position, race winner, podium, fastest lap, first retirement, biggest mover, and a bold prediction. Justify each pick with data from the first {races} races. Be specific and committed — no hedging.',
      'Write a "who wins at {nextRace}?" analysis piece. Compare the top 4 drivers\' chances based on their form, car performance, and circuit suitability. Give each a percentage chance and explain why.',
    ],
  },
  {
    type: 'DEEP_DIVE',
    frequency: 'twice-weekly',
    prompts: [
      'Write a deep dive on the Mercedes vs Ferrari battle in 2026. Mercedes leads {constructorPts} to Ferrari\'s 112 points. Compare their car philosophies, driver lineups, and development trajectories. Where will this fight be by mid-season?',
      'Write an analysis of the 2026 rookie class: Antonelli, Bearman, Hadjar, Lindblad, and Bortoleto. Compare their first {races} races. Who is exceeding expectations? Who is struggling? Use specific results and points.',
      'Write an analysis of why Red Bull went from 4 consecutive titles to {verstappenPts} points in {races} races. Cover the personnel losses (Newey, Marshall, Stevenson), the chassis problems, and whether ADUO can help Honda close the engine gap.',
      'Write a piece about the midfield battle behind the top three: Red Bull (30), Alpine (21), Haas (18), and Racing Bulls (14). Who wins this fight and why? Use specific driver and constructor points.',
      'Write about McLaren\'s Miami breakthrough. Norris finished P5 in the first three races then took P2 at Miami; Piastri took P3. Has the MCL61 found pace, or did Miami flatter them? Compare Norris and Piastri\'s seasons.',
      'Write about Cadillac\'s debut F1 season. Zero points from Perez and Bottas. How does this compare to other team debuts? What are realistic expectations for their first year? When might they score their first point?',
      'Write about Hamilton\'s move to Ferrari. Four races in, he has 49 points to Leclerc\'s 63. Is the partnership working? Compare their qualifying and race performances. Is Hamilton adapting to the car or is the car limiting him?',
      'Write about the Overtake Mode and Active Aero system. Four races of data — is it delivering better racing than DRS? Analyse overtaking statistics and whether the regulations are achieving their goals.',
      'Write about Fernando Alonso\'s situation. Zero points at 44 years old. Aston Martin dead last in constructors. Is this how a legend should end his career? What does the data show about his driving vs the car\'s limitations?',
      'Write about the championship maths. Antonelli has {leaderPts} points from {races} races. At this rate, what does the final standings projection look like? When is the earliest Antonelli can clinch? When does it become mathematically impossible for Russell?',
    ],
  },
  // BETTING_GUIDE removed 2026-05-05 — picks/betting feature pulled from
  // the product. Editorial pipeline no longer generates betting content.
  {
    type: 'OPINION',
    frequency: 'twice-weekly',
    prompts: [
      'Write an opinion piece arguing that Antonelli is already the best driver on the grid at 19 years old. Use his {leaderPts} points, {antonelliWins} wins, and race pace data to make the case. Acknowledge the start problems but argue they are fixable while raw speed is not teachable.',
      'Write an opinion piece arguing that the 2026 regulations have failed to close the gap between the front and back of the grid. Mercedes at {constructorPts} points vs Cadillac/Aston Martin at 0. Is this worse than 2014?',
      'Write a contrarian opinion piece arguing Russell, not Antonelli, will win the 2026 championship. Russell has 1 win, no start problems, and consistent points. Make the case that consistency beats brilliance over 22 races.',
      'Write an opinion piece about whether F1 should have cancelled Bahrain and Saudi Arabia or found replacement races. What did the cancellations mean financially? Did the compressed calendar help or hurt the competition?',
    ],
  },
  {
    type: 'DATA_STORY',
    frequency: 'weekly',
    prompts: [
      'Write a data-driven article about qualifying vs race performance across the grid. Which drivers gain the most positions on Sunday? Which lose the most? Use specific qualifying and race positions from all {races} rounds.',
      'Write a data piece about constructor points efficiency — points per dollar of budget cap. Which teams are getting the most from their resources? Which are wasting money?',
      'Write a "by the numbers" article recapping the first {races} races of 2026 with 10-15 striking statistics. Each stat should tell a story. Format as numbered items with 1-2 sentences of context each.',
    ],
  },
  {
    type: 'HISTORICAL',
    frequency: 'weekly',
    prompts: [
      'Write a comparison between Antonelli\'s 2026 start and other great rookie seasons in F1 history — Hamilton 2007, Verstappen 2015, Leclerc 2019, Russell 2022. How does Antonelli\'s {leaderPts} points from {races} races compare at the same stage?',
      'Write about regulation resets in F1 history — 2014, 2009, 2006, 1998. What happened to the dominant teams? How long did it take the field to converge? What does history tell us about how 2026 will develop?',
    ],
  },
];

function fillTemplate(prompt) {
  return prompt
    .replace(/\{races\}/g, STANDINGS.races)
    .replace(/\{remaining\}/g, STANDINGS.remaining)
    .replace(/\{nextRace\}/g, STANDINGS.nextRace)
    .replace(/\{nextRound\}/g, STANDINGS.nextRound)
    .replace(/\{nextDate\}/g, STANDINGS.nextDate)
    .replace(/\{leaderPts\}/g, STANDINGS.leaderPts)
    .replace(/\{constructorPts\}/g, STANDINGS.constructorPts)
    .replace(/\{verstappenPts\}/g, STANDINGS.keyStats.verstappenPts)
    .replace(/\{bearmanPts\}/g, STANDINGS.keyStats.bearmanPts)
    .replace(/\{antonelliWins\}/g, STANDINGS.keyStats.antonelliWins)
    ;
}

// Light suffix stripper so keyword-block matches "failed"/"failure"/"failing",
// "dominance"/"dominant"/"dominates", "retire"/"retirement", etc. Not a
// real stemmer — just common English endings stripped longest-first.
function stemWord(w) {
  w = (w || '').toLowerCase();
  if (w.length <= 4) return w;
  const suffixes = ['ational','ations','ation','ments','ment','nesses','ness','ances','ance','ences','ence','ings','ing','ures','ure','ers','er','ies','ied','ily','ly','ed','es','s','e','y'];
  for (const s of suffixes) {
    if (w.length > s.length + 2 && w.endsWith(s)) return w.slice(0, -s.length);
  }
  return w;
}

// Pick a topic whose likely subject key isn't in the blocked set. Each
// prompt has the subject it's about encoded directly in its text — we
// extract the key from the prompt with getSubjectKeyLocal and reject any
// prompt whose key is already covered. Returns null if every prompt is
// blocked (natural rate limit — wait for new events).
async function pickTopicFiltered(blockedKeys, blockedRecords) {
  const shuffled = [...EDITORIAL_TYPES].sort(() => Math.random() - 0.5);
  for (const type of shuffled) {
    const prompts = [...type.prompts].sort(() => Math.random() - 0.5);
    for (const prompt of prompts) {
      const filled = fillTemplate(prompt);
      const expectedKey = getSubjectKeyLocal(filled);
      if (expectedKey && blockedKeys.has(expectedKey)) {
        const rec = (blockedRecords || []).find(r => r.subject === expectedKey);
        console.log(`[generate-editorial] Skipping topic: ${expectedKey} — blocked until ${rec?.expires_at || 'permanent'}`);
        continue;
      }
      const promptStems = new Set(
        filled.toLowerCase().split(/[\s\-:,.'!?()"]+/).filter(Boolean).map(stemWord)
      );
      let matched = null;
      for (const rec of (blockedRecords || [])) {
        const parts = (rec.subject || '').split(':').filter(Boolean);
        if (!parts.length) continue;
        const hit = parts.every(part => {
          const partStem = stemWord(part);
          if (partStem.length < 3) return false;
          for (const ws of promptStems) {
            if (ws === partStem) return true;
            if (ws.length >= 4 && ws.startsWith(partStem)) return true;
            if (partStem.length >= 4 && partStem.startsWith(ws)) return true;
          }
          return false;
        });
        if (hit) { matched = rec; break; }
      }
      if (matched) {
        console.log(`[generate-editorial] Skipping topic: ${matched.subject} — blocked until ${matched.expires_at || 'permanent'}`);
        continue;
      }
      return { type: type.type, prompt, expectedKey };
    }
  }
  return null;
}

async function pickTopic() {
  // Pull recent article titles + pending draft titles to avoid repeats
  const recentArts = await sb('articles?status=eq.published&select=title,tags&order=published_at.desc&limit=30');
  const pendingDrafts = await sb('content_drafts?review_status=in.(pending,approved)&select=title&limit=20');
  const recentTitles = (recentArts || []).map(a => (a.title || '').toLowerCase());
  const pendingTitles = (pendingDrafts || []).map(d => (d.title || '').toLowerCase());
  const allTitles = [...recentTitles, ...pendingTitles];

  const typeMatchers = {
    POWER_RANKINGS: (t) => t.includes('power rank') || t.includes('rankings'),
    RACE_PREVIEW: (t) => t.includes('preview') || t.includes('things to watch'),
    PREDICTION: (t) => t.includes('prediction') || t.includes('who wins'),
    DATA_STORY: (t) => t.includes('by the numbers') || t.includes('data'),
    HISTORICAL: (t) => t.includes('rookie season') || t.includes('regulation reset'),
  };

  const shuffled = [...EDITORIAL_TYPES].sort(() => Math.random() - 0.5);
  for (const type of shuffled) {
    const matcher = typeMatchers[type.type];
    const recentlyUsed = matcher ? allTitles.some(matcher) : false;
    // Skip weekly types if they've appeared recently; deep dives and opinions can
    // fire more often
    if (recentlyUsed && (type.frequency === 'weekly' || type.frequency === 'pre-race')) continue;
    const prompt = type.prompts[Math.floor(Math.random() * type.prompts.length)];
    return { type: type.type, prompt };
  }

  // Fallback: deep dive
  const fallback = EDITORIAL_TYPES.find(t => t.type === 'DEEP_DIVE');
  return {
    type: 'DEEP_DIVE',
    prompt: fallback.prompts[Math.floor(Math.random() * fallback.prompts.length)],
  };
}

const SYSTEM_PROMPT = `CRITICAL — READ BEFORE WRITING:
Leclerc has TWO podiums, not three. Across four races his results are P3, P4, P3, P6.
P4 and P6 are NOT podiums. If you write "three podiums" the article will be rejected.

You are GridFeed, an independent F1 news and analysis platform. Write original editorial content in a direct, opinionated sports journalism voice.

RULES:
- Write 400-700 words
- Use specific numbers, points totals, and race results — never vague
- Be opinionated — take a position, don't hedge
- Every claim must be supported by data
- End with a forward-looking statement about the next race
- No fabricated quotes — you can paraphrase public statements but never invent direct quotes
- Do not use phrases like "sources confirm" or "according to briefings"
- CRITICAL: Leclerc has TWO podiums (R1 P3, R3 P3) — NOT three
- CRITICAL: Antonelli has 100 TOTAL points after Miami, leads Russell by 20
- CRITICAL: Norris is the DEFENDING 2025 champion, not Verstappen
- CRITICAL: No DRS in 2026 — Overtake Mode and Active Aero replaced it
- CRITICAL: Hamilton drives for Ferrari, Antonelli for Mercedes
- CRITICAL: Alonso has ZERO points
- CRITICAL: Aston Martin has ZERO constructor points

2026 VERIFIED STANDINGS (after Round 4 Miami — current):
Drivers: P1 Antonelli 100, P2 Russell 80, P3 Leclerc 63, P4 Norris 51, P5 Hamilton 49, P6 Piastri 43, P7 Verstappen 26, P8 Bearman 17, P9 Gasly 16, P10 Lawson 10
Constructors: P1 Mercedes 180, P2 Ferrari 112, P3 McLaren 94, P4 Red Bull 30, P5 Alpine 21, P6 Haas 18, P7 Racing Bulls 14, P8 Williams 5, P9 Audi 2, P10 Cadillac 0, P11 Aston Martin 0

Next race: ${STANDINGS.nextRace}, Round ${STANDINGS.nextRound}, ${STANDINGS.nextDate}

FORMAT:
Return a JSON object:
{
  "title": "headline in title case",
  "excerpt": "one-sentence summary under 180 characters",
  "body": "full article text with paragraph breaks as double newlines",
  "tags": ["TAG1"]
}

Tags must be one of: ANALYSIS, PREVIEW, CHAMPIONSHIP, OPINION
Do NOT wrap in markdown code fences. Return raw JSON only.`;

async function generateArticle(topic) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  const filled = fillTemplate(topic.prompt);
  const res = await fetchWT('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: filled }],
    }),
  }, 60000);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Claude API: ' + errText.slice(0, 300));
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  // Strip accidental code fences and locate the JSON block
  const cleaned = text.replace(/```json\n?|```/g, '').trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('No JSON in Claude response');
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
  parsed.title = fixEncoding(parsed.title || '');
  parsed.body = fixEncoding(parsed.body || '');
  parsed.excerpt = fixEncoding(parsed.excerpt || '');
  return parsed;
}

export default async (req) => {
  const start = Date.now();
  try {
    // 0. Daily draft cap — stop generating if DAILY_DRAFT_CAP drafts have
    // already been created in the last 24h.
    const twentyFourAgo = new Date(Date.now() - 24 * 36e5).toISOString();
    const dayDrafts = await sb(`content_drafts?select=id&created_at=gte.${twentyFourAgo}&limit=100`).catch(() => []);
    if ((dayDrafts || []).length >= DAILY_DRAFT_CAP) {
      await logSync('generate-editorial', 'success', 0, `Daily cap reached (${dayDrafts.length}/${DAILY_DRAFT_CAP})`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'daily_cap', count: dayDrafts.length });
    }

    // 0b. Seed permanent editorial blocks (90-day expiry) if missing.
    const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 36e5).toISOString();
    const permIn = PERMANENT_BLOCKS.map(encodeURIComponent).join(',');
    const existingPerm = await sb(`published_subjects?subject=in.(${permIn})&select=subject&limit=20`).catch(() => []);
    const havePerm = new Set((existingPerm || []).map(r => r.subject));
    for (const key of PERMANENT_BLOCKS) {
      if (!havePerm.has(key)) {
        await sb('published_subjects', 'POST', {
          subject: key,
          article_id: null,
          expires_at: ninetyDaysOut,
        }).catch(() => {});
      }
    }

    // Build blocked-subject set from registry + recent drafts + recent articles
    const blockedKeys = new Set();
    const nowIso = new Date().toISOString();
    const fortyEightAgo = new Date(Date.now() - 48 * 36e5).toISOString();
    const thirtyRecent = await sb('articles?status=eq.published&select=title&order=published_at.desc&limit=30').catch(() => []);
    const draftsRecent = await sb(`content_drafts?select=title&created_at=gte.${fortyEightAgo}&order=created_at.desc&limit=50`).catch(() => []);
    const registryRows = await sb(`published_subjects?select=subject,expires_at&or=(expires_at.is.null,expires_at.gt.${nowIso})&limit=200`).catch(() => []);
    const blockedRecords = [];
    for (const r of (registryRows || [])) {
      if (r.subject) {
        blockedKeys.add(r.subject);
        blockedRecords.push({ subject: r.subject, expires_at: r.expires_at });
      }
    }
    for (const r of (thirtyRecent || [])) { const k = getSubjectKeyLocal(r.title); if (k) blockedKeys.add(k); }
    for (const r of (draftsRecent || [])) { const k = getSubjectKeyLocal(r.title); if (k) blockedKeys.add(k); }

    // 2. Pick a topic whose likely subject key is NOT blocked and whose
    // prompt text doesn't match any blocked subject's keyword parts
    // (stem-matched so "regulations failed" catches regulations:failure).
    const topic = await pickTopicFiltered(blockedKeys, blockedRecords);
    if (!topic) {
      await logSync('generate-editorial', 'success', 0, `All subjects covered (${blockedKeys.size} blocked)`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'all_subjects_covered', blocked: blockedKeys.size });
    }
    console.log('[generate-editorial] type:', topic.type, '| expectedKey:', topic.expectedKey || 'n/a');

    // 2b. Semantic classifier — last-line check on the chosen prompt before
    // we spend a full-article Claude call. Catches angles that slip through
    // stem matching (e.g. a Mercedes deep-dive prompt with no literal form
    // of "dominance"). Permits on any classifier error.
    const filledForClassifier = fillTemplate(topic.prompt);
    const semantic = await classifySemanticallyBlocked(filledForClassifier, Array.from(blockedKeys), { timeoutMs: 5000, source: 'generate-editorial' });
    if (semantic.blocked) {
      console.log(`[generate-editorial] Skipping topic: ${semantic.matched || '(semantic)'} — ${semantic.reason}`);
      await logSync('generate-editorial', 'success', 0, `Semantic blocked (${semantic.matched || '?'}): "${filledForClassifier.slice(0, 60)}" — ${semantic.reason}`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'semantic_blocked', matched: semantic.matched });
    }

    // 3. Generate article
    const article = await generateArticle(topic);
    console.log('[generate-editorial] title:', article.title);

    // 4a. Quality check — catches runaway generation, leaked metadata,
    // orphan fragments, empty markers, bad title length
    const qc = qualityCheck(article.title, article.body);
    if (!qc.valid) {
      await logSync('generate-editorial', 'quality_failed', 0, `${topic.type}: ${qc.errors.join('; ')} — "${(article.title || '').slice(0, 40)}"`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'quality_failed', errors: qc.errors });
    }

    // 4b. Validate factual accuracy (same gates as news pipeline)
    const validation = validateArticle(article);
    if (!validation.valid) {
      await logSync('generate-editorial', 'validation_failed', 0, `${topic.type}: ${validation.reason} — "${(article.title || '').slice(0, 50)}"`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'validation_failed', detail: validation.reason });
    }

    // 5. Dedup against existing drafts (exact title)
    const dup = await sb(`content_drafts?title=eq.${encodeURIComponent(article.title)}&limit=1`);
    if ((dup || []).length) {
      await logSync('generate-editorial', 'success', 0, `Duplicate title skipped: ${article.title.slice(0, 50)}`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'duplicate_title' });
    }

    // 5b. Subject registry — reject if this subject was already published
    const newKey = getSubjectKeyLocal(article.title);
    if (newKey && await isSubjectPublishedLocal(newKey)) {
      await logSync('generate-editorial', 'success', 0, `Subject already published: ${newKey} — "${article.title.slice(0, 40)}"`, Date.now() - start);
      return json({ ok: true, generated: 0, reason: 'subject_published', key: newKey });
    }

    // 5c. Recent-draft dedup — reject if a draft with the same subject key
    // was created in the last 8 hours (catches back-to-back editorial runs
    // picking different templates that resolve to the same subject)
    if (newKey) {
      const eightHoursAgo = new Date(Date.now() - 8 * 36e5).toISOString();
      const recentDrafts = await sb(`content_drafts?select=title&created_at=gte.${eightHoursAgo}&order=created_at.desc&limit=20`);
      for (const draft of (recentDrafts || [])) {
        const draftKey = getSubjectKeyLocal(draft.title);
        if (draftKey && draftKey === newKey) {
          await logSync('generate-editorial', 'success', 0, `Recent draft subject dupe: ${newKey}`, Date.now() - start);
          return json({ ok: true, generated: 0, reason: 'recent_draft', key: newKey });
        }
      }
    }

    // 6. Save draft (matches generate-content.js column shape)
    const tags = Array.isArray(article.tags) && article.tags.length ? article.tags : ['ANALYSIS'];
    await sb('content_drafts', 'POST', {
      title: article.title,
      body: article.body,
      excerpt: article.excerpt,
      tags,
      content_type: 'analysis',
      review_status: 'pending',
      source_context: { editorial_type: topic.type, prompt: topic.prompt.slice(0, 240) },
      priority_score: 6,
      generation_model: 'GridFeed Editorial',
      race_id: null,
    });

    // 6b. Register the subject with a 48h expiry so the NEXT editorial run
    // sees it and skips. Shorter than the news-pipeline 7-day window because
    // editorial pieces are allowed to re-cover the same subject quicker —
    // but not within the same work session.
    if (newKey) {
      await sb('published_subjects', 'POST', {
        subject: newKey,
        article_id: null,
        expires_at: new Date(Date.now() + 48 * 36e5).toISOString(),
      }).catch(() => {});
    }

    // 7. Notify admin (fire and forget)
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    fetchWT(siteUrl + '/.netlify/functions/notify-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: article.title, content_type: 'editorial', priority_score: 6, excerpt: (article.excerpt || '').slice(0, 200) }),
    }, 5000).catch(() => {});

    await logSync('generate-editorial', 'success', 1, `${topic.type}: "${article.title}" [${newKey || 'no-key'}]`, Date.now() - start);
    return json({ ok: true, generated: 1, type: topic.type, title: article.title, subject_key: newKey });
  } catch (err) {
    await logSync('generate-editorial', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};

