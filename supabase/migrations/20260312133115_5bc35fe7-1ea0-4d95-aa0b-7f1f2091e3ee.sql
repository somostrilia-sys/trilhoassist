ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS assigned_name TEXT;