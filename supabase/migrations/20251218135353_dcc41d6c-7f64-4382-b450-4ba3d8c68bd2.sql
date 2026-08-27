-- Create daily_notes table for daily events/problems
CREATE TABLE public.daily_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
  note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view daily notes" ON public.daily_notes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert daily notes" ON public.daily_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update daily notes" ON public.daily_notes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete daily notes" ON public.daily_notes FOR DELETE USING (true);

-- Create hold_tickets table for tickets on hold
CREATE TABLE public.hold_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
  ticket_link TEXT NOT NULL,
  reason TEXT,
  hold_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hold_hours INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.hold_tickets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view hold tickets" ON public.hold_tickets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert hold tickets" ON public.hold_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update hold tickets" ON public.hold_tickets FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete hold tickets" ON public.hold_tickets FOR DELETE USING (true);