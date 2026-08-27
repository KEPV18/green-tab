-- Migrate existing legacy absence_type string enums to the comprehensive matrix
UPDATE public.daily_shifts SET absence_type = 'no_show' WHERE absence_type = 'unexcused';
UPDATE public.daily_shifts SET absence_type = 'annual_leave' WHERE absence_type = 'scheduled';
-- Notice there wasn't a casual_leave type previously, so no back-fill required
