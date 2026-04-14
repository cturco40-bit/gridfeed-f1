// One-shot backfill: read every published article, derive its
// entity:angle subject key, and insert into published_subjects so the
// registry dedup is seeded with our entire back catalog.
//
// Run: GET /.netlify/functions/seed-subjects
//      (idempotent — wipes published_subjects first then re-seeds)

import { sb, logSync, json } from './lib/shared.js';
import { getSubjectKey } from './lib/subject-registry.js';

const NEXT_RACE_DAYS = 7;

// Build marker: bumped to force Netlify to redeploy this function
const BUILD_MARKER = 'seed-subjects-v3-' + 'force-rebuild';
console.log('SEED v3 — title-only with topic entities + standings regex', BUILD_MARKER);

export default async (req) => {
  const start = Date.now();

  // Debug: prove the new getSubjectKey logic is wired up
  const testKeys = {
    'Power Rankings: All 11 Teams Ranked':
      getSubjectKey('Power Rankings: All 11 Teams Ranked'),
    'ADUO Explained: Engine Catch-Up':
      getSubjectKey('ADUO Explained: Engine Catch-Up'),
    'Bahrain and Saudi Arabia Cancelled':
      getSubjectKey('Bahrain and Saudi Arabia Cancelled'),
    'Championship Check: Where All 22 Drivers Stand':
      getSubjectKey('Championship Check: Where All 22 Drivers Stand'),
  };
  console.log('TEST KEYS:', JSON.stringify(testKeys));

  try {
    // 1. Pull every published article (cap 500 — plenty of headroom)
    const articles = await sb('articles?status=eq.published&select=id,title,published_at&order=published_at.desc&limit=500');
    if (!articles?.length) {
      return json({ ok: true, message: 'No published articles to seed', testKeys });
    }

    // 2. Wipe existing rows so the seed is deterministic
    await sb('published_subjects?id=neq.00000000-0000-0000-0000-000000000000', 'DELETE').catch(() => {});

    const expiresAt = new Date(Date.now() + NEXT_RACE_DAYS * 86400e3).toISOString();
    const seen = new Set();
    const inserted = [];
    const skipped = [];

    for (const a of articles) {
      const key = getSubjectKey(a.title);
      if (!key) {
        skipped.push({ id: a.id, title: (a.title || '').slice(0, 60), reason: 'no-entity-match' });
        continue;
      }
      // Skip exact duplicate keys — only need to register each subject once
      if (seen.has(key)) {
        skipped.push({ id: a.id, title: (a.title || '').slice(0, 60), reason: 'duplicate-key', key });
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
        skipped.push({ id: a.id, title: (a.title || '').slice(0, 60), reason: 'insert-failed:' + e.message });
      }
    }

    const msg = `Seeded ${inserted.length}/${articles.length} subjects, ${skipped.length} skipped`;
    await logSync('seed-subjects', 'success', inserted.length, msg, Date.now() - start);
    return json({
      ok: true,
      version: 'v3-force-rebuild',
      build_marker: BUILD_MARKER,
      testKeys,
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
