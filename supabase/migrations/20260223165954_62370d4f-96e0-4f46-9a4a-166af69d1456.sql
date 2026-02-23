
-- Add destination fields to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS destination_lat double precision,
  ADD COLUMN IF NOT EXISTS destination_lng double precision,
  ADD COLUMN IF NOT EXISTS destination_address text,
  ADD COLUMN IF NOT EXISTS detected_vehicle_category text,
  ADD COLUMN IF NOT EXISTS detected_service_type text,
  ADD COLUMN IF NOT EXISTS detected_event_type text,
  ADD COLUMN IF NOT EXISTS detected_verification_answers jsonb DEFAULT '{}'::jsonb;
