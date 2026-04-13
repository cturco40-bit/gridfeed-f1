CREATE TABLE IF NOT EXISTS article_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id uuid REFERENCES articles(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('fire','car','skull','chart','sleep')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(article_id, device_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_article_reactions_article ON article_reactions(article_id);

ALTER TABLE article_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read reactions" ON article_reactions FOR SELECT USING (true);
CREATE POLICY "Public insert reactions" ON article_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete reactions" ON article_reactions FOR DELETE USING (true);
