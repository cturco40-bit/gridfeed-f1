import { sb, json } from './lib/shared.js';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    const body = await req.json();
    if (!body.endpoint) return json({ error: 'Missing endpoint' }, 400);

    const audience = body.audience || 'public';
    await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}&audience=eq.${audience}`, 'DELETE');
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
