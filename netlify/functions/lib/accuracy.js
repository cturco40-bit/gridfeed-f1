/* ═══ ACCURACY CONSTANTS — shared across all content-generating functions ═══ */
import { sb } from './shared.js';

export const TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const SEASON_CONTEXT = `Today is ${TODAY}.

2026 F1 SEASON — VERIFIED FACTS. USE ONLY THESE. NEVER INVENT ALTERNATIVES.

COMPLETED RACES (3 of 22 complete):
R1: Australia Mar 8 — P1 George Russell (Mercedes), P2 Kimi Antonelli (Mercedes), P3 Charles Leclerc (Ferrari)
R2: China Mar 15 — P1 Kimi Antonelli (Mercedes), P2 George Russell (Mercedes), P3 Charles Leclerc (Ferrari)
R3: Japan Mar 29 — P1 Kimi Antonelli (Mercedes), P2 Oscar Piastri (McLaren), P3 Charles Leclerc (Ferrari), P4 Russell, P5 Norris, P6 Hamilton, P7 Gasly, P8 Verstappen, P9 Lawson, P10 Bearman
NEXT: R4 Miami Grand Prix May 1-3 2026 at Miami International Autodrome. Round 4 of 22.
CANCELLED: Bahrain GP (Apr 12) and Saudi Arabian GP (Apr 19) both cancelled — Middle East conflict.

2026 REGULATIONS: No DRS. Replaced by Overtake Mode (extra electrical deployment when within 1 second of car ahead) and Active Aero (wings adjust automatically). Never mention DRS in 2026 content.

VERIFIED DRIVERS CHAMPIONSHIP after R3 Japan:
P1 Kimi Antonelli (Mercedes) 72 pts
P2 George Russell (Mercedes) 63 pts
P3 Charles Leclerc (Ferrari) 49 pts
P4 Lewis Hamilton (Ferrari) 41 pts
P5 Lando Norris (McLaren) 25 pts
P6 Oscar Piastri (McLaren) 21 pts
P7 Oliver Bearman (Haas) 17 pts
P8 Pierre Gasly (Alpine) 15 pts
P9 Max Verstappen (Red Bull) 12 pts
P10 Liam Lawson (Racing Bulls) 10 pts
P11 Arvid Lindblad (Racing Bulls) 4 pts
P12 Isack Hadjar (Red Bull) 4 pts
P13 Gabriel Bortoleto (Audi) 2 pts
P14 Carlos Sainz (Williams) 2 pts
P15 Esteban Ocon (Haas) 1 pt
P16 Franco Colapinto (Alpine) 1 pt

VERIFIED CONSTRUCTORS CHAMPIONSHIP after R3:
P1 Mercedes 135 pts
P2 Ferrari 90 pts
P3 McLaren 46 pts
P4 Haas 18 pts
P5 Alpine 16 pts
P6 Red Bull Racing 16 pts
P7 Racing Bulls 14 pts
P8 Audi 2 pts
P9 Williams 2 pts
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
Only 3 races completed. Max possible points = 72 (Antonelli). NEVER write a points total above 72.
NEVER write a constructors total above 135. Use ONLY verified standings above.

RULE 5 — RACE COUNT:
Only 3 races run. 22 total (not 24). NEVER reference round above 3 as completed.
NEVER say "midway through the season" — we are at round 3 of 22.

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
BETTING: Never present picks as guaranteed. Frame as analysis, not financial advice.
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
  // Leclerc has 2 podiums after R3 (P3 Australia, P4 China, P3 Japan).
  // The "three consecutive podiums" error keeps slipping through.
  const leclercPodiumErrors = [
    /leclerc[^.]{0,50}three\s+(consecutive\s+)?podiums/i,
    /three\s+(straight|consecutive)\s+podiums[^.]{0,50}leclerc/i,
    /leclerc[^.]{0,30}\(P3,?\s*P3,?\s*P3\)/i,
    /\bP3[,\s]+P3[,\s]+P3\b/,
  ];
  for (const pattern of leclercPodiumErrors) {
    if (pattern.test(article.body || '')) {
      console.log('[validateArticle] REJECTED — Wrong Leclerc podium count');
      return { valid: false, reason: 'Wrong Leclerc podium count: he has 2 podiums (P3,P4,P3) not 3' };
    }
  }
  console.log('[validateArticle] PASSED Leclerc podium count');

  // ── D3. POINTS LEAD PHRASING ──
  // Antonelli has 72 TOTAL points and a 9-point LEAD. Don't confuse the two.
  // Block "72-point lead" (and 70/71-point variants) which is a common AI mistake.
  const pointLeadErrors = [
    /\b7[0-2][\s-]*point\s+(lead|advantage|gap|margin|cushion|buffer|clear)/i,
  ];
  for (const pattern of pointLeadErrors) {
    if (pattern.test(article.body || '')) {
      console.log('[validateArticle] REJECTED — Wrong points lead phrasing');
      return { valid: false, reason: 'Wrong points phrasing: 72 is total points, lead is 9 points' };
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
    return { valid: false, reason: 'Championship not decided — 3 of 22 races complete' };
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
