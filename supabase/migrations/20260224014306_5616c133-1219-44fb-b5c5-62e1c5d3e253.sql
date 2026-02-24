
-- Table to store multiple Z-API instances per tenant (one per operator)
CREATE TABLE public.zapi_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL,
  instance_name text NOT NULL DEFAULT '',
  zapi_instance_id text NOT NULL,
  zapi_token text NOT NULL,
  zapi_security_token text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, operator_id)
);

-- Enable RLS
ALTER TABLE public.zapi_instances ENABLE ROW LEVEL SECURITY;

-- Admins can manage instances in their tenant
CREATE POLICY "Admins can manage zapi_instances"
ON public.zapi_instances
FOR ALL
USING (
  has_role(auth.uid(), 'admin') AND
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Operators can view their own instance
CREATE POLICY "Operators can view own zapi_instance"
ON public.zapi_instances
FOR SELECT
USING (auth.uid() = operator_id);

-- Super admins full access
CREATE POLICY "Super admins can manage all zapi_instances"
ON public.zapi_instances
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Add operator_zapi_instance_id to conversations to track which instance is handling
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS operator_zapi_instance_id uuid REFERENCES public.zapi_instances(id);

-- Trigger for updated_at
CREATE TRIGGER update_zapi_instances_updated_at
BEFORE UPDATE ON public.zapi_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
