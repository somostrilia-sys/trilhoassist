
-- Table to persist dispatch pause state visible to all operators
CREATE TABLE public.dispatch_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  paused_by uuid NOT NULL,
  paused_by_name text,
  justification text NOT NULL,
  paused_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz,
  resumed_by uuid,
  resumed_by_name text,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dispatch_pauses ENABLE ROW LEVEL SECURITY;

-- Operators can manage pauses in their tenant
CREATE POLICY "Operators can manage dispatch pauses"
ON public.dispatch_pauses
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Users can view pauses in their tenant
CREATE POLICY "Users can view dispatch pauses in their tenant"
ON public.dispatch_pauses
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_pauses;

-- Index for quick lookups
CREATE INDEX idx_dispatch_pauses_active ON public.dispatch_pauses(service_request_id) WHERE resumed_at IS NULL;
