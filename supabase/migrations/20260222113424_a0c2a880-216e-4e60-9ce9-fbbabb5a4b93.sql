
-- =============================================
-- FASE 1: ESTRUTURA MULTI-TENANT
-- =============================================

-- 1. Create tenants table
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '#1a56db',
  secondary_color text DEFAULT '#1e40af',
  accent_color text DEFAULT '#f59e0b',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 2. Drop user_clients, create user_tenants
DROP TABLE IF EXISTS public.user_clients;

CREATE TABLE public.user_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);

ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;

-- 3. Helper functions (before policies that use them)
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.user_tenants WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

-- 4. Policies for tenants
CREATE POLICY "Super admins can manage all tenants"
  ON public.tenants FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their tenants"
  ON public.tenants FOR SELECT
  USING (id IN (SELECT public.get_user_tenant_ids(auth.uid())));

-- 5. Policies for user_tenants
CREATE POLICY "Super admins can manage all user_tenants"
  ON public.user_tenants FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view own tenant mappings"
  ON public.user_tenants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage their tenant users"
  ON public.user_tenants FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  );

-- 6. Add tenant_id to clients and service_requests
ALTER TABLE public.clients ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.service_requests ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- 7. Update RLS on clients
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;

CREATE POLICY "Super admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view clients in their tenant"
  ON public.clients FOR SELECT
  USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE POLICY "Admins can manage clients in their tenant"
  ON public.clients FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin') AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  );

-- 8. Update RLS on service_requests
DROP POLICY IF EXISTS "Authenticated can view service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Operators can manage service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "Operators can update service_requests" ON public.service_requests;

CREATE POLICY "Super admins can view all service_requests"
  ON public.service_requests FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view service_requests in their tenant"
  ON public.service_requests FOR SELECT
  USING (tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid())));

CREATE POLICY "Operators can create service_requests in their tenant"
  ON public.service_requests FOR INSERT
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  );

CREATE POLICY "Operators can update service_requests in their tenant"
  ON public.service_requests FOR UPDATE
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) AND
    tenant_id IN (SELECT public.get_user_tenant_ids(auth.uid()))
  );

-- 9. Storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public) VALUES ('tenant-assets', 'tenant-assets', true);

CREATE POLICY "Anyone can view tenant assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-assets');

CREATE POLICY "Super admins can upload tenant assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tenant-assets' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update tenant assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'tenant-assets' AND public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete tenant assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'tenant-assets' AND public.is_super_admin(auth.uid()));

-- 10. Trigger and cleanup
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP FUNCTION IF EXISTS public.user_belongs_to_client(uuid, uuid);
