-- Add off_days column to performance_data table
ALTER TABLE public.performance_data 
ADD COLUMN off_days integer[] DEFAULT NULL;