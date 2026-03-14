
UPDATE public.service_requests
SET status = 'completed', completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE event_type = 'accident'
  AND status NOT IN ('completed', 'cancelled')
  AND service_type = 'collision';
