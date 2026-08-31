-- KSCAT/Karma data per agent per month
-- Source: Google Sheet "KSCAT Calc" tab, range P1:X15 ONLY
-- Columns: Agent, CSAT count, KSCAT count, DSAT count, Total count,
--   Total without Karma, KSCAT %, CSAT %, Variance between CSAT and KSCAT

CREATE TABLE IF NOT EXISTS kscat_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month TEXT NOT NULL,
    agent_email TEXT NOT NULL,
    agent_name TEXT,
    csat_count NUMERIC,
    kscat_count NUMERIC,
    dsat_count NUMERIC,
    total_count NUMERIC,
    total_without_karma NUMERIC,
    kscat_pct NUMERIC,
    csat_pct NUMERIC,
    variance NUMERIC,
    source TEXT DEFAULT 'KSCAT Calc',
    fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(month, agent_email)
);

ALTER TABLE kscat_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY kscat_data_read_all ON kscat_data FOR SELECT USING (true);