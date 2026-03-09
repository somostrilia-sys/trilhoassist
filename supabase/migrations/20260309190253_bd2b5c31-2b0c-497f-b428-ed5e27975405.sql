-- Add new service types to the enum
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'return_home';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'driver_friend';

-- Add lodging_max_total and notes columns to plan_coverages
ALTER TABLE plan_coverages
  ADD COLUMN IF NOT EXISTS lodging_max_total numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;