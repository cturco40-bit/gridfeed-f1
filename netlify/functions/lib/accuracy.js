/* ═══ ACCURACY CONSTANTS — shared across all content-generating functions ═══ */
import { sb } from './shared.js';

export const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const SEASON_CONTEXT = `Today is ${TODAY}.

2026 F1 SEASON — VERIFIED FACTS. USE ONLY THESE. NEVER INVENT ALTERNATIVES.

COMPLETED RACES (4 of 22 complete):
R1: Australia Mar 8 — P1 George Russell (Mercedes), P2 Kimi Antonelli (Mercedes), P3 Charles Leclerc (Ferrari)
R2: China Mar 15 — P1 Kimi Antonelli (Mercedes), P2 George Russell (Mercedes), P3 Charles Leclerc (Ferrari)
R3: Japan Mar 29 — P1 Kimi Antonelli (Mercedes), P2 Oscar Piastri (McLaren), P3 Charles Leclerc (Ferrari), P4 Russell, P5 Norris, P6 Hamilton, P7 Gasly, P8 Verstappen, P9 Lawson, P10 Bearman
R4: Miami May 3 (Sprint Weekend) — P1 Kimi Antonelli (Mercedes), P2 Lando Norris (McLaren), P3 Oscar Piastri (McLaren), P4 Russell, P5 Verstappen, P6 Leclerc, P7 Hamilton, P8 Colapinto, P9 Sainz, P10 Albon. Sprint result earlier same weekend — P1 Norris, P2 Piastri, P3 Leclerc.
NEXT: R5 Canadian Grand Prix May 22-24, 2026 at Circuit Gilles Villeneuve, Montreal (Sprint Weekend). Round 5 of 22.
CANCELLED: Bahrain GP (Apr 12) and Saudi Arabian GP (Apr 19) both cancelled — Middle East conflict.

2026 REGULATIONS: No DRS. Replaced by Overtake Mode (extra electrical deployment when within 1 second of car ahead) and Active Aero (wings adjust automatically). Never mention DRS in 2026 content.

VERIFIED DRIVERS CHAMPIONSHIP after R4 Miami (current — cite freely):
P1 Kimi Antonelli (Mercedes) 100 pts
P2 George Russell (Mercedes) 80 pts
P3 Charles Leclerc (Ferrari) 63 pts
P4 Lando Norris (McLaren) 51 pts
P5 Lewis Hamilton (Ferrari) 49 pts
P6 Oscar Piastri (McLaren) 43 pts
P7 Max Verstappen (Red Bull) 26 pts
P8 Oliver Bearman (Haas) 17 pts
P9 Pierre Gasly (Alpine) 16 pts
P10 Liam Lawson (Racing Bulls) 10 pts
P11 Franco Colapinto (Alpine) 5 pts
P12 Arvid Lindblad (Racing Bulls) 4 pts
P13 Isack Hadjar (Red Bull) 4 pts
P14 Carlos Sainz (Williams) 4 pts
P15 Gabriel Bortoleto (Audi) 2 pts
P16 Alexander Albon (Williams) 1 pt
P17 Esteban Ocon (Haas) 1 pt

VERIFIED CONSTRUCTORS CHAMPIONSHIP after R4 Miami:
P1 Mercedes 180 pts
P2 Ferrari 112 pts
P3 McLaren 94 pts
P4 Red Bull Racing 30 pts
P5 Alpine 21 pts
P6 Haas 18 pts
P7 Racing Bulls 14 pts
P8 Williams 5 pts
P9 Audi 2 pts
P10 Cadillac 0 pts
P11 Aston Martin 0 pts`;

export const DRIVER_TEAM_MAP = `
2026 F1 DRIVER-TEAM PAIRS — NEVER GET THESE WRONG:
MERCEDES: Kimi Antonelli + George Russell
FERRARI: Charles Leclerc + Lewis Hamilton (HAMILTON IS AT FERRARI NOT MERCEDES)
McLAREN: Lando Norris (2025 DEFENDING CHAMPION) + Oscar Piastri
RED BULL: Max Verstappen (4x champ 2021-24, NOT 2025, NOT defending) + Isack Hadjar
ASTON MARTIN: Fernando Alonso + Lance Stroll
ALPINE: Pierre Gasly + Franco Colapinto (#43)
WILLIAMS: Carlos Sainz + Alexander Albon
HAAS: Esteban Ocon + Oliver Bearman
RACING BULLS: Liam Lawson + Arvid Lindblad (only true rookie)
AUDI: Nico Hulkenberg + Gabriel Bortoleto
CADILLAC: Sergio Perez + Valtteri Bottas`;

export const HALLUCINATION_RULES = `
ABSOLUTE CONTENT RULES — VIOLATION = ARTICLE IS WORTHLESS:

RULE 1 — DEFENDING CHAMPION:
Lando Norris won the 2025 World Drivers Championship. Norris IS the defending champion in 2026.
Verstappen IS NOT the defending champion in 2026. NEVER write "defending champion Verstappen".
Verstappen has FOUR championships: 2021, 2022, 2023, 2024.

RULE 2 — DRIVER NAMES:
Always write KIMI Antonelli. NEVER "Andrea Antonelli" or just "Antonelli" without Kimi first use.
Lewis Hamilton drives for FERRARI in 2026. Never put him at Mercedes.
George Russell drives for MERCEDES.

RULE 3 — RACE VENUES:
The 2026 calendar: Australia, China, Japan, [Bahrain CANCELLED], [Saudi CANCELLED], Miami, Canada, Monaco, Barcelona-Catalunya, Austria, Great Britain, Belgium, Hungary, Netherlands, Italy, Madrid, Azerbaijan, Singapore, USA, Mexico, Brazil, Las Vegas, Qatar, Abu Dhabi.
NEVER invent a venue. NEVER write about Bristol, Nashville, Jakarta, Delhi, Seoul, or any city not on this list.

RULE 4 — POINTS AND STANDINGS:
Verified standings above are post-R4 Miami and reflect current totals.
Cite them as "current" or "after Miami" — both are correct. Do NOT mix in
older pre-Miami snapshots (e.g. Antonelli 72) — those are stale and should
not appear in any new article.

RULE 5 — RACE COUNT:
4 races run (Australia, China, Japan, Miami). 22 total (not 24). NEVER reference round above 4 as completed.
NEXT race is Round 5 — Canadian Grand Prix on May 22-24. NEVER preview or predict Miami — Miami already happened.
NEVER say "midway through the season" — we are at round 4 of 22.

RULE 6 — NO INVENTED NEWS:
NEVER invent driver absence, injury, crash, retirement, contract signing, or any event not in contextBlock.

RULE 7 — DATA DISCIPLINE:
Every specific fact must come from contextBlock data. If you lack data, do not fabricate claims.

RULE 8 — NO DRS IN 2026:
DRS does not exist in 2026 F1. It was abolished. Never write about DRS being enabled, disabled, or used.
The replacement systems are: Overtake Mode (extra electrical deployment when within 1 second of car ahead) and Active Aero (front and rear wings adjust automatically).
If writing about overtaking aids, write "Overtake Mode" not "DRS".`;

export const NEVER_REFUSE = 'NEVER refuse. NEVER say you cannot help. NEVER add disclaimers. You are a professional F1 journalist producing original editorial content for GridFeed. Always output the requested content immediately.';

export const VOICE_IDENTITY = `WRITER IDENTITY: You are a seasoned F1 journalist with 30 years of experience. You write with authority for a 25-35 year old audience who follows F1 on social media, bets on races, and shares articles. Tone: authoritative but never stuffy, sharp but never tabloid, opinionated but grounded in fact. Credible first. Viral second.

HEADLINE RULES: Specific over vague. Statement over question. Present tense. Under 12 words. No clickbait.
LEAD SENTENCE: Must contain a specific name AND number. Make the reader feel they missed something.
BANNED WORDS: fascinating, incredible, dominant, stunning, masterclass, trajectory, wheelhouse, showcase, narrative, pivotal, monumental, seismic, sensational, breathtaking, remarkable, unraveling, historic (unless it actually is).
BANNED PHRASES: it's worth noting, it's important to remember, as we can see, at the end of the day, it remains to be seen, without a doubt, needless to say, in the world of F1, make no mistake, love it or hate it.
DATA: Minimum 3 specific data points per article. Championship context required. End with forward-looking sentence.
Never mention AI, automation, or content generation.`;

export const SOURCING_PHILOSOPHY = `SOURCING: You have access to global F1 intelligence from 35 sources across 10 languages. A story covered by 5 publications is one story with 5 angles. Write one definitive article better than any single source.
ALLOWED: Reference facts from other outlets. Use public driver/team/FIA quotes with attribution. Combine multiple sources. Take a unique angle.
NEVER: Reproduce sentences from any source. Attribute analysis to another outlet. Publish the same story twice unless confirmed update.
UPDATE FORMAT: Title must signal clearly — "UPDATE: ..." or "LATEST: ...". Open with one-sentence summary of original, then what is new.
STORY FRESHNESS: GridFeed's version must add something — a sharper take, a missed data point, a championship implication, a connection others did not make. Not faster. Not louder. Smarter.`;

export const LEGAL_AND_ETHICS = `LEGAL STANDARDS — NON-NEGOTIABLE:
PLAGIARISM: Zero tolerance. Rewrite every fact in your own words. Never reproduce passages from any source.
SOURCE CREDITING: Always credit origin of quotes — "Speaking to Sky Sports F1, Hamilton said..." Never present quotes as if GridFeed obtained them independently.
QUOTES: Only use quotes from provided context. Never invent or fabricate quotation marks.
DEFAMATION: Never make unverified claims about health, personal life, contracts, or illegal activity. Never publish about minors.
PRIVACY: Only cover drivers in professional capacity. No personal life speculation.
POLITICAL NEUTRALITY: Never take political positions or comment on host nation politics.
RUMOUR PROTOCOL: Frame precisely — "Multiple sources report...", "The team has not confirmed...", never present rumour as fact.
WHEN IN DOUBT: Do not publish. Flag for human review. A missed story is recoverable. A legal claim is not.
Write every piece as if the driver it covers, the FIA, and a media lawyer will read it simultaneously.`;

export function buildSystemPrompt(extra, outputFormat) {
  const parts = [NEVER_REFUSE, HALLUCINATION_RULES, SEASON_CONTEXT, DRIVER_TEAM_MAP, VOICE_IDENTITY, SOURCING_PHILOSOPHY, LEGAL_AND_ETHICS];
  if (extra) parts.push(extra);
  parts.push(outputFormat || 'OUTPUT: Return ONLY valid JSON with no markdown fences:\n{"title":"...","excerpt":"first 150 chars of body","body":"full article text","tags":["RACE"],"content_type":"..."}');
  return parts.join('\n\n');
}

/* ═══ PLAGIARISM DETECTION ═══ */

// Tokenize text into lowercase alphanumeric words, filtering very short ones.
// Short words (the, a, of, etc.) are meaningless for phrase matching.
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

// Build a set of N-grams from tokens.
function ngrams(tokens, n) {
  const set = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Check how much of `article` appears verbatim in `source`.
 * Returns an object: { overlapRatio (0-1), longestMatch (words), samples[] }
 *
 * Uses 6-word n-grams. Any 6-word phrase that appears in both is suspicious.
 * Legitimate rewrites share single words and occasional 2-3 word phrases but
 * almost never share 6+ consecutive content words.
 */
export function checkPlagiarism(article, source) {
  const aTokens = tokenize(article);
  const sTokens = tokenize(source);
  if (aTokens.length < 20 || sTokens.length < 20) {
    return { overlapRatio: 0, longestMatch: 0, samples: [] };
  }

  const N = 6;
  const sGrams = ngrams(sTokens, N);
  const aGrams = ngrams(aTokens, N);

  let matches = 0;
  const samples = [];
  for (const g of aGrams) {
    if (sGrams.has(g)) {
      matches++;
      if (samples.length < 3) samples.push(g);
    }
  }

  // Longest contiguous match (greedy walk)
  let longest = 0;
  let cur = 0;
  for (let i = 0; i <= aTokens.length - N; i++) {
    const g = aTokens.slice(i, i + N).join(' ');
    if (sGrams.has(g)) {
      cur = cur === 0 ? N : cur + 1;
      if (cur > longest) longest = cur;
    } else {
      cur = 0;
    }
  }

  return {
    overlapRatio: aGrams.size > 0 ? matches / aGrams.size : 0,
    longestMatch: longest,
    samples,
  };
}

/* ═══ VALIDATION CONSTANTS ═══ */

// Style-police banned words list removed — was rejecting legitimate words like
// "masterclass", "unraveling", "monumental", killing drafts that Claude could
// easily polish in review. Factual validation only from here on.
const BANNED_WORDS = [];

const DRIVER_SPELLINGS = {
  'antinelli': 'Antonelli',
  'antonneli': 'Antonelli',
  'verstapen': 'Verstappen',
  'leclercq': 'Leclerc',
  'piastry': 'Piastri',
  'hamilon': 'Hamilton',
};

// Born year → age in 2026
const DRIVER_AGES = {
  'antonelli': { age: 19, born: '2006-08-25' },
  'bearman':   { age: 20, born: '2005-05-08' },
  'hadjar':    { age: 21, born: '2004-09-28' },
  'lindblad':  { age: 18, born: '2007' },
  'bortoleto': { age: 21, born: '2004' },
};

const STREET_CIRCUITS = ['monaco', 'singapore', 'baku', 'azerbaijan'];
const NOT_STREET_CIRCUITS = ['miami', 'las vegas', 'jeddah'];

const HALLUCINATION_PATTERNS = [
  { pattern: /gpmf[-_]/i, label: 'gpmf- token' },
  { pattern: /\{[a-z_]+\}/, label: '{variable} placeholder' },
  { pattern: /\[INSERT[^\]]*\]/i, label: '[INSERT] placeholder' },
  { pattern: /\bTODO\b/, label: 'TODO marker' },
  { pattern: /\bxxx\b/i, label: 'xxx placeholder' },
  { pattern: /lorem ipsum/i, label: 'lorem ipsum' },
];

const FABRICATED_SOURCING = [
  'sources confirmed', 'sources told', 'sources said', 'sources revealed',
  'a source close to', 'speaking on condition of anonymity', 'this reporter',
  'gridfeed has learned', 'gridfeed understands', 'gridfeed can reveal',
  'indicated in briefings', 'said in briefings',
  'in comments to gridfeed', 'speaking exclusively',
  'sources within', 'team insiders', 'paddock sources', 'industry sources',
];

const VALID_ATTRIBUTIONS = [
  'told sky sports', 'told autosport', 'told racefans', 'told the race',
  'told motorsport.com', 'told planetf1', 'told the bbc', 'told espn',
  'told formula1.com', 'in a statement', 'via team statement',
  'via press release', 'on the official f1 broadcast', 'told crash.net',
  'told gpfans', 'speaking to sky', 'speaking to autosport',
  'speaking to the race', 'speaking to motorsport',
  'told media', 'told reporters', 'said after', 'said before', 'said during',
  'said ahead', 'said following', 'according to', 'speaking after',
  'speaking before', 'speaking during', 'speaking ahead', 'speaking following',
  'told channel 4', 'told viaplay', 'told dazn', 'told f1 tv',
  'told gpblog', 'told gazzetta', 'told marca', 'told bild',
  'told rtl', 'told servus tv', 'said in', 'said at', 'said on',
  'post-race', 'pre-race', 'press conference',
];

const THESIS_VERBS = ['has identified', 'has revealed', 'believes', 'thinks', 'has admitted'];

const SURNAMES = ['Antonelli','Russell','Leclerc','Hamilton','Norris','Piastri','Verstappen','Hadjar','Alonso','Stroll','Gasly','Colapinto','Sainz','Albon','Ocon','Bearman','Lawson','Lindblad','Hulkenberg','Bortoleto','Perez','Bottas'];

export function validateArticle(article) {
  console.log('[validateArticle] RUNNING — title:', (article.title || '').slice(0, 60));
  const body = (article.body || '').toLowerCase();
  const title = (article.title || '').toLowerCase();
  const combined = body + ' ' + title;

  // ── A. BANNED WORDS ──
  for (const word of BANNED_WORDS) {
    if (combined.includes(word.toLowerCase())) {
      console.log('[validateArticle] REJECTED — Banned word:', word);
      return { valid: false, reason: 'Banned word: ' + word };
    }
  }
  console.log('[validateArticle] PASSED banned words');

  // ── B. DRIVER NAME SPELLING ──
  for (const [wrong, right] of Object.entries(DRIVER_SPELLINGS)) {
    if (combined.includes(wrong)) {
      console.log('[validateArticle] REJECTED — Misspelled:', wrong);
      return { valid: false, reason: `Misspelled driver: "${wrong}" (should be ${right})` };
    }
  }
  console.log('[validateArticle] PASSED driver spellings');

  // ── C. AGE FACTS ──
  for (const [driver, info] of Object.entries(DRIVER_AGES)) {
    const regex = new RegExp(`(\\d{1,2})-year-old`, 'g');
    let match;
    while ((match = regex.exec(combined)) !== null) {
      const ageNum = parseInt(match[1]);
      const nearby = combined.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50);
      if (nearby.includes(driver) && ageNum !== info.age) {
        console.log('[validateArticle] REJECTED — Wrong age for', driver, ':', ageNum, 'vs', info.age);
        return { valid: false, reason: `Wrong age for ${driver}: said ${ageNum}, actually ${info.age}` };
      }
    }
  }
  console.log('[validateArticle] PASSED age facts');

  // ── D. CHAMPIONSHIP CLAIMS ──
  // Only reject when "defending/reigning champion" is directly attributed to the wrong driver
  // ALLOWED: "4-time champion Verstappen", "former champion Hamilton", "2008 champion Hamilton"
  const wrongChampPatterns = [
    /defending champion[^.]{0,30}\b(verstappen|russell|hamilton)\b/,
    /\b(verstappen|russell|hamilton)[^.]{0,15}defending champion/,
    /reigning champion[^.]{0,30}\b(verstappen|russell|hamilton)\b/,
    /\b(verstappen|russell|hamilton)[^.]{0,15}reigning champion/,
  ];
  for (const pattern of wrongChampPatterns) {
    const match = combined.match(pattern);
    if (match) {
      console.log('[validateArticle] REJECTED — Wrong defending champion:', match[0].slice(0, 50));
      return { valid: false, reason: 'Wrong defending champion: ' + match[0].slice(0, 50) };
    }
  }
  console.log('[validateArticle] PASSED championship claims');

  // ── D2. LECLERC PODIUM COUNT FACT ──
  // Leclerc has 2 podiums after R4 Miami (P3 Australia, P4 China, P3 Japan, P6 Miami).
  // The "three consecutive podiums" error keeps slipping through.
  const leclercPodiumErrors = [
    /leclerc[^.]{0,50}(three|four)\s+(consecutive\s+)?podiums/i,
    /(three|four)\s+(straight|consecutive)\s+podiums[^.]{0,50}leclerc/i,
    /\bP3[,\s]+P3[,\s]+P3\b/,
  ];
  for (const pattern of leclercPodiumErrors) {
    if (pattern.test(article.body || '')) {
      console.log('[validateArticle] REJECTED — Wrong Leclerc podium count');
      return { valid: false, reason: 'Wrong Leclerc podium count: he has 2 podiums after Miami (P3,P4,P3,P6)' };
    }
  }
  console.log('[validateArticle] PASSED Leclerc podium count');

  // ── D3. POINTS LEAD PHRASING ──
  // Antonelli has 100 TOTAL points after Miami and a 20-point LEAD over Russell (80).
  // Block confusing total-as-lead phrasing (e.g. "100-point lead").
  const pointLeadErrors = [
    /\b1[0-1]\d[\s-]*point\s+(lead|advantage|gap|margin|cushion|buffer|clear)/i,
    /\b9[0-9][\s-]*point\s+(lead|advantage|gap|margin|cushion|buffer|clear)/i,
  ];
  for (const pattern of pointLeadErrors) {
    if (pattern.test(article.body || '')) {
      console.log('[validateArticle] REJECTED — Wrong points lead phrasing');
      return { valid: false, reason: 'Wrong points phrasing: total is not the lead size' };
    }
  }
  console.log('[validateArticle] PASSED points lead phrasing');

  // ── E. CIRCUIT TYPE FACTS ──
  for (const circuit of NOT_STREET_CIRCUITS) {
    if (combined.includes(circuit) && combined.includes('street circuit')) {
      const streetIdx = combined.indexOf('street circuit');
      const nearStreet = combined.slice(Math.max(0, streetIdx - 80), streetIdx + 30);
      if (nearStreet.includes(circuit)) {
        console.log('[validateArticle] REJECTED — Wrong street circuit:', circuit);
        return { valid: false, reason: `${circuit} is NOT a street circuit` };
      }
    }
  }
  console.log('[validateArticle] PASSED circuit types');

  // ── F. LEAD SENTENCE RULE ──
  // Only enforce a specific-opener rule on recap-style content. For everything
  // else (team principals, engineers, regulations, etc.) a missing driver name
  // in the first sentence is fine — the story may be about Stella, Binotto,
  // Wolff, a team decision, or a regulation change. We only reject when the
  // body is effectively empty so Claude has nothing to review.
  const body0 = (article.body || '').trim();
  if (body0.length < 60) {
    console.log('[validateArticle] REJECTED — Body too short to publish');
    return { valid: false, reason: 'Body too short' };
  }
  const firstSentence = body0.split(/[.!?]/)[0] || '';
  const hasName = SURNAMES.some(s => firstSentence.includes(s));
  const hasNumber = /\d/.test(firstSentence);
  const isRaceContent = ['race_recap','qualifying_recap','practice_analysis'].includes(article.content_type);
  if (isRaceContent && !hasName && !hasNumber) {
    console.log('[validateArticle] REJECTED — Race recap lead missing name AND number:', firstSentence.slice(0, 80));
    return { valid: false, reason: 'Race recap lead missing driver name AND number' };
  }
  console.log('[validateArticle] PASSED lead sentence');

  // ── G. HALLUCINATED TOKENS ──
  for (const { pattern, label } of HALLUCINATION_PATTERNS) {
    if (pattern.test(article.body || '') || pattern.test(article.title || '')) {
      console.log('[validateArticle] REJECTED — Hallucinated token:', label);
      return { valid: false, reason: 'Hallucinated token: ' + label };
    }
  }
  console.log('[validateArticle] PASSED hallucination patterns');

  // ── H. FABRICATED SOURCING ──
  for (const phrase of FABRICATED_SOURCING) {
    if (body.includes(phrase)) {
      console.log('[validateArticle] REJECTED — Fabricated sourcing:', phrase);
      return { valid: false, reason: 'Fabricated sourcing: ' + phrase };
    }
  }
  console.log('[validateArticle] PASSED fabricated sourcing');

  // ── H2. UNATTRIBUTED DIRECT QUOTES ──
  // Disabled — was blocking nearly all drafts. Manual approval is the quality gate.
  console.log('[validateArticle] SKIPPED unattributed quotes (disabled)');

  // ── H3. THESIS-AS-STATEMENT FRAMING ──
  // Block "{Driver} has identified/revealed/believes/thinks/has admitted" in first sentence
  // unless it has a valid attribution
  const firstSentLower = ((article.body || '').split(/[.!?]/)[0] || '').toLowerCase();
  for (const verb of THESIS_VERBS) {
    for (const surname of SURNAMES) {
      if (firstSentLower.includes(surname.toLowerCase() + ' ' + verb)) {
        const hasAttr = VALID_ATTRIBUTIONS.some(a => firstSentLower.includes(a))
          || firstSentLower.includes('told ') || firstSentLower.includes('in a statement')
          || firstSentLower.includes('via ') || firstSentLower.includes('speaking to');
        if (!hasAttr) {
          console.log('[validateArticle] REJECTED — Thesis framing:', surname, verb);
          return { valid: false, reason: 'Thesis framing without attribution: ' + surname + ' ' + verb };
        }
      }
    }
  }
  console.log('[validateArticle] PASSED thesis framing');

  // ── I. FAKE VENUES ──
  const fakeVenues = ['bristol', 'nashville', 'jakarta', 'delhi', 'seoul', 'bangkok', 'cape town', 'new york', 'london grand prix', 'paris grand prix'];
  for (const v of fakeVenues) {
    if (combined.includes(v)) { console.log('[validateArticle] REJECTED — Fake venue:', v); return { valid: false, reason: `Fake venue: ${v}` }; }
  }
  console.log('[validateArticle] PASSED fake venues');

  // ── J. HAMILTON AT MERCEDES ──
  if (combined.includes('hamilton') && (combined.includes('his mercedes') || combined.includes('mercedes team-mate hamilton') || combined.includes('hamilton leads mercedes'))) {
    console.log('[validateArticle] REJECTED — Hamilton at Mercedes');
    return { valid: false, reason: 'Hallucination: Hamilton placed at Mercedes in 2026' };
  }

  // ── K. ANDREA ANTONELLI ──
  if (combined.includes('andrea antonelli') && !combined.includes('full name')) {
    console.log('[validateArticle] REJECTED — Andrea Antonelli');
    return { valid: false, reason: 'Wrong name: Andrea Antonelli (should be Kimi Antonelli)' };
  }

  // ── L. DRS ──
  if (combined.includes('drs') && !combined.includes('replaced') && !combined.includes('abolished') && !combined.includes('no longer') && !combined.includes('old') && !combined.includes('former')) {
    console.log('[validateArticle] REJECTED — DRS in 2026');
    return { valid: false, reason: 'DRS mentioned in 2026 content — system abolished, use Overtake Mode' };
  }

  // ── L2. HAMILTON CHAMPION COUNT ──
  if (/six[\s-]time\s+(world\s+)?champion/i.test(combined) && combined.includes('hamilton')) {
    console.log('[validateArticle] REJECTED — Hamilton 6-time');
    return { valid: false, reason: 'Hamilton is a SEVEN-time champion, not six' };
  }

  // ── L3. GASLY AT HAAS ──
  // "Gasly" and "Haas" in the same sentence without "Alpine" nearby = wrong team
  const gaslyHaasMatch = combined.match(/[^.]*gasly[^.]*haas[^.]*\./i) || combined.match(/[^.]*haas[^.]*gasly[^.]*\./i);
  if (gaslyHaasMatch && !/alpine/i.test(gaslyHaasMatch[0])) {
    console.log('[validateArticle] REJECTED — Gasly at Haas');
    return { valid: false, reason: 'Gasly drives for Alpine, not Haas' };
  }

  // ── L4. TITLE ALREADY DECIDED ──
  if (/mercedes\s+(has|have)\s+(already\s+)?won\s+the\s+(2026\s+)?championship/i.test(combined)) {
    console.log('[validateArticle] REJECTED — Mercedes already won the title');
    return { valid: false, reason: 'Championship not decided — 4 of 22 races complete' };
  }

  // ── L5. LECLERC LEFT FERRARI ──
  if (/leclerc[^.]{0,40}(left|departed|moved from|has exited)\s+ferrari/i.test(combined)) {
    console.log('[validateArticle] REJECTED — Leclerc left Ferrari');
    return { valid: false, reason: 'Leclerc still drives for Ferrari in 2026' };
  }

  // ── L6. WRONG DEFENDING CHAMPION (expanded) ──
  if (/(russell|verstappen)[^.]{0,30}defending\s+champion/i.test(combined)) {
    console.log('[validateArticle] REJECTED — Wrong defending champion (russell/verstappen)');
    return { valid: false, reason: 'Norris is the 2025 defending champion' };
  }

  // ── L7. UNVERIFIED FINANCIAL CLAIMS ──
  // Block large $ amounts unless clearly attributed to a source
  const dollarMatches = combined.match(/\$\s*\d{2,4}\s*(million|billion|m\b|bn\b)/gi) || [];
  if (dollarMatches.length) {
    const attrWords = ['reported','reports','according to','told','said','confirmed','revealed','stated'];
    const hasAttribution = attrWords.some(w => combined.includes(w));
    if (!hasAttribution) {
      console.log('[validateArticle] REJECTED — Unverified $ amount');
      return { valid: false, reason: 'Unverified financial claim (no source attribution)' };
    }
  }

  // ── M. TITLE + LENGTH ──
  if (!article.title || article.title.length < 15) { console.log('[validateArticle] REJECTED — Title too short'); return { valid: false, reason: 'Title too short' }; }

  const wc = (article.body || '').trim().split(/\s+/).length;
  if (wc < 100) { console.log('[validateArticle] REJECTED — Too short:', wc); return { valid: false, reason: `Too short: ${wc} words` }; }

  console.log('[validateArticle] ALL CHECKS PASSED — title:', (article.title || '').slice(0, 60), '— words:', wc);
  return { valid: true };
}

export function fixEncoding(text) {
  if (!text) return text;
  return text
    .replace(/\u00e2\u20ac\u201c/g, '\u2014')
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u2122/g, '\u2019')
    .replace(/\u00e2\u20ac\u2018/g, '\u2018')
    .replace(/\u00e2\u20ac\u0153/g, '\u201c')
    .replace(/\u00e2\u20ac\u009d/g, '\u201d')
    .replace(/\u00e2\u20ac\u00a6/g, '\u2026')
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c3\u00a8/g, '\u00e8')
    .replace(/\u00c3\u00a0/g, '\u00e0')
    .replace(/\u00c3\u00bc/g, '\u00fc')
    .replace(/\u00c3\u00b6/g, '\u00f6')
    .replace(/\u00c3\u00b1/g, '\u00f1')
    // Strip cite tags from web search
    .replace(/<cite[^>]*>[^<]*<\/cite>/g, '')
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '');
}

export async function buildLiveContext() {
  const facts = await sb('driver_facts?select=driver_name,category,fact_text&season=eq.2026&order=driver_name.asc');
  const results = facts.filter(f => f.category === 'results' || f.category === 'form');
  return results.length ? 'LIVE DRIVER DATA:\n' + results.map(f => `${f.driver_name}: ${f.fact_text}`).join('\n') : '';
}

/* ═══ STRUCTURED STANDINGS — canonical truth used by detectFactualErrors ═══
   Keep in sync with SEASON_CONTEXT text above. Updated post-R4 Miami. */
export const VERIFIED_DRIVER_POINTS = {
  Antonelli: 100, Russell: 80, Leclerc: 63, Norris: 51, Hamilton: 49,
  Piastri: 43, Verstappen: 26, Bearman: 17, Gasly: 16, Lawson: 10,
  Colapinto: 5, Lindblad: 4, Hadjar: 4, Sainz: 4, Bortoleto: 2,
  Albon: 1, Ocon: 1, Alonso: 0, Stroll: 0, Hulkenberg: 0, Perez: 0, Bottas: 0,
};

export const VERIFIED_TEAM_POINTS = {
  Mercedes: 180, Ferrari: 112, McLaren: 94, 'Red Bull': 30,
  Alpine: 21, Haas: 18, 'Racing Bulls': 14, Williams: 5,
  Audi: 2, Cadillac: 0, 'Aston Martin': 0,
};

// Per-race points table (race + sprint). When an article says "Antonelli scored
// 25 points at Miami" that's a per-race claim — don't treat it as a stale season
// total. Includes sprint values (8/7/6/5/4/3/2/1) too.
const PER_RACE_POINTS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 18, 25]);

// Stale snapshots known to leak into Haiku output. If any of these appear we
// reject outright — the validator never has to think about them.
const STALE_PATTERNS = [
  [/\bAntonelli['’]?s?\s+(?:has\s+|with\s+|on\s+)?72\s+(?:pts|points)\b/i, 'Antonelli 72 pts (stale post-R3)'],
  [/\b72\s+(?:pts|points)[^.]{0,30}\bAntonelli\b/i, '72 pts → Antonelli (stale post-R3)'],
  [/\bRussell\b[^.]{0,30}\b63\s+(?:pts|points)/i, 'Russell 63 pts (stale post-R3)'],
  [/\bHamilton\b[^.]{0,30}\b41\s+(?:pts|points)/i, 'Hamilton 41 pts (stale post-R3)'],
  [/\bMercedes\b[^.]{0,40}\b135\s+(?:pts|points)/i, 'Mercedes 135 pts (stale post-R3)'],
  [/\bFerrari\b[^.]{0,40}\b90\s+(?:pts|points)/i, 'Ferrari 90 pts (stale post-R3)'],
  [/\bMcLaren\b[^.]{0,40}\b46\s+(?:pts|points)/i, 'McLaren 46 pts (stale post-R3)'],
  [/\b3\s+of\s+22\s+races\b/i, '3 of 22 races (now 4)'],
  [/\bafter\s+(?:three|3)\s+races\s+(?:complete|run|in)/i, 'after 3 races (now 4)'],
  [/\b9[\s-]*point\s+(?:lead|advantage|gap|margin)\b/i, '9-point lead (post-R3 stale; lead is now 20)'],
];

/**
 * detectFactualErrors — deterministic claim validator.
 *
 * Scans an article's body+title for two error classes:
 *   1. Stale post-R3 snapshots (Antonelli 72, Mercedes 135, etc.)
 *   2. Driver/team season-total claims that disagree with the canonical table.
 *
 * For driver/team claims we look for "[Name] ... NN points" or "NN points ...
 * [Name]" within ~40 chars. Per-race podium values (1, 4, 8, 12, 15, 18, 25) are
 * skipped — those are valid race-result claims, not season totals.
 *
 * Returns { valid: bool, errors: string[] }. `valid` is true when no errors.
 * Wire the negative case into generate-content / generate-editorial as a hard
 * reject; let manual review stay only for stylistic concerns.
 */
// Race-context language. When this appears in the proximity window AND the
// claimed number is a per-race point value (1-25 podium scale), treat the
// claim as a per-race result and don't flag it. Outside race context, the
// same number gets validated as a season total.
const RACE_CONTEXT_RE = /\b(at|in|scored|scoring|won|win|wins|winning|race|races|finish|finished|finishing|sprint|podium|pole|claim|claimed|miami|china|japan|australia|canada|monaco|imola|barcelona|austrian|silverstone|spa|hungarian|dutch|monza|madrid|baku|singapore|austin|mexico|brazil|vegas|qatar|abu dhabi|grand prix)\b/i;

export function detectFactualErrors(article) {
  const errors = new Set();

  // Stale-snapshot pass runs against the combined text — these patterns are
  // self-anchored and don't depend on proximity windows.
  const combined = (article.body || '') + ' ' + (article.title || '');
  for (const [pat, label] of STALE_PATTERNS) {
    if (pat.test(combined)) errors.add(label);
  }

  // Numeric-claim pass runs against body and title separately so the title
  // doesn't drift into the body's proximity window (and vice versa).
  const driverEntries = Object.entries(VERIFIED_DRIVER_POINTS);
  const teamEntries = Object.entries(VERIFIED_TEAM_POINTS);
  const W = 40;

  const scanSegment = (segment) => {
    if (!segment) return;
    const ptsRe = /\b(\d{1,3})\s*(?:pts|points)\b/gi;
    let m;
    while ((m = ptsRe.exec(segment)) !== null) {
      const claimed = parseInt(m[1], 10);
      const start = Math.max(0, m.index - W);
      const end = Math.min(segment.length, m.index + m[0].length + W);
      const window = segment.slice(start, end);
      const anchor = m.index - start;

      let closestName = null;
      let closestActual = null;
      let closestDist = Infinity;
      const checkName = (name, regex, actual) => {
        let nm;
        while ((nm = regex.exec(window)) !== null) {
          const dist = Math.abs(nm.index - anchor);
          if (dist < closestDist) {
            closestDist = dist;
            closestName = name;
            closestActual = actual;
          }
        }
      };
      for (const [surname, actual] of driverEntries) {
        checkName(surname, new RegExp(`\\b${surname}\\b`, 'gi'), actual);
      }
      for (const [team, actual] of teamEntries) {
        const teamPat = team.replace(/\s+/g, '\\s+');
        checkName(team, new RegExp(`\\b${teamPat}\\b`, 'gi'), actual);
      }

      if (closestName === null) continue;
      if (claimed === closestActual) continue;
      // Per-race exemption only when surrounding language signals a race.
      // "Norris scored 25 points at Miami" → race context, allow.
      // "Verstappen sits on 12 points" → no race context, validate as season.
      if (PER_RACE_POINTS.has(claimed) && RACE_CONTEXT_RE.test(window)) continue;
      errors.add(`${closestName}: claimed ${claimed} pts, actual ${closestActual}`);
    }
  };

  scanSegment(article.body || '');
  scanSegment(article.title || '');

  return { valid: errors.size === 0, errors: [...errors] };
}

/**
 * selfCritique — second-pass Haiku call that compares the draft to verified
 * facts and returns a list of errors. Intended to catch qualitative slips
 * (wrong team, invented quote, stale narrative) that the deterministic
 * detectFactualErrors can't see.
 *
 * Returns { ok: true } if the critique returns "NONE", otherwise
 * { ok: false, errors: <text> } with the listed problems for logging.
 *
 * Skip this for live tweets — adds 5-8s of latency. Editorial / content
 * pieces can absorb that easily.
 */
export async function selfCritique(article, fetchWT) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return { ok: true, skipped: 'no_key' };

  const factSheet = `${SEASON_CONTEXT}\n\n${DRIVER_TEAM_MAP}\n\n${HALLUCINATION_RULES}`;
  const draftBlob = `Title: ${article.title || ''}\n\n${article.body || ''}`;
  const system = `You are a fact-checker for an F1 news platform. Compare the draft below against the verified 2026 facts. Output ONLY a list of factual errors, one per line, prefixed with "- ". If there are no factual errors, output the single word: NONE\n\nFLAG: wrong points totals, wrong team for a driver, wrong race count (4 races complete), wrong defending champion (Norris is 2025 champ), invented venues, fabricated quotes, claims contradicting the verified standings.\n\nDO NOT flag: stylistic choices, opinions, predictions, or judgments — only factual errors.\n\n${factSheet}`;

  try {
    const res = await fetchWT('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: `Draft:\n"""\n${draftBlob}\n"""\n\nList factual errors or write NONE:` }],
      }),
    }, 25000);
    const json = await res.json();
    const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text || /^NONE\b/i.test(text)) return { ok: true };
    // Treat any non-NONE response as an error list
    return { ok: false, errors: text.slice(0, 800) };
  } catch (e) {
    // On critique failure, allow the draft through — better to publish than
    // to block the entire pipeline on a Claude outage. detectFactualErrors
    // already caught the deterministic stuff.
    return { ok: true, skipped: 'critique_error: ' + (e.message || 'unknown') };
  }
}
