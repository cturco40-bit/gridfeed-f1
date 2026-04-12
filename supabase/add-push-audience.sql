-- Add audience column to push_subscriptions for admin/public split
-- Run this in Supabase SQL Editor

-- Add audience column
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS audience text DEFAULT 'public'
  CHECK (audience IN ('public', 'admin'));

-- Drop old unique constraint on endpoint alone
ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;

-- Add new unique constraint on (endpoint, audience)
-- so same device can subscribe to both channels
ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_audience_key
  UNIQUE (endpoint, audience);

-- Mark all existing subscriptions as 'public'
UPDATE push_subscriptions SET audience = 'public' WHERE audience IS NULL;
