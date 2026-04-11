-- Add retry tracking columns to content_topics
-- Run this in Supabase SQL Editor

ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0;

ALTER TABLE content_topics
  ADD COLUMN IF NOT EXISTS last_error text;

-- Revert any previously skipped topics so they can be retried
UPDATE content_topics SET status = 'pending' WHERE status = 'skipped';
