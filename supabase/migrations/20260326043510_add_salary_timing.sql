-- Migration to add salary timing flexibility to user_settings

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS salary_payment_day integer DEFAULT 27,
ADD COLUMN IF NOT EXISTS salary_delay_months integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS kpi_delay_months integer DEFAULT 2;
