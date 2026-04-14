// Shared quality gate — used by generate-content.js + generate-editorial.js.
// Catches obvious output bugs (empty body, runaway generation, leaked pipeline
// metadata, broken paragraphs, orphan fragments) before a draft is saved.

export function qualityCheck(title, body) {
  const errors = [];
  const b = body || '';
  const t = title || '';

  if (!b || b.length < 800) errors.push('Body too short: ' + b.length);
  if (b.length > 5000) errors.push('Body too long: ' + b.length);

  // Leaked pipeline metadata — these strings should never appear in prose
  if (/triggered_by|blog-scheduler|web_search\s*[:=]\s*true|generation_model|content_context/i.test(b)) {
    errors.push('Leaked pipeline metadata');
  }

  // Orphan periods at start of lines (". something")
  if ((b.match(/^\.\s/gm) || []).length > 1) {
    errors.push('Broken paragraphs (orphan periods)');
  }

  // Orphan short conjunction-starting lines
  const orphans = b.split('\n').filter(l => {
    const s = l.trim();
    return s && /^(and|but|or|yet|however|though)\s/i.test(s) && s.length < 40;
  });
  if (orphans.length > 3) errors.push('Too many orphan fragments');

  // Empty markers between periods (". . .")
  if ((b.match(/\.\s*\.\s*\./g) || []).length > 1) errors.push('Empty content markers');

  if (!t || t.length < 20) errors.push('Title too short');
  if (t.length > 120) errors.push('Title too long');

  return { valid: errors.length === 0, errors };
}
