
-- Table for message flows (per tenant, per vehicle category)
CREATE TABLE public.whatsapp_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  vehicle_category TEXT NOT NULL DEFAULT 'car', -- car, motorcycle, truck
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for flow steps (ordered messages)
CREATE TABLE public.whatsapp_flow_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.whatsapp_flows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,
  message_text TEXT NOT NULL,
  timeout_minutes INTEGER NOT NULL DEFAULT 3, -- reminder timeout if no answer
  is_first_manual BOOLEAN NOT NULL DEFAULT false, -- first step sent manually via quick reply
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Track flow progress on conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN current_flow_id UUID REFERENCES public.whatsapp_flows(id),
  ADD COLUMN current_flow_step INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_flow_steps ENABLE ROW LEVEL SECURITY;

-- Policies for flows
CREATE POLICY "Admins can manage flows"
  ON public.whatsapp_flows FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Users can view flows in their tenant"
  ON public.whatsapp_flows FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Policies for flow steps
CREATE POLICY "Admins can manage flow steps"
  ON public.whatsapp_flow_steps FOR ALL
  USING (EXISTS (
    SELECT 1 FROM whatsapp_flows f WHERE f.id = whatsapp_flow_steps.flow_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND f.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM whatsapp_flows f WHERE f.id = whatsapp_flow_steps.flow_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND f.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

CREATE POLICY "Users can view flow steps"
  ON public.whatsapp_flow_steps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM whatsapp_flows f WHERE f.id = whatsapp_flow_steps.flow_id
    AND f.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_flows_updated_at
  BEFORE UPDATE ON public.whatsapp_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_flow_steps_flow_order ON public.whatsapp_flow_steps(flow_id, step_order);
CREATE INDEX idx_conversations_flow ON public.whatsapp_conversations(current_flow_id) WHERE current_flow_id IS NOT NULL;
