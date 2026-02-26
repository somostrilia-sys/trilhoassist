
-- ============================================================
-- FIX 1: beneficiaries - Replace "true" SELECT with tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view beneficiaries" ON public.beneficiaries;

CREATE POLICY "Users can view beneficiaries in their tenant"
  ON public.beneficiaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = beneficiaries.client_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
    OR is_super_admin(auth.uid())
  );

-- ============================================================
-- FIX 2: dispatches - Replace "true" SELECT with tenant + token
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view dispatches" ON public.dispatches;

CREATE POLICY "Users can view dispatches in their tenant"
  ON public.dispatches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = dispatches.service_request_id
      AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
    OR is_super_admin(auth.uid())
  );

-- Keep public access via provider_token (already exists, no change needed)

-- ============================================================
-- FIX 3: providers - Replace "true" SELECT with tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view providers" ON public.providers;

CREATE POLICY "Users can view providers in their tenant"
  ON public.providers FOR SELECT
  USING (
    tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    OR is_super_admin(auth.uid())
  );

-- ============================================================
-- FIX 4: provider_tracking - Restrict SELECT to dispatch-based
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read tracking data" ON public.provider_tracking;

CREATE POLICY "Users can read tracking via dispatch"
  ON public.provider_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      WHERE d.id = provider_tracking.dispatch_id
      AND (
        d.provider_token IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.service_requests sr
          WHERE sr.id = d.service_request_id
          AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
        )
        OR is_super_admin(auth.uid())
      )
    )
  );

-- ============================================================
-- FIX 5: plan_coverages - Replace "true" SELECT with tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view plan_coverages" ON public.plan_coverages;

CREATE POLICY "Users can view plan_coverages in their tenant"
  ON public.plan_coverages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plans p
      JOIN public.clients c ON c.id = p.client_id
      WHERE p.id = plan_coverages.plan_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
    OR is_super_admin(auth.uid())
  );

-- ============================================================
-- FIX 6: plans - Replace "true" SELECT with tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view plans" ON public.plans;

CREATE POLICY "Users can view plans in their tenant"
  ON public.plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = plans.client_id
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
    OR is_super_admin(auth.uid())
  );

-- ============================================================
-- FIX 7: role_permissions - Replace "true" SELECT with auth check
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view role_permissions" ON public.role_permissions;

CREATE POLICY "Authenticated users can view role_permissions"
  ON public.role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- FIX 8: tenants - Protect API keys with admin-only view
-- Create a secure view hiding sensitive credentials
-- ============================================================
CREATE OR REPLACE VIEW public.tenants_safe
WITH (security_invoker = on) AS
  SELECT id, name, slug, active, cnpj, email, phone,
    street, address_number, neighborhood, city, state, zip_code,
    logo_url, favicon_url, primary_color, secondary_color, accent_color,
    custom_labels, notification_settings,
    alert_dispatch_minutes, alert_late_minutes,
    followup_timeout_minutes, followup_max_retries,
    created_at, updated_at
  FROM public.tenants;
-- Sensitive fields excluded: google_api_key, zapi_token, zapi_instance_id, 
-- zapi_security_token, evolution_api_url, evolution_api_key,
-- uazapi_admin_token, uazapi_server_url

-- ============================================================
-- FIX 9: zapi_instances - Restrict to tenant admins only
-- ============================================================

-- Add SELECT policy restricted to admins in tenant
DROP POLICY IF EXISTS "Users can view zapi_instances in their tenant" ON public.zapi_instances;

CREATE POLICY "Admins can view zapi_instances in their tenant"
  ON public.zapi_instances FOR SELECT
  USING (
    (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
    OR is_super_admin(auth.uid())
  );
