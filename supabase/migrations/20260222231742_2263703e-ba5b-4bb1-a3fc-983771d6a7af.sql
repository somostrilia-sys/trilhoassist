
-- Create service request events/history table
CREATE TABLE public.service_request_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'status_change', 'dispatch', 'cancel', 'note'
  description TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_sre_service_request_id ON public.service_request_events(service_request_id);

-- Enable RLS
ALTER TABLE public.service_request_events ENABLE ROW LEVEL SECURITY;

-- Users can view events for requests in their tenant
CREATE POLICY "Users can view events via service request"
ON public.service_request_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_request_events.service_request_id
    AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Operators can insert events
CREATE POLICY "Operators can insert events"
ON public.service_request_events
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)
);
