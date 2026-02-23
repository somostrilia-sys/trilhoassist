
-- Add alert configuration to tenants
ALTER TABLE public.tenants
  ADD COLUMN alert_dispatch_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN alert_late_minutes integer NOT NULL DEFAULT 10;

-- Add arrival tracking to dispatches
ALTER TABLE public.dispatches
  ADD COLUMN provider_arrived_at timestamp with time zone,
  ADD COLUMN beneficiary_arrived_at timestamp with time zone;
