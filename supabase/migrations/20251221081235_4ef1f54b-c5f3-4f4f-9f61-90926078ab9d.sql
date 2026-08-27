-- Drop the trigger on daily_changes that references updated_at column that doesn't exist
DROP TRIGGER IF EXISTS update_daily_changes_updated_at ON public.daily_changes;