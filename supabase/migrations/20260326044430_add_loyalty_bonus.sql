-- Migration to add loyalty bonus tracking to user_settings

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS employee_type text DEFAULT 'new',
ADD COLUMN IF NOT EXISTS start_month text;
