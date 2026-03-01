
-- Allow super_admin, admin, and operator to delete service_requests
CREATE POLICY "Operators can delete service_requests in their tenant"
ON public.service_requests FOR DELETE
USING (
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  OR is_super_admin(auth.uid())
);

-- Allow deleting related dispatches
CREATE POLICY "Operators can delete dispatches"
ON public.dispatches FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR is_super_admin(auth.uid())
);

-- Allow deleting related events
CREATE POLICY "Operators can delete events"
ON public.service_request_events FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'operator'::app_role)
  OR is_super_admin(auth.uid())
);
