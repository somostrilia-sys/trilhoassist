
-- ============================================================
-- FINAL SECURITY HARDENING - Fix remaining RLS gaps
-- ============================================================

-- 1. FIX: providers ALL policy - add tenant scoping
DROP POLICY IF EXISTS "Admins can manage providers" ON public.providers;
CREATE POLICY "Admins can manage providers in their tenant"
  ON public.providers FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  );

-- 2. FIX: beneficiaries ALL policy - add tenant scoping
DROP POLICY IF EXISTS "Operators can manage beneficiaries" ON public.beneficiaries;
CREATE POLICY "Operators can manage beneficiaries in their tenant"
  ON public.beneficiaries FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = beneficiaries.client_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = beneficiaries.client_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

-- 3. FIX: plan_usage_exceptions - add tenant scoping
DROP POLICY IF EXISTS "Operators can manage exceptions" ON public.plan_usage_exceptions;
CREATE POLICY "Operators can manage exceptions in their tenant"
  ON public.plan_usage_exceptions FOR ALL
  USING (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND EXISTS (
      SELECT 1 FROM beneficiaries b
      JOIN clients c ON c.id = b.client_id
      WHERE b.id = plan_usage_exceptions.beneficiary_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND EXISTS (
      SELECT 1 FROM beneficiaries b
      JOIN clients c ON c.id = b.client_id
      WHERE b.id = plan_usage_exceptions.beneficiary_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

-- 4. FIX: tenants SELECT - restrict full table to admins only (operators use tenants_safe view)
DROP POLICY IF EXISTS "Users can view their tenants" ON public.tenants;
CREATE POLICY "Admins can view their tenants"
  ON public.tenants FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND id IN (SELECT get_user_tenant_ids(auth.uid()))
  );

-- Operators/other roles get read access via tenants_safe view only
CREATE POLICY "Authenticated users can view tenants_safe"
  ON public.tenants FOR SELECT
  USING (
    id IN (SELECT get_user_tenant_ids(auth.uid()))
    AND NOT (
      has_role(auth.uid(), 'admin'::app_role)
      OR is_super_admin(auth.uid())
    )
  );

-- 5. FIX: Recreate tenants_safe view WITH security_invoker
DROP VIEW IF EXISTS public.tenants_safe;
CREATE VIEW public.tenants_safe
WITH (security_invoker = on) AS
  SELECT id, name, slug, active, cnpj, email, phone,
         street, address_number, neighborhood, city, state, zip_code,
         logo_url, favicon_url, primary_color, secondary_color, accent_color,
         custom_labels, notification_settings,
         alert_dispatch_minutes, alert_late_minutes,
         followup_timeout_minutes, followup_max_retries,
         created_at, updated_at
  FROM public.tenants;

-- Grant access to the view
GRANT SELECT ON public.tenants_safe TO authenticated, anon;
