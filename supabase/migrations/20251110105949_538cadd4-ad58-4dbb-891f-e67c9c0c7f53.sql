-- Ensure required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create performance_data table if missing (with latest columns)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_data'
  ) THEN
    CREATE TABLE public.performance_data (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      good INTEGER NOT NULL DEFAULT 0,
      bad INTEGER NOT NULL DEFAULT 0,
      karma_bad INTEGER NOT NULL DEFAULT 0,
      good_phone INTEGER NOT NULL DEFAULT 0,
      good_chat INTEGER NOT NULL DEFAULT 0,
      good_email INTEGER NOT NULL DEFAULT 0,
      genesys_good INTEGER NOT NULL DEFAULT 0,
      genesys_bad INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      UNIQUE(year, month)
    );
  END IF;
END$$;

-- Create tickets table if missing (with DSAT + Karma types)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tickets'
  ) THEN
    CREATE TABLE public.tickets (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
      ticket_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('DSAT', 'Karma')),
      channel TEXT NOT NULL CHECK (channel IN ('Phone', 'Chat', 'Email')),
      note TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    );
  END IF;
END$$;

-- If tickets table exists with old constraint values, update it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage ccu
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'tickets'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name = 'tickets_type_check'
  ) THEN
    -- Drop and recreate to allow DSAT + Karma
    EXECUTE 'ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_type_check';
    EXECUTE 'ALTER TABLE public.tickets ADD CONSTRAINT tickets_type_check CHECK (type IN (''DSAT'',''Karma''))';
    -- Migrate any legacy CSAT values
    EXECUTE 'UPDATE public.tickets SET type = ''DSAT'' WHERE type = ''CSAT''';
  END IF;
END$$;

-- Create daily_changes table if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_changes'
  ) THEN
    CREATE TABLE public.daily_changes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      performance_id uuid NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
      change_date date NOT NULL,
      field_name text NOT NULL,
      old_value integer NOT NULL,
      new_value integer NOT NULL,
      change_amount integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_daily_changes_performance ON public.daily_changes(performance_id);
    CREATE INDEX IF NOT EXISTS idx_daily_changes_date ON public.daily_changes(change_date);
  END IF;
END$$;

-- Enable RLS (idempotent)
ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_changes ENABLE ROW LEVEL SECURITY;

-- Helper to create policy only if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_data' AND policyname='Anyone can view performance data') THEN
    CREATE POLICY "Anyone can view performance data" ON public.performance_data FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_data' AND policyname='Anyone can insert performance data') THEN
    CREATE POLICY "Anyone can insert performance data" ON public.performance_data FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_data' AND policyname='Anyone can update performance data') THEN
    CREATE POLICY "Anyone can update performance data" ON public.performance_data FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='performance_data' AND policyname='Anyone can delete performance data') THEN
    CREATE POLICY "Anyone can delete performance data" ON public.performance_data FOR DELETE USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Anyone can view tickets') THEN
    CREATE POLICY "Anyone can view tickets" ON public.tickets FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Anyone can insert tickets') THEN
    CREATE POLICY "Anyone can insert tickets" ON public.tickets FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Anyone can update tickets') THEN
    CREATE POLICY "Anyone can update tickets" ON public.tickets FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tickets' AND policyname='Anyone can delete tickets') THEN
    CREATE POLICY "Anyone can delete tickets" ON public.tickets FOR DELETE USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='daily_changes' AND policyname='Anyone can view daily changes') THEN
    CREATE POLICY "Anyone can view daily changes" ON public.daily_changes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='daily_changes' AND policyname='Anyone can insert daily changes') THEN
    CREATE POLICY "Anyone can insert daily changes" ON public.daily_changes FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='daily_changes' AND policyname='Anyone can update daily changes') THEN
    CREATE POLICY "Anyone can update daily changes" ON public.daily_changes FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='daily_changes' AND policyname='Anyone can delete daily changes') THEN
    CREATE POLICY "Anyone can delete daily changes" ON public.daily_changes FOR DELETE USING (true);
  END IF;
END$$;

-- Ensure timestamp triggers exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_performance_data_updated_at') THEN
    CREATE TRIGGER update_performance_data_updated_at
    BEFORE UPDATE ON public.performance_data
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tickets_updated_at') THEN
    CREATE TRIGGER update_tickets_updated_at
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_daily_changes_updated_at') THEN
    CREATE TRIGGER update_daily_changes_updated_at
    BEFORE UPDATE ON public.daily_changes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;

-- Nudge API to reload schema cache
NOTIFY pgrst, 'reload schema';