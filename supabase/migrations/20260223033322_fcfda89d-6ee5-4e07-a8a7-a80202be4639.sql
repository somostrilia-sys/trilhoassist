-- Table to store ERP field mappings (de-para) per client
CREATE TABLE public.erp_field_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  field_type TEXT NOT NULL, -- 'plan' or 'cooperativa'
  erp_value TEXT NOT NULL,  -- value from ERP
  trilho_value TEXT,        -- mapped value in Trilho (display)
  trilho_id UUID,           -- optional: linked plan_id or other entity ID
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, field_type, erp_value)
);

ALTER TABLE public.erp_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mappings in their tenant"
ON public.erp_field_mappings
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "Users can view mappings in their tenant"
ON public.erp_field_mappings
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Table to log ERP sync history
CREATE TABLE public.erp_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  sync_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'automatic'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
  records_found INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync logs in their tenant"
ON public.erp_sync_logs
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

CREATE POLICY "Users can view sync logs in their tenant"
ON public.erp_sync_logs
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Trigger for updated_at on erp_field_mappings
CREATE TRIGGER update_erp_field_mappings_updated_at
BEFORE UPDATE ON public.erp_field_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add auto_sync_enabled and sync_interval to clients
ALTER TABLE public.clients
ADD COLUMN auto_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN sync_interval_minutes INTEGER DEFAULT 60;