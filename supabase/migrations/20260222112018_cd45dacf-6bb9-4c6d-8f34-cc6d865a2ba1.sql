
-- Create user-to-client mapping (N:N)
CREATE TABLE public.user_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);

ALTER TABLE public.user_clients ENABLE ROW LEVEL SECURITY;

-- Super admins can see all mappings
CREATE POLICY "Super admins can manage all user_clients"
  ON public.user_clients FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Admins can see mappings for their own clients
CREATE POLICY "Admins can view their client mappings"
  ON public.user_clients FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') AND
    client_id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
  );

-- Admins can manage users within their clients
CREATE POLICY "Admins can insert their client mappings"
  ON public.user_clients FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND
    client_id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
  );

CREATE POLICY "Admins can delete their client mappings"
  ON public.user_clients FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') AND
    client_id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
  );

-- Users can see their own mappings
CREATE POLICY "Users can view own client mappings"
  ON public.user_clients FOR SELECT
  USING (auth.uid() = user_id);

-- Helper function to check if user belongs to a client
CREATE OR REPLACE FUNCTION public.user_belongs_to_client(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_clients
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- Helper function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;
