-- Create performance_data table to store monthly metrics
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(year, month)
);

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  performance_id UUID NOT NULL REFERENCES public.performance_data(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CSAT', 'Karma')),
  channel TEXT NOT NULL CHECK (channel IN ('Phone', 'Chat', 'Email')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Anyone can view performance data" 
ON public.performance_data 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert performance data" 
ON public.performance_data 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update performance data" 
ON public.performance_data 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete performance data" 
ON public.performance_data 
FOR DELETE 
USING (true);

CREATE POLICY "Anyone can view tickets" 
ON public.tickets 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert tickets" 
ON public.tickets 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update tickets" 
ON public.tickets 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete tickets" 
ON public.tickets 
FOR DELETE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_performance_data_updated_at
BEFORE UPDATE ON public.performance_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_performance_data_year_month ON public.performance_data(year, month);
CREATE INDEX idx_tickets_performance_id ON public.tickets(performance_id);