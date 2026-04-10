import { createTransport } from 'nodemailer';
import { fetchWT, logSync, json } from './lib/shared.js';

export default async (req, context) => {
  const start = Date.now();
  try {
    let body;
    try { body = await req.json(); } catch { return json({ ok: true, skipped: 'No body' }); }

    const score = body.priority_score || 0;
    const emoji = score >= 12 ? '\ud83d\udea8' : score >= 7 ? '\u26a1' : '\ud83d\udcdd';
    const subject = `[GridFeed Draft] ${emoji} ${body.title || 'New Draft'}`;

    const text = `Title: ${body.title || '\u2014'}
Type: ${body.content_type || '\u2014'} \u00b7 Tags: ${(body.tags || []).join(', ')}
Score: ${score}/20
Excerpt: ${(body.excerpt || '').slice(0, 200)}

Review: https://gridfeed.co/gf-admin-drafts`;

    let emailSent = false;
    let pushSent = false;

    // 1. Send push notification (always attempt — no SMTP dependency)
    try {
      const siteUrl = process.env.URL || 'https://gridfeed.co';
      await fetchWT(siteUrl + '/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${emoji} GridFeed: ${body.content_type || 'Draft'}`,
          body: body.title || 'New draft ready for review',
          url: '/gf-admin-drafts',
          priority: score,
        }),
      }, 8000);
      pushSent = true;
    } catch (e) {
      console.warn('[notify-draft] Push failed:', e.message);
    }

    // 2. Send email (if configured)
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const notifyEmail = process.env.NOTIFICATION_EMAIL;

    if (smtpUser && smtpPass && notifyEmail) {
      try {
        const transporter = createTransport({
          host: 'smtp-mail.outlook.com', port: 587, secure: false,
          tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
          auth: { user: smtpUser, pass: smtpPass },
          connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
        });

        await Promise.race([
          transporter.sendMail({ from: `GridFeed <${smtpUser}>`, to: notifyEmail, subject, text }),
          new Promise((_, r) => setTimeout(() => r(new Error('SMTP timeout')), 10000)),
        ]);
        emailSent = true;
      } catch (e) {
        console.warn('[notify-draft] Email failed:', e.message);
      }
    }

    await logSync('notify-draft', 'success', (emailSent ? 1 : 0) + (pushSent ? 1 : 0),
      `Push:${pushSent ? 'sent' : 'skip'} Email:${emailSent ? 'sent' : 'skip'} — ${subject}`, Date.now() - start);
    return json({ ok: true, push: pushSent, email: emailSent });
  } catch (err) {
    await logSync('notify-draft', 'error', 0, err.message, Date.now() - start);
    return json({ ok: true, error: err.message });
  }
};
