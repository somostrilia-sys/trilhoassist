
-- Add integration config columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS evolution_api_url text,
  ADD COLUMN IF NOT EXISTS evolution_api_key text,
  ADD COLUMN IF NOT EXISTS google_api_key text;
