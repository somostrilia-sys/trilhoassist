-- Add columns to whatsapp_conversations for extracted data
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS detected_plate TEXT,
  ADD COLUMN IF NOT EXISTS detected_vehicle_model TEXT,
  ADD COLUMN IF NOT EXISTS detected_vehicle_year INTEGER,
  ADD COLUMN IF NOT EXISTS detected_beneficiary_name TEXT,
  ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;