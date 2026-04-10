import { createHmac } from 'crypto';
import { json } from './lib/shared.js';

const TTL = 864e5; // 24h

function makeToken(secret, ts) { return createHmac('sha256', secret).update(`gridfeed-admin:${ts}`).digest('hex'); }

export default async (req) => {
  const secret = process.env.ADMIN_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return json({ success: false, error: 'Auth not configured' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ success: false }, 400); }

  // Validate token
  if (body.token) {
    const [ts, sig] = (body.token || '').split(':');
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > TTL) return json({ success: false, reason: 'expired' });
    if (sig !== makeToken(secret, timestamp)) return json({ success: false });
    return json({ success: true });
  }

  // Login
  if (body.password) {
    if (body.password !== password) return json({ success: false });
    const ts = Date.now();
    return json({ success: true, token: `${ts}:${makeToken(secret, ts)}` });
  }

  return json({ success: false }, 400);
};
