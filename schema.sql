-- ============================================================
-- GRIDFEED — SUPABASE SCHEMA MIGRATION
-- Run in Supabase SQL Editor (gridfeed project)
-- ============================================================

-- ==================== EXTENSIONS ====================
create extension if not exists "uuid-ossp";

-- ==================== RACES (tournaments equivalent) ====================
create table if not exists races (
  id              uuid primary key default uuid_generate_v4(),
  espn_id         text unique,
  name            text not null,
  circuit         text,
  country         text,
  race_date       timestamptz,
  season          int default 2026,
  round           int,
  status          text default 'upcoming', -- upcoming | in_progress | completed
  winner_name     text,
  winner_team     text,
  fastest_lap     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ==================== DRIVERS ====================
create table if not exists drivers (
  id              uuid primary key default uuid_generate_v4(),
  espn_id         text unique,
  full_name       text not null,
  abbreviation    text,
  number          int,
  nationality     text,
  team_id         uuid,
  season          int default 2026,
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ==================== CONSTRUCTORS ====================
create table if not exists constructors (
  id              uuid primary key default uuid_generate_v4(),
  espn_id         text unique,
  name            text not null,
  abbreviation    text,
  nationality     text,
  color_hex       text,
  season          int default 2026,
  created_at      timestamptz default now()
);

-- ==================== DRIVER FACTS ====================
create table if not exists driver_facts (
  id              uuid primary key default uuid_generate_v4(),
  driver_id       uuid references drivers(id) on delete cascade,
  driver_name     text not null,
  category        text, -- background | form | circuit_history | strategy
  fact_text       text not null,
  race_id         uuid references races(id) on delete set null,
  season          int default 2026,
  created_at      timestamptz default now()
);

-- ==================== LEADERBOARD (live timing) ====================
create table if not exists leaderboard (
  id              uuid primary key default uuid_generate_v4(),
  race_id         uuid references races(id) on delete cascade,
  session_type    text not null, -- fp1 | fp2 | fp3 | qualifying | race | sprint
  position        int,
  driver_id       uuid references drivers(id) on delete set null,
  driver_name     text,
  team_name       text,
  team_color      text,
  time_str        text,
  gap_str         text,
  lap             int,
  status          text, -- racing | finished | dnf | dsq
  raw_data        jsonb,
  fetched_at      timestamptz default now(),
  created_at      timestamptz default now()
);
create index if not exists idx_leaderboard_race_session on leaderboard(race_id, session_type);

-- ==================== DRIVER ODDS ====================
create table if not exists driver_odds (
  id              uuid primary key default uuid_generate_v4(),
  race_id         uuid references races(id) on delete cascade,
  driver_name     text not null,
  market          text not null, -- race_winner | podium | points | h2h | constructor_winner
  odds_american   text,
  odds_decimal    numeric,
  implied_prob    numeric,
  bookmaker       text,
  fetched_at      timestamptz default now(),
  created_at      timestamptz default now()
);
create index if not exists idx_driver_odds_race on driver_odds(race_id, market);

-- ==================== BETTING PICKS ====================
create table if not exists betting_picks (
  id              uuid primary key default uuid_generate_v4(),
  race_id         uuid references races(id) on delete cascade,
  race_name       text,
  pick_type       text not null, -- BEST BET | VALUE | LONGSHOT | FADE
  driver_name     text,
  selection       text,         -- fallback if not driver-specific
  market          text not null,
  odds            text,
  odds_decimal    numeric,
  implied_prob    numeric,
  true_prob       numeric,
  edge            numeric,      -- percentage edge
  analysis        text,
  status          text default 'active', -- active | void | won | lost
  locked          boolean default true,
  locked_at       timestamptz default now(),
  result          text,         -- populated after race
  created_at      timestamptz default now()
);
create index if not exists idx_picks_race on betting_picks(race_id, status);

-- ==================== BETTING RECORD ====================
create table if not exists betting_record (
  id              uuid primary key default uuid_generate_v4(),
  season          int default 2026,
  wins            int default 0,
  losses          int default 0,
  pushes          int default 0,
  units_wagered   numeric default 0,
  units_won       numeric default 0,
  roi             numeric default 0,
  best_win        text,
  streak          int default 0,
  updated_at      timestamptz default now(),
  created_at      timestamptz default now()
);
-- Seed with empty record
insert into betting_record (season, wins, losses, roi) values (2026, 0, 0, 0)
  on conflict do nothing;

-- ==================== ARTICLES ====================
create table if not exists articles (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  slug            text unique,
  body            text,
  excerpt         text,
  author          text default 'GridFeed Staff',
  tags            text[] default '{}',
  race_id         uuid references races(id) on delete set null,
  status          text default 'published', -- published | draft | archived
  source_url      text,
  published_at    timestamptz default now(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_articles_status_date on articles(status, published_at desc);
create index if not exists idx_articles_tags on articles using gin(tags);

-- ==================== CONTENT DRAFTS ====================
create table if not exists content_drafts (
  id              uuid primary key default uuid_generate_v4(),
  title           text,
  body            text,
  excerpt         text,
  tags            text[] default '{}',
  race_id         uuid references races(id) on delete set null,
  content_type    text, -- race_recap | qualifying_recap | preview | analysis | picks_article | breaking
  source_context  text, -- what data triggered this draft
  review_status   text default 'pending', -- pending | approved | rejected
  reviewed_at     timestamptz,
  reviewed_by     text,
  published_article_id uuid references articles(id) on delete set null,
  generation_model text default 'claude-haiku-4-5',
  created_at      timestamptz default now()
);
create index if not exists idx_drafts_status on content_drafts(review_status, created_at desc);

-- ==================== CONTENT TOPICS ====================
create table if not exists content_topics (
  id              uuid primary key default uuid_generate_v4(),
  topic           text not null,
  race_id         uuid references races(id) on delete set null,
  content_type    text,
  priority        int default 5,
  status          text default 'pending', -- pending | drafted | published | skipped
  triggered_by    text, -- cron | news_detector | manual
  created_at      timestamptz default now()
);

-- ==================== SCHEDULE ====================
create table if not exists schedule (
  id              uuid primary key default uuid_generate_v4(),
  race_id         uuid references races(id) on delete cascade,
  session_type    text not null, -- fp1 | fp2 | fp3 | qualifying | race | sprint_qualifying | sprint
  session_name    text,
  scheduled_at    timestamptz,
  status          text default 'upcoming', -- upcoming | in_progress | completed
  created_at      timestamptz default now()
);

-- ==================== SYNC LOG ====================
create table if not exists sync_log (
  id              uuid primary key default uuid_generate_v4(),
  function_name   text not null,
  status          text not null, -- success | error | partial
  records_affected int default 0,
  message         text,
  duration_ms     int,
  error_detail    text,
  created_at      timestamptz default now()
);
create index if not exists idx_sync_log_fn_date on sync_log(function_name, created_at desc);

-- ==================== TOURS (just F1) ====================
create table if not exists tours (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null default 'Formula 1',
  abbreviation    text default 'F1',
  active          boolean default true,
  created_at      timestamptz default now()
);
insert into tours (name, abbreviation) values ('Formula 1', 'F1') on conflict do nothing;

-- ==================== SEED: 2026 RACES ====================
insert into races (name, circuit, country, race_date, season, round) values
  ('Bahrain Grand Prix',         'Bahrain International Circuit',    'Bahrain',     '2026-03-01 15:00:00+00', 2026, 1),
  ('Saudi Arabian Grand Prix',   'Jeddah Corniche Circuit',          'Saudi Arabia','2026-03-15 17:00:00+00', 2026, 2),
  ('Australian Grand Prix',      'Albert Park Circuit',              'Australia',   '2026-03-29 05:00:00+00', 2026, 3),
  ('Japanese Grand Prix',        'Suzuka Circuit',                   'Japan',       '2026-04-05 06:00:00+00', 2026, 4),
  ('Chinese Grand Prix',         'Shanghai International Circuit',   'China',       '2026-04-19 07:00:00+00', 2026, 5),
  ('Miami Grand Prix',           'Miami International Autodrome',    'USA',         '2026-05-03 20:00:00+00', 2026, 6),
  ('Emilia Romagna Grand Prix',  'Autodromo Enzo e Dino Ferrari',    'Italy',       '2026-05-17 13:00:00+00', 2026, 7),
  ('Monaco Grand Prix',          'Circuit de Monaco',                'Monaco',      '2026-05-24 13:00:00+00', 2026, 8),
  ('Spanish Grand Prix',         'Circuit de Barcelona-Catalunya',   'Spain',       '2026-06-07 13:00:00+00', 2026, 9),
  ('Canadian Grand Prix',        'Circuit Gilles Villeneuve',        'Canada',      '2026-06-14 18:00:00+00', 2026, 10),
  ('Austrian Grand Prix',        'Red Bull Ring',                    'Austria',     '2026-06-28 13:00:00+00', 2026, 11),
  ('British Grand Prix',         'Silverstone Circuit',              'UK',          '2026-07-05 14:00:00+00', 2026, 12),
  ('Belgian Grand Prix',         'Circuit de Spa-Francorchamps',     'Belgium',     '2026-07-26 13:00:00+00', 2026, 13),
  ('Hungarian Grand Prix',       'Hungaroring',                      'Hungary',     '2026-08-02 13:00:00+00', 2026, 14),
  ('Dutch Grand Prix',           'Circuit Zandvoort',                'Netherlands', '2026-08-30 13:00:00+00', 2026, 15),
  ('Italian Grand Prix',         'Autodromo Nazionale Monza',        'Italy',       '2026-09-06 13:00:00+00', 2026, 16),
  ('Azerbaijan Grand Prix',      'Baku City Circuit',                'Azerbaijan',  '2026-09-20 11:00:00+00', 2026, 17),
  ('Singapore Grand Prix',       'Marina Bay Street Circuit',        'Singapore',   '2026-10-04 12:00:00+00', 2026, 18),
  ('United States Grand Prix',   'Circuit of the Americas',          'USA',         '2026-10-18 19:00:00+00', 2026, 19),
  ('Mexico City Grand Prix',     'Autodromo Hermanos Rodriguez',     'Mexico',      '2026-10-25 20:00:00+00', 2026, 20),
  ('São Paulo Grand Prix',       'Autodromo Jose Carlos Pace',       'Brazil',      '2026-11-08 17:00:00+00', 2026, 21),
  ('Las Vegas Grand Prix',       'Las Vegas Street Circuit',         'USA',         '2026-11-21 06:00:00+00', 2026, 22),
  ('Qatar Grand Prix',           'Lusail International Circuit',     'Qatar',       '2026-11-29 13:00:00+00', 2026, 23),
  ('Abu Dhabi Grand Prix',       'Yas Marina Circuit',               'UAE',         '2026-12-06 13:00:00+00', 2026, 24)
on conflict do nothing;

-- ==================== SEED: DRIVER FACTS ====================
insert into driver_facts (driver_name, category, fact_text, season) values
  ('Max Verstappen',  'background',      '4x World Champion (2021-2024), Red Bull Racing. Dominated the hybrid era''s latter half with 19 wins in 2023 alone.',                   2026),
  ('Max Verstappen',  'form',            'Entering 2026 as defending champion. Unprecedented consistency in qualifying and race pace. Constructor pace remains primary variable.', 2026),
  ('Lewis Hamilton',  'background',      '7x World Champion, all-time wins leader. Moved to Ferrari for 2025 in the most anticipated transfer in F1 history.',                    2026),
  ('Lewis Hamilton',  'form',            'Ferrari partnership maturing into 2026. Circuit knowledge and wet-weather skill remain elite benchmarks.',                               2026),
  ('Charles Leclerc', 'background',      'Ferrari number one since 2019. Multiple race wins, pole positions. Consistent title contender when machinery cooperates.',              2026),
  ('Lando Norris',    'background',      'McLaren cornerstone. 2024 breakthrough season included multiple race wins and first genuine title challenge.',                          2026),
  ('Oscar Piastri',   'background',      'McLaren second driver. 2024 race wins confirmed future champion pedigree. Growing threat to team hierarchy.',                          2026),
  ('Carlos Sainz',    'background',      'Moved to Williams for 2025+. Proven race winner. Wheel-to-wheel skills among the best on the grid.',                                  2026),
  ('George Russell',  'background',      'Mercedes lead driver. Consistent podium pace, strong qualifying. Waiting for car to match ambition.',                                  2026),
  ('Fernando Alonso', 'background',      '2x World Champion. Aston Martin. Still extracting maximum from machinery. Considered by many the most complete driver ever.',         2026)
on conflict do nothing;

-- ==================== RLS POLICIES ====================
-- Public read for articles, standings, picks, schedule, races
alter table articles            enable row level security;
alter table betting_picks       enable row level security;
alter table races               enable row level security;
alter table drivers             enable row level security;
alter table constructors        enable row level security;
alter table leaderboard         enable row level security;
alter table driver_odds         enable row level security;
alter table driver_facts        enable row level security;
alter table betting_record      enable row level security;
alter table schedule            enable row level security;
alter table content_drafts      enable row level security;
alter table content_topics      enable row level security;
alter table sync_log            enable row level security;

-- Public read policies
create policy "Public read articles"       on articles        for select using (status = 'published');
create policy "Public read picks"          on betting_picks   for select using (true);
create policy "Public read races"          on races           for select using (true);
create policy "Public read drivers"        on drivers         for select using (true);
create policy "Public read constructors"   on constructors    for select using (true);
create policy "Public read leaderboard"    on leaderboard     for select using (true);
create policy "Public read driver_odds"    on driver_odds     for select using (true);
create policy "Public read driver_facts"   on driver_facts    for select using (true);
create policy "Public read betting_record" on betting_record  for select using (true);
create policy "Public read schedule"       on schedule        for select using (true);

-- Service role full access (used by Netlify functions)
create policy "Service read drafts"     on content_drafts  for select  using (true);
create policy "Service write drafts"    on content_drafts  for insert  with check (true);
create policy "Service update drafts"   on content_drafts  for update  using (true);
create policy "Service read topics"     on content_topics  for select  using (true);
create policy "Service write topics"    on content_topics  for insert  with check (true);
create policy "Service update topics"   on content_topics  for update  using (true);
create policy "Service read sync_log"   on sync_log        for select  using (true);
create policy "Service write sync_log"  on sync_log        for insert  with check (true);

-- ==================== HELPERS ====================
-- Updated_at trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

create trigger trg_races_updated_at
  before update on races
  for each row execute function update_updated_at();
