
-- Create provider blacklist table
CREATE TABLE public.provider_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  blocked_by UUID REFERENCES auth.users(id),
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unblocked_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_id, tenant_id, active)
);

-- Enable RLS
ALTER TABLE public.provider_blacklist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view blacklist in their tenant"
  ON public.provider_blacklist FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Admins can manage blacklist"
  ON public.provider_blacklist FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Operators can manage blacklist"
  ON public.provider_blacklist FOR ALL
  USING (has_role(auth.uid(), 'operator'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'operator'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Trigger for updated_at
CREATE TRIGGER update_provider_blacklist_updated_at
  BEFORE UPDATE ON public.provider_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
