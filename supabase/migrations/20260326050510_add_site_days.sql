-- Add is_site_day tracking to daily_shifts

ALTER TABLE public.daily_shifts
ADD COLUMN IF NOT EXISTS is_site_day boolean DEFAULT false;
