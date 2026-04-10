-- Lock articles table to only GridFeed authors
-- Run in Supabase SQL Editor

ALTER TABLE articles DROP CONSTRAINT IF EXISTS only_gridfeed_content;
ALTER TABLE articles ADD CONSTRAINT only_gridfeed_content
  CHECK (author IN ('GridFeed Staff', 'GridFeed AI', 'GridFeed'));
