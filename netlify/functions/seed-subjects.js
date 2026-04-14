// One-shot backfill: derive each published article's entity:angle subject
// key (from title only) and insert into published_subjects so the registry
// is seeded with the entire back catalog.
//
// Run: GET /.netlify/functions/seed-subjects
// Idempotent — wipes published_subjects first then re-seeds.

import { sb, logSync, json } from './lib/shared.js';
import { getSubjectKey } from './lib/subject-registry.js';

const NEXT_RACE_DAYS = 7;

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
      const key = getSubjectKey(a.title);
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
