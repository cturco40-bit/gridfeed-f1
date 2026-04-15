import { sb, logSync, json } from './lib/shared.js';

// Locks a draft pick after optionally applying admin edits. Once locked,
// the DB trigger (guard_betting_pick_lock) forbids any further edits except
// to status/settled_at/settlement_notes/result, so this is the single
// chokepoint for mutating a pick before it becomes permanent.

export default async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const { id, driver_name, pick_type, market, odds_decimal, bookmaker, analysis, edge, confidence } = body;
    if (!id) return json({ error: 'Missing pick id' }, 400);

    // Make sure it's still unlocked before we try to mutate it. If a second
    // tab already locked it, we return the current state without throwing.
    const existing = await sb(`betting_picks?id=eq.${id}&select=id,locked_at`);
    if (!existing?.length) return json({ error: 'Pick not found' }, 404);
    if (existing[0].locked_at) {
      await logSync('approve-pick', 'success', 0, `Pick ${id} already locked`, Date.now() - start);
      return json({ ok: true, alreadyLocked: true });
    }

    // Build the single PATCH payload that applies edits + locks in one shot.
    // Because OLD.locked_at is still null at this point, the guard trigger
    // allows all these column changes. The next UPDATE after this will be
    // blocked for anything other than status/settled_at/settlement_notes.
    const nowIso = new Date().toISOString();
    const updates = {
      locked: true,
      locked_at: nowIso,
      status: 'pending',                 // ready for settlement
    };
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
        updates.odds_decimal     = dec;
        updates.odds_at_pick     = dec;                      // final frozen price
        updates.odds_captured_at = nowIso;
      }
    }

    await sb(`betting_picks?id=eq.${id}&locked_at=is.null`, 'PATCH', updates);
    await logSync('approve-pick', 'success', 1, `Locked pick ${id}`, Date.now() - start);
    return json({ ok: true, id, locked_at: nowIso });
  } catch (err) {
    await logSync('approve-pick', 'error', 0, err.message, Date.now() - start);
    return json({ error: err.message }, 500);
  }
};
