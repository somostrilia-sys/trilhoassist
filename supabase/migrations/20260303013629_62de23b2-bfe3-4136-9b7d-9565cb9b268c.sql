
-- Drop existing policies on dispatch_pauses
DROP POLICY IF EXISTS "Operators can manage dispatch pauses" ON public.dispatch_pauses;
DROP POLICY IF EXISTS "Users can view dispatch pauses in their tenant" ON public.dispatch_pauses;

-- Recreate with super_admin included
CREATE POLICY "Operators can manage dispatch pauses"
ON public.dispatch_pauses
FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_super_admin(auth.uid()))
  AND (tenant_id IN (SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role) OR is_super_admin(auth.uid()))
  AND (tenant_id IN (SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids))
);

CREATE POLICY "Users can view dispatch pauses in their tenant"
ON public.dispatch_pauses
FOR SELECT
USING (
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids)
  OR is_super_admin(auth.uid())
);
