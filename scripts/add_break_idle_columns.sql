-- Migration: Add break_exceed and idle_time columns to team_metrics
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE team_metrics ADD COLUMN IF NOT EXISTS break_exceed NUMERIC DEFAULT NULL;
ALTER TABLE team_metrics ADD COLUMN IF NOT EXISTS idle_time NUMERIC DEFAULT NULL;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'team_metrics'
  AND column_name IN ('break_exceed', 'idle_time');