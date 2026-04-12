import { sb, json } from './lib/shared.js';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const sub = await req.json();
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return json({ error: 'Invalid subscription' }, 400);
    }

    const audience = sub.audience || 'public';

    // UPSERT: delete existing for same endpoint+audience, then insert
    await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}&audience=eq.${audience}`, 'DELETE').catch(() => {});
    await sb('push_subscriptions', 'POST', {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      device_label: sub.label || 'Device',
      audience,
    });
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
