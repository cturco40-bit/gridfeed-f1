-- ============================================================
-- 011_betting_picks_v2.sql
-- Real-odds AI picks: frozen odds at pick time, immutable once
-- approved, admin review queue via unlocked drafts.
-- Odds cache stays in the existing driver_odds table.
-- Idempotent — safe to re-run.
-- ============================================================

-- --- betting_picks additive columns -------------------------------
alter table betting_picks add column if not exists market_category text;
  -- 'winner' | 'podium' | 'top6' | 'h2h' | 'pole' | 'fastest_lap'
  -- | 'dnf' | 'safety_car' | 'margin' | 'sprint' | 'season_champ'
  -- | 'season_h2h' | 'season_wins'

alter table betting_picks add column if not exists odds_at_pick numeric;
  -- Decimal odds frozen at the moment the pick was approved.
  -- This is what the UI shows and what settlement uses — NEVER the live market.

alter table betting_picks add column if not exists odds_captured_at timestamptz;

alter table betting_picks add column if not exists bookmaker text;
  -- Which book the snapshot came from (pinnacle, draftkings, fanduel, etc.)

alter table betting_picks add column if not exists confidence numeric;
  -- AI's stated confidence 0..1. Used for EV calc (confidence * decimal_odds).

alter table betting_picks add column if not exists sources jsonb;
  -- Data points the AI cited to justify the pick.

alter table betting_picks add column if not exists settled_at timestamptz;
alter table betting_picks add column if not exists settlement_notes text;

-- New status convention: pending | won | lost | push | void
-- Old rows used 'active'; backfill them to 'pending' so the new UI filters
-- and the settlement cron see them consistently.
alter table betting_picks alter column status set default 'pending';
update betting_picks set status = 'pending' where status = 'active';

-- Unlocked drafts created by generate-picks need locked=false, locked_at=null.
-- Flip the column default so new inserts default to unlocked until approve-pick
-- flips them. Old rows are unaffected.
alter table betting_picks alter column locked set default false;

create index if not exists idx_picks_status_settled on betting_picks(status, settled_at desc);
create index if not exists idx_picks_market_cat on betting_picks(market_category);
create index if not exists idx_picks_unlocked on betting_picks(race_id) where locked_at is null;

-- --- immutability trigger -----------------------------------------
-- Once locked_at is set, the only columns that may change are:
--   status, settled_at, settlement_notes, result
-- Anything else throws. This protects frozen odds + analysis from
-- accidental edits in SQL or via the admin UI.
create or replace function guard_betting_pick_lock() returns trigger as $$
begin
  if OLD.locked_at is not null then
    if NEW.race_id        is distinct from OLD.race_id        or
       NEW.race_name      is distinct from OLD.race_name      or
       NEW.pick_type      is distinct from OLD.pick_type      or
       NEW.driver_name    is distinct from OLD.driver_name    or
       NEW.selection      is distinct from OLD.selection      or
       NEW.market         is distinct from OLD.market         or
       NEW.market_category is distinct from OLD.market_category or
       NEW.odds           is distinct from OLD.odds           or
       NEW.odds_decimal   is distinct from OLD.odds_decimal   or
       NEW.odds_at_pick   is distinct from OLD.odds_at_pick   or
       NEW.odds_captured_at is distinct from OLD.odds_captured_at or
       NEW.bookmaker      is distinct from OLD.bookmaker      or
       NEW.implied_prob   is distinct from OLD.implied_prob   or
       NEW.true_prob      is distinct from OLD.true_prob      or
       NEW.edge           is distinct from OLD.edge           or
       NEW.confidence     is distinct from OLD.confidence     or
       NEW.analysis       is distinct from OLD.analysis       or
       NEW.sources        is distinct from OLD.sources        or
       NEW.locked         is distinct from OLD.locked         or
       NEW.locked_at      is distinct from OLD.locked_at then
      raise exception 'betting_picks row % is locked; only status/settled_at/settlement_notes/result may change', OLD.id;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_guard_betting_pick_lock on betting_picks;
create trigger trg_guard_betting_pick_lock
  before update on betting_picks
  for each row execute function guard_betting_pick_lock();
