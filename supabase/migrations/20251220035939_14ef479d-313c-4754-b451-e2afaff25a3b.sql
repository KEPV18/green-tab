
-- Add unique constraint for year, month, user_id combination
ALTER TABLE public.performance_data ADD CONSTRAINT performance_data_year_month_user_unique UNIQUE (year, month, user_id);
