import { sb, json } from './lib/shared.js';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const sub = await req.json();
    await sb('push_subscriptions', 'POST', {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      device_label: 'Admin Phone',
    });
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
