// One-shot backfill: derive each published article's entity:angle subject
// key (from title only) and insert into published_subjects.
//
// Uses an INLINED copy of getSubjectKey so Netlify's function bundle cache
// can't serve a stale version of subject-registry.js.
//
// Run: GET /.netlify/functions/seed-subjects
// Idempotent — wipes published_subjects first then re-seeds.

import { sb, logSync, json } from './lib/shared.js';

const NEXT_RACE_DAYS = 7;

function getSubjectKeyLocal(title) {
  const h = (title || '').toLowerCase();
  if (!h) return null;

  // 1. Topic entities (check FIRST, before any driver/team)
  if (h.includes('aduo')) return 'aduo:engine';
  if (h.includes('bahrain')) return 'bahrain:calendar';
  if (h.includes('saudi')) return 'saudi:calendar';
  if (h.includes('goodwood')) return 'goodwood:general';
  if (h.includes('formula 2')) return 'f2:calendar';
  if (h.includes('formula 3')) return 'f3:calendar';
  if (h.includes('overtake mode')) return 'f1:regulation';
  if (h.includes('active aero')) return 'f1:regulation';

  // 2. Standings overview
  if (/power.*rank|champion.*(stand|check)|all.*drivers/i.test(h)) {
    return 'f1:standings';
  }

  // 3. Driver entity (drivers first, then teams)
  const drivers = ['antonelli','russell','hamilton','leclerc','norris',
    'piastri','verstappen','bearman','gasly','alonso','stroll','sainz',
    'albon','ocon','lawson','lindblad','hadjar','hulkenberg','bortoleto',
    'perez','bottas','colapinto'];
  const teams = ['mercedes','ferrari','mclaren','red bull','aston martin',
    'alpine','haas','williams','audi','cadillac','racing bulls'];

  const entity = drivers.find(d => h.includes(d))
    || teams.find(t => h.includes(t))
    || '';

  if (!entity) return null;

  // 4. Angle from synonyms
  const NOISE = new Set(['the','a','an','in','at','of','for','and','is',
    'has','with','from','after','how','why','what','not','his','her',
    'f1','formula','grand','prix','race','driver','team','season',
    'championship','points','2026']);

  const SYNONYMS = {
    leads:'leads',lead:'leads',leading:'leads',extends:'leads',
    dominates:'leads',dominant:'leads',dominance:'leads',standings:'leads',
    crash:'crash',crashes:'crash',incident:'crash',collision:'crash',
    contract:'contract',signs:'contract',deal:'contract',extension:'contract',
    departs:'departs',leaves:'departs',exit:'departs',departure:'departs',
    fired:'departs',sacked:'departs',
    start:'start',launch:'start',getaway:'start',clutch:'start',
    penalty:'penalty',penalised:'penalty',stewards:'penalty',
    upgrade:'upgrade',development:'upgrade',floor:'upgrade',
    engine:'engine',power:'engine',unit:'engine',reliability:'engine',
    hire:'hire',hires:'hire',recruit:'hire',appoint:'hire',
    pace:'pace',speed:'pace',fastest:'pace',performance:'pace',deficit:'pace',
    wins:'wins',win:'wins',victory:'wins',winner:'wins',
    pole:'pole',qualifying:'pole',qualified:'pole',
    preview:'preview',expect:'preview',watch:'preview',
    prediction:'preview',predict:'preview',
    rankings:'rankings',ranked:'rankings',rating:'rankings',
    rookie:'rookie',debut:'rookie',youngest:'rookie',teenager:'rookie',
  };

  const words = h.split(/[\s\-:,.']+/)
    .filter(w => w.length > 3 && !NOISE.has(w) && w !== entity);
  const sorted = words.sort((a, b) => b.length - a.length);
  const angle = SYNONYMS[sorted[0]] || sorted[0] || 'general';

  return entity + ':' + angle;
}

export default async (req) => {
  const start = Date.now();
  try {
    const articles = await sb('articles?status=eq.published&select=id,title,published_at&order=published_at.desc&limit=500');
    if (!articles || !articles.length) {
      return json({ ok: true, message: 'No published articles to seed', inserted: 0 });
    }

    // Wipe existing rows so the seed is deterministic
    await sb('published_subjects?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE').catch(() => {});

    const expiresAt = new Date(Date.now() + NEXT_RACE_DAYS * 86400e3).toISOString();
    const seen = new Set();
    const inserted = [];
    const skipped = [];

    for (const a of articles) {
      const key = getSubjectKeyLocal(a.title);
      if (!key) {
        skipped.push({ title: (a.title || '').slice(0, 60), reason: 'no-entity-match' });
        continue;
      }
      if (seen.has(key)) {
        skipped.push({ title: (a.title || '').slice(0, 60), reason: 'duplicate-key', key });
        continue;
      }
      seen.add(key);
      try {
        await sb('published_subjects', 'POST', {
          subject: key,
          article_id: a.id,
          expires_at: expiresAt,
        });
        inserted.push({ key, title: (a.title || '').slice(0, 60) });
      } catch (e) {
        skipped.push({ title: (a.title || '').slice(0, 60), reason: 'insert-failed:' + e.message });
      }
    }

    // Seed manual permanent blocks for stories that keep regenerating
    const manualBlocks = [
      { subject: 'wolff:fired', expires_at: new Date(Date.now() + 90 * 86400e3).toISOString() },
    ];
    for (const m of manualBlocks) {
      try {
        await sb('published_subjects', 'POST', { subject: m.subject, article_id: null, expires_at: m.expires_at });
        inserted.push({ key: m.subject, title: '[manual block]' });
      } catch {}
    }

    await logSync('seed-subjects', 'success', inserted.length, `Seeded ${inserted.length}/${articles.length}, ${skipped.length} skipped`, Date.now() - start);
    return json({
      ok: true,
      total_articles: articles.length,
      inserted: inserted.length,
      skipped: skipped.length,
      inserted_keys: inserted,
      skipped_articles: skipped,
    });
  } catch (err) {
    await logSync('seed-subjects', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
