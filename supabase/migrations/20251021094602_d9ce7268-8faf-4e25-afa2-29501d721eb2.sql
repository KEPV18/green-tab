-- Add Genesys fields to performance_data table
ALTER TABLE performance_data
ADD COLUMN genesys_good integer NOT NULL DEFAULT 0,
ADD COLUMN genesys_bad integer NOT NULL DEFAULT 0;

-- Create daily_changes table for tracking daily metric changes
CREATE TABLE daily_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performance_id uuid NOT NULL REFERENCES performance_data(id) ON DELETE CASCADE,
  change_date date NOT NULL,
  field_name text NOT NULL,
  old_value integer NOT NULL,
  new_value integer NOT NULL,
  change_amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_daily_changes_performance ON daily_changes(performance_id);
CREATE INDEX idx_daily_changes_date ON daily_changes(change_date);

-- Enable RLS and create policies for daily_changes
ALTER TABLE daily_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily changes" 
ON daily_changes 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert daily changes" 
ON daily_changes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update daily changes" 
ON daily_changes 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete daily changes" 
ON daily_changes 
FOR DELETE 
USING (true);

-- Add trigger for daily_changes updated_at
CREATE TRIGGER update_daily_changes_updated_at
BEFORE UPDATE ON daily_changes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();