ALTER TABLE public.dispatches 
  ADD COLUMN IF NOT EXISTS scheduled_arrival_date date,
  ADD COLUMN IF NOT EXISTS scheduled_arrival_time time without time zone;