ALTER TABLE public.user_settings 
ADD COLUMN base_salary numeric DEFAULT NULL,
ADD COLUMN tax_rate numeric DEFAULT NULL;