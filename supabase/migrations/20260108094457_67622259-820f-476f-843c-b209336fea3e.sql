-- Create table for daily survey conversion tracking
CREATE TABLE public.daily_survey_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  call_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_calls INTEGER NOT NULL DEFAULT 0,
  surveys_sent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, call_date)
);

-- Enable RLS
ALTER TABLE public.daily_survey_calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own survey calls"
ON public.daily_survey_calls FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own survey calls"
ON public.daily_survey_calls FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own survey calls"
ON public.daily_survey_calls FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own survey calls"
ON public.daily_survey_calls FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_daily_survey_calls_updated_at
BEFORE UPDATE ON public.daily_survey_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();