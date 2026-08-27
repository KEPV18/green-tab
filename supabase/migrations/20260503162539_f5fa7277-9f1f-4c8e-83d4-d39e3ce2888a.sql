ALTER TABLE public.performance_data ADD COLUMN IF NOT EXISTS manual_productivity numeric;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS transport_applied boolean NOT NULL DEFAULT true;