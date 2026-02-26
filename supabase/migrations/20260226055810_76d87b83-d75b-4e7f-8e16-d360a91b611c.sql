
-- FIX: Remove the problematic policy that lets non-admins SELECT tenants directly
DROP POLICY IF EXISTS "Authenticated users can view tenants_safe" ON public.tenants;

-- Recreate tenants_safe WITHOUT security_invoker so it runs as view owner
-- This allows operators to query the view without needing direct SELECT on tenants
DROP VIEW IF EXISTS public.tenants_safe;
CREATE VIEW public.tenants_safe AS
  SELECT id, name, slug, active, cnpj, email, phone,
         street, address_number, neighborhood, city, state, zip_code,
         logo_url, favicon_url, primary_color, secondary_color, accent_color,
         custom_labels, notification_settings,
         alert_dispatch_minutes, alert_late_minutes,
         followup_timeout_minutes, followup_max_retries,
         created_at, updated_at
  FROM public.tenants;

-- Grant SELECT on the view to all roles
GRANT SELECT ON public.tenants_safe TO authenticated, anon;
