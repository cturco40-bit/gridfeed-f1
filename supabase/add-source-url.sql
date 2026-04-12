-- Add source_url column to content_topics
-- Run this in Supabase SQL Editor

ALTER TABLE content_topics ADD COLUMN IF NOT EXISTS source_url text;
