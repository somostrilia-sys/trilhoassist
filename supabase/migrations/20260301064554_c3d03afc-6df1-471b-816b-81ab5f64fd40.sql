
-- Fix dispatches INSERT policy to include super_admin
DROP POLICY IF EXISTS "Operators can manage dispatches" ON public.dispatches;
CREATE POLICY "Operators can manage dispatches"
ON public.dispatches FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR is_super_admin(auth.uid())
);

-- Fix dispatches UPDATE policy to include super_admin
DROP POLICY IF EXISTS "Operators can update dispatches" ON public.dispatches;
CREATE POLICY "Operators can update dispatches"
ON public.dispatches FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR is_super_admin(auth.uid())
);

-- Fix service_request_events INSERT policy to include super_admin
DROP POLICY IF EXISTS "Operators can insert events" ON public.service_request_events;
CREATE POLICY "Operators can insert events"
ON public.service_request_events FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR is_super_admin(auth.uid())
);

-- Fix service_requests INSERT policy to include super_admin
DROP POLICY IF EXISTS "Operators can create service_requests in their tenant" ON public.service_requests;
CREATE POLICY "Operators can create service_requests in their tenant"
ON public.service_requests FOR INSERT
WITH CHECK (
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  OR is_super_admin(auth.uid())
);

-- Fix service_requests UPDATE policy to include super_admin
DROP POLICY IF EXISTS "Operators can update service_requests in their tenant" ON public.service_requests;
CREATE POLICY "Operators can update service_requests in their tenant"
ON public.service_requests FOR UPDATE
USING (
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  OR is_super_admin(auth.uid())
);
