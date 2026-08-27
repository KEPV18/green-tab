-- Green Tab — Team Metrics table
-- Migration: 20260827000000_team_metrics.sql
--
-- PURPOSE: Store daily team metrics extracted from Google Sheets.
-- This is the PRIMARY and PERMANENT source of truth for the Green Tab dashboard.
--
-- CRITICAL FIELD MAPPING:
--   chat_aht = "Average basket time" from Sheet19 (Chat AHT metric)
--   genesys_aht = "Genesys Inbound AHT + ACW" (Voice/Call AHT — always NULL currently)
--   chat_handling_time = "Average handling time" (separate from Chat AHT)
--   These are DIFFERENT metrics and must NEVER be conflated.
--
-- MISSING VALUES: Must remain NULL. Do NOT substitute 0 for missing data.
-- A value of 0 is a legitimate real value (e.g., Sherif Fathy has chat_aht = 0).
-- A NULL means the metric was not available for that agent.
--
-- UNIQUE CONSTRAINT: (month, agent_email) prevents duplicate imports.
-- Upserts use ON CONFLICT to update existing records.
--
-- RLS: Public read (anon key), service_role write only.
-- The Python fetch script uses the service_role key for upserts.
-- The frontend reads with the anon key.

-- Create the table
CREATE TABLE IF NOT EXISTS public.team_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,                        -- e.g., "August 2026" or "2026-08"
  report_date DATE,                           -- e.g., 2026-08-01 (first of month)
  agent_email TEXT NOT NULL,                  -- e.g., "ahmed.ahmed.5@tabby.ai"
  agent_name TEXT NOT NULL DEFAULT '',         -- e.g., "Ahmed Ahmed"
  bamboo_id TEXT,                              -- e.g., "14996" from Tab0, NULL if unknown
  team_lead TEXT,                              -- e.g., "Mohamed Gabry", NULL if unknown
  csat NUMERIC,                               -- CSAT adjusted with calls % — NULL if missing
  productivity NUMERIC,                       -- Productivity 8-hrs — NULL if missing
  fcr NUMERIC,                                -- FCR % — NULL if missing
  chat_aht NUMERIC,                           -- Average basket time (Chat AHT) — NULL if missing
  genesys_aht NUMERIC,                        -- Genesys Inbound AHT + ACW (voice) — NULL if missing
  chat_handling_time NUMERIC,                  -- Average handling time (separate metric) — NULL if missing
  avg_group_basket_time NUMERIC,              -- Average group basket time — NULL if missing
  escalation_rate NUMERIC,                    -- Escalation rate % — NULL if missing
  adherence NUMERIC,                          -- Adherence % — NULL if missing
  closed_after_resolution NUMERIC,             -- Closed after resolution % — NULL if missing
  closed_tickets_pct NUMERIC,                  -- Closed tickets % — NULL if missing
  deescalation_rate NUMERIC,                   -- Deescalation rate % — NULL if missing
  occupancy NUMERIC,                           -- Occupancy daily % — NULL if missing
  concurrency NUMERIC,                         -- Concurrency — NULL if missing
  irt_replier NUMERIC,                          -- IRT 2 replier — NULL if missing
  shrinkage NUMERIC,                           -- Shrinkage - agent - unplanned % — NULL if missing
  utilization NUMERIC,                         -- Utilization daily % — NULL if missing
  source TEXT NOT NULL DEFAULT 'sheet19',      -- Data source identifier
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate entries for the same agent/month
  UNIQUE(month, agent_email)
);

-- Enable Row Level Security
ALTER TABLE public.team_metrics ENABLE ROW LEVEL SECURITY;

-- Public read policy (frontend uses anon key)
CREATE POLICY "Anyone can view team metrics"
ON public.team_metrics
FOR SELECT
USING (true);

-- Note: Write access (INSERT/UPDATE/DELETE) is restricted to service_role only.
-- No public insert/update/delete policy is created.
-- The Python fetch script uses the service_role key to upsert data.

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_team_metrics_updated_at ON public.team_metrics;
CREATE TRIGGER update_team_metrics_updated_at
  BEFORE UPDATE ON public.team_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_team_metrics_month ON public.team_metrics(month);
CREATE INDEX IF NOT EXISTS idx_team_metrics_email ON public.team_metrics(agent_email);
CREATE INDEX IF NOT EXISTS idx_team_metrics_report_date ON public.team_metrics(report_date);