// Subject registry — semantic dedup that blocks topics by MEANING, not by
// individual words. Every published article is reduced to a canonical
// "entity:angle" key (e.g. antonelli:leads). New topics that resolve to the
// same key are blocked until the subject expires.
//
// Examples:
//   "Antonelli leads championship"           -> antonelli:leads
//   "Antonelli extends championship lead"    -> antonelli:leads  (BLOCKED)
//   "Antonelli dominates standings"          -> antonelli:leads  (BLOCKED)
//   "Antonelli crashes in Miami"             -> antonelli:crash  (NEW — allowed)
//   "Antonelli signs extension"              -> antonelli:contract (NEW — allowed)
//
// REQUIRES the published_subjects table in supabase. SQL:
//
//   CREATE TABLE IF NOT EXISTS published_subjects (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     subject text NOT NULL,
//     article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
//     race_round int,
//     expires_at timestamptz,
//     created_at timestamptz DEFAULT now()
//   );
//   CREATE INDEX idx_pub_subjects ON published_subjects(subject);
//   ALTER TABLE published_subjects ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Service read"  ON published_subjects FOR SELECT USING (true);
//   CREATE POLICY "Service write" ON published_subjects FOR INSERT WITH CHECK (true);
//   CREATE POLICY "Service delete" ON published_subjects FOR DELETE USING (true);

import { sb } from './shared.js';

// Default expiry windows
const NEXT_RACE_DAYS = 7;
const PERMANENT_HORIZON_DAYS = 365 * 5;

// Entities — surnames + team aliases. Order matters for deterministic
// resolution (first match wins inside each list).
const DRIVERS = [
  'antonelli','russell','leclerc','hamilton','norris','piastri','verstappen',
  'hadjar','alonso','stroll','gasly','colapinto','sainz','albon','ocon',
  'bearman','lawson','lindblad','hulkenberg','bortoleto','perez','bottas',
];
const TEAMS = [
  'mercedes','ferrari','mclaren','red bull','redbull','aston martin',
  'astonmartin','alpine','williams','haas','audi','cadillac','racing bulls',
];

// Synonym map — every key normalises to a canonical angle key. Multiple
// keys mapping to the same value collapse near-synonym headlines into one
// blocked subject.
const SYNONYMS = {
  // championship / standings
  leads: 'leads', lead: 'leads', leading: 'leads',
  extends: 'leads', extending: 'leads', extension: 'leads',
  ahead: 'leads', advantage: 'leads', cushion: 'leads', gap: 'leads',
  dominates: 'leads', dominant: 'leads', dominance: 'leads', dominating: 'leads',
  championship: 'leads', standings: 'leads', standing: 'leads',
  rankings: 'leads', ranked: 'leads',

  // crashes / incidents
  crash: 'crash', crashes: 'crash', crashed: 'crash',
  incident: 'crash', accident: 'crash',
  collision: 'crash', collide: 'crash', collided: 'crash', shunt: 'crash',
  smash: 'crash', smashed: 'crash', wreck: 'crash',

  // contracts / signings
  contract: 'contract', signs: 'contract', signed: 'contract', signing: 'contract',
  deal: 'contract', renew: 'contract', renewed: 'contract', renewal: 'contract',

  // departures
  departs: 'departs', departure: 'departs', leaves: 'departs', leaving: 'departs',
  exit: 'departs', exits: 'departs', quits: 'departs', quit: 'departs',
  fired: 'departs', sacked: 'departs', replaced: 'departs', dropped: 'departs',
  parted: 'departs', parts: 'departs', exodus: 'departs',

  // race starts / launches
  start: 'start', starts: 'start', launch: 'start', launches: 'start',
  getaway: 'start', formation: 'start', clutch: 'start',

  // penalties / stewards
  penalty: 'penalty', penalised: 'penalty', penalized: 'penalty',
  stewards: 'penalty', investigation: 'penalty', investigated: 'penalty',
  protest: 'penalty', protests: 'penalty', appeal: 'penalty', appealed: 'penalty',
  banned: 'penalty', disqualified: 'penalty',

  // car upgrades
  upgrade: 'upgrade', upgrades: 'upgrade',
  development: 'upgrade', developments: 'upgrade',
  floor: 'upgrade', wing: 'upgrade', package: 'upgrade', update: 'upgrade',
  redesign: 'upgrade',

  // engine / power unit / reliability
  engine: 'engine', engines: 'engine', power: 'engine',
  unit: 'engine', reliability: 'engine', mechanical: 'engine',

  // hires / appointments
  hire: 'hire', hires: 'hire', hired: 'hire', recruit: 'hire',
  recruits: 'hire', recruited: 'hire', appoint: 'hire', appointed: 'hire',
  appointment: 'hire',

  // pace / speed / performance
  pace: 'pace', speed: 'pace', fastest: 'pace', quick: 'pace',
  quickest: 'pace', performance: 'pace', deficit: 'pace',

  // strategy / tyres
  strategy: 'strategy', tyre: 'strategy', tyres: 'strategy', tire: 'strategy',
  stint: 'strategy', undercut: 'strategy', overcut: 'strategy',
  pitstop: 'strategy',

  // previews / predictions
  preview: 'preview', previews: 'preview', expect: 'preview', expects: 'preview',
  watch: 'preview', prediction: 'preview', predict: 'preview', predictions: 'preview',
  forecast: 'preview',

  // rookies / debuts
  rookie: 'rookie', debut: 'rookie', debuts: 'rookie',
  youngest: 'rookie', teenager: 'rookie', teenage: 'rookie',

  // wins / victories
  wins: 'wins', win: 'wins', victory: 'wins', victorious: 'wins',
  triumphs: 'wins', triumph: 'wins',

  // poles / qualifying
  pole: 'pole', poles: 'pole', polesitter: 'pole',
  qualifying: 'pole', qualified: 'pole', qualifies: 'pole',
};

// Subject-level expiry override. If a particular entity:angle should stay
// blocked permanently (e.g. ongoing structural stories), list it here. Default
// for everything else is 'next_race'.
const PERMANENT_SUBJECTS = new Set([
  'redbull:departs',
  'aston martin:departs',
  'mercedes:leads',
]);

function expiresAtFor(subject) {
  if (PERMANENT_SUBJECTS.has(subject)) {
    return new Date(Date.now() + PERMANENT_HORIZON_DAYS * 86400e3).toISOString();
  }
  return new Date(Date.now() + NEXT_RACE_DAYS * 86400e3).toISOString();
}

// Reduce a headline / title / body to a canonical "entity:angle" subject
// key. Returns null if no entity is found in the text.
export function getSubjectKey(text) {
  const t = (text || '').toLowerCase();
  if (!t) return null;

  // Find first entity match — drivers first, then teams (a driver-specific
  // angle is more meaningful than a team-wide one)
  let entity = null;
  for (const d of DRIVERS) { if (t.includes(d)) { entity = d; break; } }
  if (!entity) for (const team of TEAMS) { if (t.includes(team)) { entity = team; break; } }
  if (!entity) return null;

  // Tokenise and find the most "meaningful" synonym word — sort tokens by
  // length descending so longer words win ('championship' over 'in')
  const tokens = t.split(/[^a-z0-9]+/).filter(w => w.length > 2);
  tokens.sort((a, b) => b.length - a.length);
  let angle = 'general';
  for (const w of tokens) { if (SYNONYMS[w]) { angle = SYNONYMS[w]; break; } }

  return `${entity}:${angle}`;
}

// Check if a given text resolves to an already-published subject. Returns
// the subject key if blocked, null if free.
export async function checkSubjectPublished(text) {
  const key = getSubjectKey(text);
  if (!key) return null;
  const now = new Date().toISOString();
  const rows = await sb(
    `published_subjects?subject=eq.${encodeURIComponent(key)}&or=(expires_at.is.null,expires_at.gt.${now})&select=id,subject,expires_at&limit=1`
  );
  return (rows || []).length ? key : null;
}

// Record a subject as published. Safe to call multiple times — duplicates
// are harmless because the dedup query uses subject + expiry, not unique.
export async function recordSubjectPublished(title, body, articleId) {
  const key = getSubjectKey(title) || getSubjectKey(body || '');
  if (!key) return null;
  try {
    await sb('published_subjects', 'POST', {
      subject: key,
      article_id: articleId || null,
      expires_at: expiresAtFor(key),
    });
    return key;
  } catch {
    return null;
  }
}

// Manually clear a subject (e.g. after the next race so blocked subjects
// re-open for fresh angles)
export async function clearSubject(subject) {
  try {
    await sb(`published_subjects?subject=eq.${encodeURIComponent(subject)}`, 'DELETE');
    return true;
  } catch { return false; }
}

// Wipe everything older than the cutoff (scheduled cleanup)
export async function cleanupExpiredSubjects() {
  const now = new Date().toISOString();
  try {
    await sb(`published_subjects?expires_at=lt.${now}`, 'DELETE');
    return true;
  } catch { return false; }
}
