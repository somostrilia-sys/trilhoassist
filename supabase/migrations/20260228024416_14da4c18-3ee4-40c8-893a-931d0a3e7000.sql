ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS scheduled_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_time time DEFAULT NULL;