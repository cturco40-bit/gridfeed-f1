import { createTransport } from 'nodemailer';
import { logSync, json } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const notifyEmail = process.env.NOTIFICATION_EMAIL;
    if (!smtpUser || !smtpPass || !notifyEmail) {
      await logSync('notify-draft', 'success', 0, 'Email not configured', Date.now() - start);
      return json({ ok: true, skipped: 'Email not configured' });
    }

    let body;
    try { body = await req.json(); } catch { return json({ ok: true, skipped: 'No body' }); }

    const score = body.priority_score || 0;
    const emoji = score >= 12 ? '🚨' : score >= 7 ? '⚡' : '📝';
    const subject = `[GridFeed Draft] ${emoji} ${body.title || 'New Draft'}`;

    const text = `Title: ${body.title || '—'}
Type: ${body.content_type || '—'} · Tags: ${(body.tags || []).join(', ')}
Score: ${score}/20
Excerpt: ${(body.excerpt || '').slice(0, 200)}

Review: https://gridfeed.co/gf-admin-drafts`;

    const transporter = createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: smtpUser, pass: smtpPass } });

    await Promise.race([
      transporter.sendMail({ from: `GridFeed <${smtpUser}>`, to: notifyEmail, subject, text }),
      new Promise((_, r) => setTimeout(() => r(new Error('SMTP timeout')), 5000)),
    ]);

    await logSync('notify-draft', 'success', 1, `Notified: ${subject}`, Date.now() - start);
    return json({ ok: true, sent: true });
  } catch (err) {
    await logSync('notify-draft', 'error', 0, err.message, Date.now() - start);
    return json({ ok: true, error: err.message }); // non-critical
  }
};
