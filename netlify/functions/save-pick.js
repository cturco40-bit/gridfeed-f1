import { sb, logSync, json } from './lib/shared.js';

// Saves admin edits to an UNLOCKED draft pick without locking it. The DB
// trigger refuses to touch any immutable column once locked_at is set, so
// this endpoint is the only safe channel for mutating drafts.

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const { id, driver_name, pick_type, market, odds_decimal, bookmaker, analysis, edge, confidence } = body;
    if (!id) return json({ error: 'Missing pick id' }, 400);

    const existing = await sb(`betting_picks?id=eq.${id}&select=id,locked_at`);
    if (!existing?.length) return json({ error: 'Pick not found' }, 404);
    if (existing[0].locked_at) return json({ error: 'Cannot edit a locked pick' }, 409);

    const updates = {};
    if (driver_name !== undefined) { updates.driver_name = driver_name; updates.selection = driver_name; }
    if (pick_type !== undefined)   updates.pick_type   = pick_type;
    if (market !== undefined)      updates.market      = market;
    if (bookmaker !== undefined)   updates.bookmaker   = bookmaker;
    if (analysis !== undefined)    updates.analysis    = analysis;
    if (edge !== undefined)        updates.edge        = Number(edge);
    if (confidence !== undefined)  updates.confidence  = Number(confidence);
    if (odds_decimal !== undefined) {
      const dec = Number(odds_decimal);
      if (Number.isFinite(dec) && dec > 1) {
        updates.odds_decimal = dec;
        updates.odds_at_pick = dec;
        updates.odds_captured_at = new Date().toISOString();
      }
    }

    if (!Object.keys(updates).length) return json({ ok: true, noop: true });

    await sb(`betting_picks?id=eq.${id}&locked_at=is.null`, 'PATCH', updates);
    await logSync('save-pick', 'success', 1, `Edited draft pick ${id}`, Date.now() - start);
    return json({ ok: true });
  } catch (err) {
    await logSync('save-pick', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
