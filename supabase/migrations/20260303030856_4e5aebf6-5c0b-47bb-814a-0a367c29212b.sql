
-- Fix invoices policy to include super_admin
DROP POLICY IF EXISTS "Admins and operators can manage invoices" ON public.invoices;

CREATE POLICY "Admins operators and super_admins can manage invoices"
ON public.invoices
FOR ALL
USING (
  (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
  OR is_super_admin(auth.uid())
);

-- Fix invoice_items policy to include super_admin
DROP POLICY IF EXISTS "Admins and operators can manage invoice items" ON public.invoice_items;

CREATE POLICY "Admins operators and super_admins can manage invoice items"
ON public.invoice_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND (
      (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND inv.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices inv
    WHERE inv.id = invoice_items.invoice_id
    AND (
      (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND inv.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )
  OR is_super_admin(auth.uid())
);
