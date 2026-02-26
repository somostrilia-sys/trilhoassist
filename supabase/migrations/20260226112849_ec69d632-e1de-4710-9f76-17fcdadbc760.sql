-- Fix urgent tracking RLS issues: remove recursion and keep public token access

-- 1) Security-definer helpers (avoid policy-to-policy recursion)
CREATE OR REPLACE FUNCTION public.dispatch_has_beneficiary_token(_dispatch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatches d
    JOIN public.service_requests sr ON sr.id = d.service_request_id
    WHERE d.id = _dispatch_id
      AND COALESCE(sr.beneficiary_token, '') <> ''
  )
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_has_provider_token(_dispatch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatches d
    WHERE d.id = _dispatch_id
      AND COALESCE(d.provider_token, '') <> ''
  )
$function$;

CREATE OR REPLACE FUNCTION public.service_request_has_beneficiary_token(_service_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_requests sr
    WHERE sr.id = _service_request_id
      AND COALESCE(sr.beneficiary_token, '') <> ''
  )
$function$;

CREATE OR REPLACE FUNCTION public.service_request_has_provider_dispatch(_service_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatches d
    WHERE d.service_request_id = _service_request_id
      AND COALESCE(d.provider_token, '') <> ''
  )
$function$;

CREATE OR REPLACE FUNCTION public.provider_has_beneficiary_dispatch(_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatches d
    JOIN public.service_requests sr ON sr.id = d.service_request_id
    WHERE d.provider_id = _provider_id
      AND COALESCE(sr.beneficiary_token, '') <> ''
  )
$function$;

CREATE OR REPLACE FUNCTION public.provider_has_provider_dispatch(_provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatches d
    WHERE d.provider_id = _provider_id
      AND COALESCE(d.provider_token, '') <> ''
  )
$function$;

-- 2) service_requests public token policies (anon via helper)
DROP POLICY IF EXISTS "Public can view service_requests via beneficiary_token" ON public.service_requests;
CREATE POLICY "Public can view service_requests via beneficiary_token"
ON public.service_requests
FOR SELECT
TO anon
USING (public.service_request_has_beneficiary_token(id));

DROP POLICY IF EXISTS "Public can view service_requests via dispatch" ON public.service_requests;
CREATE POLICY "Public can view service_requests via dispatch"
ON public.service_requests
FOR SELECT
TO anon
USING (public.service_request_has_provider_dispatch(id));

-- Keep tenant-scoped read for authenticated only
DROP POLICY IF EXISTS "Users can view service_requests in their tenant" ON public.service_requests;
CREATE POLICY "Users can view service_requests in their tenant"
ON public.service_requests
FOR SELECT
TO authenticated
USING (tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids));

-- 3) dispatches public token policies (anon via helper)
DROP POLICY IF EXISTS "Public can view dispatches via beneficiary_token" ON public.dispatches;
CREATE POLICY "Public can view dispatches via beneficiary_token"
ON public.dispatches
FOR SELECT
TO anon
USING (public.dispatch_has_beneficiary_token(id));

DROP POLICY IF EXISTS "Beneficiary can update dispatch arrival" ON public.dispatches;
CREATE POLICY "Beneficiary can update dispatch arrival"
ON public.dispatches
FOR UPDATE
TO anon
USING (public.dispatch_has_beneficiary_token(id))
WITH CHECK (public.dispatch_has_beneficiary_token(id));

-- Keep tenant-scoped read for authenticated only
DROP POLICY IF EXISTS "Users can view dispatches in their tenant" ON public.dispatches;
CREATE POLICY "Users can view dispatches in their tenant"
ON public.dispatches
FOR SELECT
TO authenticated
USING (
  (EXISTS (
    SELECT 1
    FROM service_requests sr
    WHERE sr.id = dispatches.service_request_id
      AND sr.tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids)
  ))
  OR is_super_admin(auth.uid())
);

-- 4) providers public token policies (anon via helper)
DROP POLICY IF EXISTS "Public can view providers via beneficiary dispatch" ON public.providers;
CREATE POLICY "Public can view providers via beneficiary dispatch"
ON public.providers
FOR SELECT
TO anon
USING (public.provider_has_beneficiary_dispatch(id));

DROP POLICY IF EXISTS "Public can view providers via dispatch" ON public.providers;
CREATE POLICY "Public can view providers via dispatch"
ON public.providers
FOR SELECT
TO anon
USING (public.provider_has_provider_dispatch(id));

-- Keep tenant-scoped read for authenticated only
DROP POLICY IF EXISTS "Users can view providers in their tenant" ON public.providers;
CREATE POLICY "Users can view providers in their tenant"
ON public.providers
FOR SELECT
TO authenticated
USING ((tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids)) OR is_super_admin(auth.uid()));

-- 5) provider_tracking public token policies (anon via helper)
DROP POLICY IF EXISTS "Public can read tracking via beneficiary token" ON public.provider_tracking;
CREATE POLICY "Public can read tracking via beneficiary token"
ON public.provider_tracking
FOR SELECT
TO anon
USING (public.dispatch_has_beneficiary_token(dispatch_id));

DROP POLICY IF EXISTS "Public can read tracking via provider token" ON public.provider_tracking;
CREATE POLICY "Public can read tracking via provider token"
ON public.provider_tracking
FOR SELECT
TO anon
USING (public.dispatch_has_provider_token(dispatch_id));

-- Keep broader read for authenticated only
DROP POLICY IF EXISTS "Users can read tracking via dispatch" ON public.provider_tracking;
CREATE POLICY "Users can read tracking via dispatch"
ON public.provider_tracking
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM dispatches d
    WHERE d.id = provider_tracking.dispatch_id
      AND (
        COALESCE(d.provider_token, '') <> ''
        OR EXISTS (
          SELECT 1
          FROM service_requests sr
          WHERE sr.id = d.service_request_id
            AND sr.tenant_id IN ( SELECT get_user_tenant_ids(auth.uid()) AS get_user_tenant_ids)
        )
        OR is_super_admin(auth.uid())
      )
  )
);