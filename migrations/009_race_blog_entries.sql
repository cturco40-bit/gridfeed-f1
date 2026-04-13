CREATE TABLE IF NOT EXISTS race_blog_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  race_id uuid REFERENCES races(id) ON DELETE CASCADE,
  session_key text,
  lap_number int,
  event_type text,
  headline text NOT NULL,
  body text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  auto_generated boolean DEFAULT true,
  event_tag text UNIQUE,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS idx_race_blog_status ON race_blog_entries(status);
CREATE INDEX IF NOT EXISTS idx_race_blog_session ON race_blog_entries(session_key);
CREATE INDEX IF NOT EXISTS idx_race_blog_race ON race_blog_entries(race_id);

ALTER TABLE race_blog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read approved race blog" ON race_blog_entries
  FOR SELECT USING (status = 'approved');
CREATE POLICY "Service all race blog" ON race_blog_entries
  FOR ALL USING (true) WITH CHECK (true);
