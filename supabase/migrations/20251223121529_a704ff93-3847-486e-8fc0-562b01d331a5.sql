-- Add change_time column to daily_changes table for tracking hour:minute
ALTER TABLE public.daily_changes 
ADD COLUMN IF NOT EXISTS change_time TIME DEFAULT NULL;

-- Update existing records to use time from created_at
UPDATE public.daily_changes 
SET change_time = (created_at AT TIME ZONE 'UTC')::time
WHERE change_time IS NULL;