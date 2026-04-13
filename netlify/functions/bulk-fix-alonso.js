import { sb, logSync, json } from './lib/shared.js';

// One-shot: fix Alonso/Aston Martin point references in 3 published articles.
// Delete after running.

const FIXES = [
  {
    id: 'a1a1b6dc-2724-4cd8-81fd-67a8b2c1f64f',
    replacements: [
      ['Alonso has 4 points from three races.', 'Alonso has zero points from three races.'],
      ['Aston Martin sits on 4 constructor points', 'Aston Martin sits on zero constructor points'],
      ['131 behind Mercedes, 86 behind Ferrari', '135 behind Mercedes, 90 behind Ferrari'],
    ],
  },
  {
    id: '92185685-8fbc-444a-909d-860129d326b2',
    replacements: [
      ['Alonso has 4 points from three races.', 'Alonso has zero points from three races.'],
      ['Antonelli leads the championship at 19 with 72 points. Alonso sits near the back with 4.', 'Antonelli leads the championship at 19 with 72 points. Alonso sits near the back with zero.'],
    ],
  },
  {
    id: '8949b940-a40c-4cd4-8e0a-e9ecf1ee682d',
    replacements: [
      ['Fernando Alonso, his teammate, has 4 points from three races', 'Fernando Alonso, his teammate, has zero points from three races'],
    ],
  },
];

export default async (req) => {
  const start = Date.now();
  const results = [];
  try {
    for (const fix of FIXES) {
      // Fetch the article
      const rows = await sb(`articles?id=eq.${fix.id}&select=id,title,body`);
      if (!rows.length) {
        results.push({ id: fix.id, ok: false, reason: 'not found' });
        continue;
      }
      const a = rows[0];
      let body = a.body || '';
      const applied = [];
      for (const [from, to] of fix.replacements) {
        if (body.includes(from)) {
          body = body.replaceAll(from, to);
          applied.push(from.slice(0, 50));
        } else {
          applied.push('NOT FOUND: ' + from.slice(0, 50));
        }
      }
      const ok = await sb(`articles?id=eq.${fix.id}`, 'PATCH', { body });
      results.push({ id: fix.id, title: a.title.slice(0, 50), ok, applied });
    }
    await logSync('bulk-fix-alonso', 'success', results.length, `Fixed ${results.length} articles`, Date.now() - start);
    return json({ ok: true, results });
  } catch (err) {
    await logSync('bulk-fix-alonso', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message, results }, 500);
  }
};
