import webpush from 'web-push';
import { sb, json, logSync } from './lib/shared.js';

export default async (req) => {
  const start = Date.now();
  try {
    const vEmail = process.env.VAPID_EMAIL;
    const vPub = process.env.VAPID_PUBLIC_KEY;
    const vPriv = process.env.VAPID_PRIVATE_KEY;
    if (!vEmail || !vPub || !vPriv) {
      await logSync('send-push', 'success', 0, 'VAPID not configured', Date.now() - start);
      return json({ skipped: 'VAPID not configured' });
    }

    webpush.setVapidDetails(vEmail, vPub, vPriv);

    let body;
    try { body = await req.json(); } catch { body = {}; }

    const audience = body.audience || 'public';
    const subs = await sb(`push_subscriptions?select=*&audience=eq.${audience}`);
    if (!subs.length) {
      await logSync('send-push', 'success', 0, 'No subscribers', Date.now() - start);
      return json({ skipped: 'No subscribers' });
    }

    const payload = JSON.stringify({
      title: body.title || 'GridFeed',
      body: body.body || '',
      url: body.url || 'https://gridfeed.co',
      tag: body.tag || 'gridfeed-' + Date.now(),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    });

    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload))
    );

    // Remove expired (410 Gone). Scope the delete to this audience so we don't
    // wipe a sibling row when the same endpoint is subscribed to both
    // public and admin.
    const expired = results.map((r, i) => r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i] : null).filter(Boolean);
    for (const s of expired) await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}&audience=eq.${s.audience || audience}`, 'DELETE');

    const sent = results.filter(r => r.status === 'fulfilled').length;
    await logSync('send-push', 'success', sent, `Sent ${sent}/${subs.length} push notifications`, Date.now() - start);
    return json({ sent, total: subs.length });
  } catch (e) {
    await logSync('send-push', 'error', 0, e.message, Date.now() - start);
    return json({ error: e.message }, 500);
  }
};
