import { fetchWT, logSync, json } from './lib/shared.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const start = Date.now();
  try {
    const { email } = await req.json();
    if (!email || !email.includes('@')) return json({ error: 'Invalid email' }, 400);

    const apiKey = process.env.BEEHIIV_API_KEY;
    const pubId = process.env.BEEHIIV_PUB_ID;
    if (!apiKey || !pubId) {
      await logSync('subscribe-newsletter', 'error', 0, 'BEEHIIV env vars not set', Date.now() - start);
      return json({ error: 'Newsletter service not configured' }, 500);
    }

    const res = await fetchWT(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: 'gridfeed',
        utm_medium: 'website',
      }),
    }, 10000);

    if (!res.ok) {
      const errText = await res.text();
      await logSync('subscribe-newsletter', 'error', 0, `Beehiiv ${res.status}: ${errText.slice(0, 200)}`, Date.now() - start);
      return json({ error: 'Subscription failed' }, 502);
    }

    await logSync('subscribe-newsletter', 'success', 1, email, Date.now() - start);
    return json({ ok: true });
  } catch (err) {
    await logSync('subscribe-newsletter', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
