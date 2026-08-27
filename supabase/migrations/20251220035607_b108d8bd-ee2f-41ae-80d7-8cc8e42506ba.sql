
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add user_id to performance_data
ALTER TABLE public.performance_data ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'username', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Update performance_data RLS policies
DROP POLICY IF EXISTS "Anyone can view performance data" ON public.performance_data;
DROP POLICY IF EXISTS "Anyone can insert performance data" ON public.performance_data;
DROP POLICY IF EXISTS "Anyone can update performance data" ON public.performance_data;
DROP POLICY IF EXISTS "Anyone can delete performance data" ON public.performance_data;

CREATE POLICY "Users can view their own performance data"
  ON public.performance_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own performance data"
  ON public.performance_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own performance data"
  ON public.performance_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own performance data"
  ON public.performance_data FOR DELETE
  USING (auth.uid() = user_id);

-- Update related tables with user_id
ALTER TABLE public.daily_notes ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_changes ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.genesys_tickets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.hold_tickets ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS for daily_notes
DROP POLICY IF EXISTS "Anyone can view daily notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Anyone can insert daily notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Anyone can update daily notes" ON public.daily_notes;
DROP POLICY IF EXISTS "Anyone can delete daily notes" ON public.daily_notes;

CREATE POLICY "Users can view their own daily notes"
  ON public.daily_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own daily notes"
  ON public.daily_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily notes"
  ON public.daily_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own daily notes"
  ON public.daily_notes FOR DELETE USING (auth.uid() = user_id);

-- Update RLS for daily_changes
DROP POLICY IF EXISTS "Anyone can view daily changes" ON public.daily_changes;
DROP POLICY IF EXISTS "Anyone can insert daily changes" ON public.daily_changes;
DROP POLICY IF EXISTS "Anyone can update daily changes" ON public.daily_changes;
DROP POLICY IF EXISTS "Anyone can delete daily changes" ON public.daily_changes;

CREATE POLICY "Users can view their own daily changes"
  ON public.daily_changes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own daily changes"
  ON public.daily_changes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own daily changes"
  ON public.daily_changes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own daily changes"
  ON public.daily_changes FOR DELETE USING (auth.uid() = user_id);

-- Update RLS for genesys_tickets
DROP POLICY IF EXISTS "Anyone can view genesys tickets" ON public.genesys_tickets;
DROP POLICY IF EXISTS "Anyone can insert genesys tickets" ON public.genesys_tickets;
DROP POLICY IF EXISTS "Anyone can update genesys tickets" ON public.genesys_tickets;
DROP POLICY IF EXISTS "Anyone can delete genesys tickets" ON public.genesys_tickets;

CREATE POLICY "Users can view their own genesys tickets"
  ON public.genesys_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own genesys tickets"
  ON public.genesys_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own genesys tickets"
  ON public.genesys_tickets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own genesys tickets"
  ON public.genesys_tickets FOR DELETE USING (auth.uid() = user_id);

-- Update RLS for tickets
DROP POLICY IF EXISTS "Anyone can view tickets" ON public.tickets;
DROP POLICY IF EXISTS "Anyone can insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "Anyone can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Anyone can delete tickets" ON public.tickets;

CREATE POLICY "Users can view their own tickets"
  ON public.tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tickets"
  ON public.tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tickets"
  ON public.tickets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tickets"
  ON public.tickets FOR DELETE USING (auth.uid() = user_id);

-- Update RLS for hold_tickets
DROP POLICY IF EXISTS "Anyone can view hold tickets" ON public.hold_tickets;
DROP POLICY IF EXISTS "Anyone can insert hold tickets" ON public.hold_tickets;
DROP POLICY IF EXISTS "Anyone can update hold tickets" ON public.hold_tickets;
DROP POLICY IF EXISTS "Anyone can delete hold tickets" ON public.hold_tickets;

CREATE POLICY "Users can view their own hold tickets"
  ON public.hold_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own hold tickets"
  ON public.hold_tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own hold tickets"
  ON public.hold_tickets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own hold tickets"
  ON public.hold_tickets FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
