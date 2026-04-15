import { sb, json } from './lib/shared.js';

// Admin-only: returns recent picks including UNLOCKED drafts. Uses the
// service role (via shared sb helper) to bypass the public RLS policy
// that hides unlocked rows from the anon key. The admin page itself is
// password-gated in gf-admin-drafts.html.

export default async (req) => {
  try {
    const rows = await sb('betting_picks?order=created_at.desc&limit=100');
    return json({ picks: rows || [] });
  } catch (e) {
    return json({ error: e.message, picks: [] }, 500);
  }
};
