ALTER TABLE public.user_settings 
ADD COLUMN kpi_percentage numeric DEFAULT 70,
ADD COLUMN transportation_allowance numeric DEFAULT 0,
ADD COLUMN internet_allowance numeric DEFAULT 0,
ADD COLUMN senior_bonus numeric DEFAULT 0;