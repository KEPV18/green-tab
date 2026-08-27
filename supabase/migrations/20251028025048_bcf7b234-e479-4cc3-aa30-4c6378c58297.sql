-- Drop the old check constraint that only allows CSAT
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_type_check;

-- Add new check constraint that allows DSAT and Karma
ALTER TABLE tickets ADD CONSTRAINT tickets_type_check 
  CHECK (type IN ('DSAT', 'Karma'));

-- Update any existing tickets with type 'CSAT' to 'DSAT'
UPDATE tickets SET type = 'DSAT' WHERE type = 'CSAT';