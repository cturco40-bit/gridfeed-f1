CREATE TABLE IF NOT EXISTS historical_races (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season int NOT NULL,
  round int NOT NULL,
  race_name text NOT NULL,
  circuit_name text,
  country text,
  race_date date,
  winner_driver text,
  winner_team text,
  pole_driver text,
  fastest_lap_driver text,
  fastest_lap_time text,
  results jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(season, round)
);

ALTER TABLE historical_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read historical_races"
  ON historical_races FOR SELECT USING (true);
CREATE POLICY "Service write historical_races"
  ON historical_races FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update historical_races"
  ON historical_races FOR UPDATE USING (true);
