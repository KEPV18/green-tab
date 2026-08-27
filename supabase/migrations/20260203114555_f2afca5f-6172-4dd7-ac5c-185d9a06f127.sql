-- Create table for daily shift schedules
CREATE TABLE public.daily_shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  shift_date DATE NOT NULL,
  shift_start TEXT,
  shift_end TEXT,
  break1_time TEXT,
  break1_duration INTEGER DEFAULT 15,
  break2_time TEXT,
  break2_duration INTEGER DEFAULT 30,
  break3_time TEXT,
  break3_duration INTEGER DEFAULT 15,
  notes TEXT,
  is_off_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, shift_date)
);

-- Enable Row Level Security
ALTER TABLE public.daily_shifts ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own daily shifts" 
ON public.daily_shifts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily shifts" 
ON public.daily_shifts 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily shifts" 
ON public.daily_shifts 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily shifts" 
ON public.daily_shifts 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_daily_shifts_updated_at
BEFORE UPDATE ON public.daily_shifts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();