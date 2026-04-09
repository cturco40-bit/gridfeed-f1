import { createHmac } from 'crypto';
import { jsonResponse } from './lib/supabase.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function makeToken(secret, timestamp) {
  return createHmac('sha256', secret).update(`gridfeed-admin:${timestamp}`).digest('hex');
}

export default async (req) => {
  const secret = process.env.ADMIN_SECRET;
  const password = process.env.ADMIN_PASSWORD;

  if (!secret || !password) {
    return jsonResponse({ success: false, error: 'Auth not configured' }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false }, 400);
  }

  // Validate an existing token
  if (body.token) {
    const parts = body.token.split(':');
    if (parts.length !== 2) return jsonResponse({ success: false });

    const [ts, sig] = parts;
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp)) return jsonResponse({ success: false });

    // Check expiry
    if (Date.now() - timestamp > TOKEN_TTL_MS) {
      return jsonResponse({ success: false, reason: 'expired' });
    }

    // Check signature
    const expected = makeToken(secret, timestamp);
    if (sig !== expected) return jsonResponse({ success: false });

    return jsonResponse({ success: true });
  }

  // Login with password
  if (body.password) {
    if (body.password !== password) {
      return jsonResponse({ success: false });
    }

    const timestamp = Date.now();
    const sig = makeToken(secret, timestamp);
    return jsonResponse({ success: true, token: `${timestamp}:${sig}` });
  }

  return jsonResponse({ success: false }, 400);
};

export const config = {
  path: '/.netlify/functions/auth-admin',
};
