-- ============================================================
-- GRIDFEED — FULL PIPELINE MIGRATION
-- Run in Supabase SQL Editor
-- ============================================================

-- Add missing columns to content_drafts
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS priority_score int;
-- source_context may already exist as text; alter to jsonb if needed
DO $$ BEGIN
  ALTER TABLE content_drafts ALTER COLUMN source_context TYPE jsonb USING source_context::jsonb;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Add missing columns to tweets
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS scheduled_post_at timestamptz;
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS tweet_type text;

-- Monitor state (key/value)
CREATE TABLE IF NOT EXISTS monitor_state (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Topic signatures for dedup
CREATE TABLE IF NOT EXISTS topic_signatures (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  signature text UNIQUE NOT NULL,
  first_seen_title text,
  article_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Content hashes for dedup
CREATE TABLE IF NOT EXISTS content_hashes (
  hash text PRIMARY KEY,
  type text,
  source text,
  created_at timestamptz DEFAULT now()
);

-- Weather data
CREATE TABLE IF NOT EXISTS weather_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_key text,
  air_temp numeric,
  track_temp numeric,
  humidity numeric,
  wind_speed numeric,
  wind_direction numeric,
  rainfall boolean DEFAULT false,
  fetched_at timestamptz DEFAULT now()
);

-- Strategy / tyre stints
CREATE TABLE IF NOT EXISTS strategy (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_key text,
  driver_number int,
  driver_name text,
  team_name text,
  stint_number int,
  compound text,
  lap_start int,
  lap_end int,
  tyre_age int,
  pit_duration numeric,
  fetched_at timestamptz DEFAULT now()
);

-- Race control messages
CREATE TABLE IF NOT EXISTS race_control (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_key text,
  date timestamptz,
  lap_number int,
  category text,
  message text,
  flag text,
  scope text,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(session_key, date)
);

-- Historical performance (2026 races)
CREATE TABLE IF NOT EXISTS historical_performance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season int,
  race_name text,
  circuit text,
  driver_name text,
  team_name text,
  finish_position int,
  grid_position int,
  avg_lap_time numeric,
  fastest_lap boolean,
  pit_stops int,
  avg_pit_time numeric,
  tyre_strategy text,
  points_scored int,
  championship_position_after int,
  session_key text,
  created_at timestamptz DEFAULT now()
);

-- Circuit performance (multi-year history)
CREATE TABLE IF NOT EXISTS circuit_performance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  circuit text,
  driver_name text,
  team_name text,
  season int,
  finish_position int,
  grid_position int,
  dnf boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add session_key + compound columns to leaderboard if missing
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS session_key text;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS driver_number int;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS compound text;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS stint_number int;
ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS time_str text;

-- RLS for all new tables
ALTER TABLE monitor_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_performance ENABLE ROW LEVEL SECURITY;

-- Public read policies (use IF NOT EXISTS pattern via DO block)
DO $$ BEGIN
  CREATE POLICY "pub_read_weather" ON weather_data FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pub_read_strategy" ON strategy FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pub_read_rc" ON race_control FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pub_read_hist" ON historical_performance FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pub_read_circuit" ON circuit_performance FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service write policies
DO $$ BEGIN
  CREATE POLICY "svc_write_weather" ON weather_data FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_strategy" ON strategy FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_rc" ON race_control FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_hist" ON historical_performance FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_circuit" ON circuit_performance FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_monitor" ON monitor_state FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_sigs" ON topic_signatures FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_write_hashes" ON content_hashes FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delete policies for service role
DO $$ BEGIN
  CREATE POLICY "svc_delete_weather" ON weather_data FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "svc_delete_strategy" ON strategy FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
