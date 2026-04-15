import { fetchWT, logSync, json } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    let body;
    try { body = await req.json(); } catch { return json({ ok: true, skipped: 'No body' }); }

    const score = body.priority_score || 0;
    const label = score >= 12 ? 'BREAKING' : score >= 7 ? 'URGENT' : 'NEW';

    // Send push notification only
    const siteUrl = process.env.URL || 'https://gridfeed.co';
    await fetchWT(siteUrl + '/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `[${label}] ${body.content_type || 'Draft'}`,
        body: body.title || 'New draft ready for review',
        url: '/gf-admin-drafts.html',
        tag: 'draft-' + Date.now(),
        audience: 'admin',
      }),
    }, 8000);

    await logSync('notify-draft', 'success', 1, `Push sent: ${body.title || 'draft'}`, Date.now() - start);
    return json({ ok: true, push: true });
  } catch (err) {
    await logSync('notify-draft', 'error', 0, err.message, Date.now() - start);
    return json({ ok: true, error: err.message });
  }
};
