
-- Add verification_answers JSONB column and vehicle_category to service_requests
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS vehicle_category text DEFAULT 'car',
  ADD COLUMN IF NOT EXISTS verification_answers jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.service_requests.vehicle_category IS 'car, motorcycle, or truck';
COMMENT ON COLUMN public.service_requests.verification_answers IS 'Conditional verification answers based on vehicle category';
