import { sb, logSync, json } from './lib/shared.js';

// Deletes an unlocked draft pick. Locked picks are permanent and cannot be
// rejected; if an approved pick turns out to be bad, settlement handles it
// (push / void).

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return json({ error: 'Missing pick id' }, 400);

    // Confirm it's still unlocked before deleting — hard refuse on locked picks.
    const existing = await sb(`betting_picks?id=eq.${id}&select=id,locked_at`);
    if (!existing?.length) return json({ error: 'Pick not found' }, 404);
    if (existing[0].locked_at) return json({ error: 'Cannot reject a locked pick' }, 409);

    await sb(`betting_picks?id=eq.${id}&locked_at=is.null`, 'DELETE');
    await logSync('reject-pick', 'success', 1, `Rejected draft pick ${id}`, Date.now() - start);
    return json({ ok: true });
  } catch (err) {
    await logSync('reject-pick', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
