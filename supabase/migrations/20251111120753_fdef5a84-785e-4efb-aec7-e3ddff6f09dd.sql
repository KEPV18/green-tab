-- Create genesys_tickets table for storing Genesys ticket details
CREATE TABLE IF NOT EXISTS public.genesys_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
  ticket_link TEXT NOT NULL,
  rating_type TEXT NOT NULL CHECK (rating_type IN ('CSAT', 'DSAT')),
  customer_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for genesys_tickets
ALTER TABLE public.genesys_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for genesys_tickets
CREATE POLICY "Anyone can view genesys tickets" 
  ON public.genesys_tickets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert genesys tickets" 
  ON public.genesys_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update genesys tickets" 
  ON public.genesys_tickets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete genesys tickets" 
  ON public.genesys_tickets FOR DELETE USING (true);

-- Trigger for updated_at on genesys_tickets
CREATE TRIGGER update_genesys_tickets_updated_at
  BEFORE UPDATE ON public.genesys_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create weekly_data table for tracking each week independently
CREATE TABLE IF NOT EXISTS public.weekly_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 4),
  good INTEGER NOT NULL DEFAULT 0,
  bad INTEGER NOT NULL DEFAULT 0,
  genesys_good INTEGER NOT NULL DEFAULT 0,
  genesys_bad INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(performance_id, week_number)
);

-- Enable RLS for weekly_data
ALTER TABLE public.weekly_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for weekly_data
CREATE POLICY "Anyone can view weekly data" 
  ON public.weekly_data FOR SELECT USING (true);
CREATE POLICY "Anyone can insert weekly data" 
  ON public.weekly_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update weekly data" 
  ON public.weekly_data FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete weekly data" 
  ON public.weekly_data FOR DELETE USING (true);

-- Trigger for updated_at on weekly_data
CREATE TRIGGER update_weekly_data_updated_at
  BEFORE UPDATE ON public.weekly_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();