ALTER TABLE public.genesys_tickets 
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'Phone',
  ADD COLUMN IF NOT EXISTS ticket_id text DEFAULT '',
  ADD COLUMN IF NOT EXISTS note text DEFAULT '';