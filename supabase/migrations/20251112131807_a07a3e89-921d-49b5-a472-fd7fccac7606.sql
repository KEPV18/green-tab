-- Update genesys_tickets table to track rating score and creation date
ALTER TABLE public.genesys_tickets 
  DROP COLUMN IF EXISTS rating_type,
  ADD COLUMN IF NOT EXISTS rating_score INTEGER CHECK (rating_score >= 1 AND rating_score <= 10),
  ADD COLUMN IF NOT EXISTS ticket_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add comment to clarify rating logic
COMMENT ON COLUMN public.genesys_tickets.rating_score IS 'Rating from 1-10. Scores 7-9 are CSAT (good), others are DSAT (bad)';

-- Drop weekly_data table as it will be calculated automatically from daily_changes
DROP TABLE IF EXISTS public.weekly_data;