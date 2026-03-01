
-- Drop and recreate the providers management policy to include super_admin
DROP POLICY IF EXISTS "Admins can manage providers in their tenant" ON public.providers;

CREATE POLICY "Admins can manage providers in their tenant"
ON public.providers
FOR ALL
USING (
  (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
  OR is_super_admin(auth.uid())
);
