-- Add FCR (First Call Resolution) percentage field to performance_data table
ALTER TABLE public.performance_data 
ADD COLUMN fcr numeric(5,2) DEFAULT 0.00 CHECK (fcr >= 0 AND fcr <= 100);