-- Add image_url column to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for article images
-- Run this in Supabase Dashboard > Storage > Create bucket
-- Or via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('article-images', 'article-images', true, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read policy
DROP POLICY IF EXISTS "Public read article-images" ON storage.objects;
CREATE POLICY "Public read article-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'article-images');

-- Service role write policy (anon key won't have this)
DROP POLICY IF EXISTS "Service write article-images" ON storage.objects;
CREATE POLICY "Service write article-images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'article-images');

DROP POLICY IF EXISTS "Service update article-images" ON storage.objects;
CREATE POLICY "Service update article-images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'article-images');
