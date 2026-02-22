
-- Table to map which modules each role can access
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (role, module)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read permissions (needed for sidebar filtering)
CREATE POLICY "Authenticated users can view role_permissions"
  ON public.role_permissions FOR SELECT
  USING (true);

-- Only admins can manage permissions
CREATE POLICY "Admins can manage role_permissions"
  ON public.role_permissions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default permissions for all roles and modules
INSERT INTO public.role_permissions (role, module, enabled) VALUES
  -- Admin has access to everything
  ('admin', 'dashboard', true),
  ('admin', 'operation', true),
  ('admin', 'business', true),
  ('admin', 'network', true),
  ('admin', 'finance', true),
  ('admin', 'reports', true),
  ('admin', 'settings', true),
  -- Operator defaults
  ('operator', 'dashboard', true),
  ('operator', 'operation', true),
  ('operator', 'business', false),
  ('operator', 'network', true),
  ('operator', 'finance', false),
  ('operator', 'reports', false),
  ('operator', 'settings', false),
  -- Provider defaults
  ('provider', 'dashboard', true),
  ('provider', 'operation', false),
  ('provider', 'business', false),
  ('provider', 'network', false),
  ('provider', 'finance', false),
  ('provider', 'reports', false),
  ('provider', 'settings', false),
  -- Client defaults
  ('client', 'dashboard', true),
  ('client', 'operation', false),
  ('client', 'business', false),
  ('client', 'network', false),
  ('client', 'finance', false),
  ('client', 'reports', false),
  ('client', 'settings', false);
