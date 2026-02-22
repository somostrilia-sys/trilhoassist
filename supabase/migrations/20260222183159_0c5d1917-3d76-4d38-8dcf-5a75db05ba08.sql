
-- Tabela de fechamentos financeiros (pagamento a prestadores)
CREATE TABLE public.financial_closings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  provider_id UUID NOT NULL REFERENCES public.providers(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_services INTEGER NOT NULL DEFAULT 0,
  total_provider_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  closed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de itens do fechamento (service_requests incluídas)
CREATE TABLE public.financial_closing_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closing_id UUID NOT NULL REFERENCES public.financial_closings(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id),
  provider_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de faturas (cobrança de clientes)
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_services INTEGER NOT NULL DEFAULT 0,
  total_charged NUMERIC NOT NULL DEFAULT 0,
  total_provider_cost NUMERIC NOT NULL DEFAULT 0,
  markup_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  sent_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de itens da fatura
CREATE TABLE public.invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id),
  charged_amount NUMERIC NOT NULL DEFAULT 0,
  provider_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para financial_closings
ALTER TABLE public.financial_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view closings in their tenant"
  ON public.financial_closings FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Admins can manage closings"
  ON public.financial_closings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS para financial_closing_items
ALTER TABLE public.financial_closing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view closing items via closing"
  ON public.financial_closing_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.financial_closings fc
    WHERE fc.id = closing_id
    AND fc.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

CREATE POLICY "Admins can manage closing items"
  ON public.financial_closing_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.financial_closings fc
    WHERE fc.id = closing_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND fc.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.financial_closings fc
    WHERE fc.id = closing_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND fc.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- RLS para invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices in their tenant"
  ON public.invoices FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Admins can manage invoices"
  ON public.invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- RLS para invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice items via invoice"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_id
    AND inv.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

CREATE POLICY "Admins can manage invoice items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND inv.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = invoice_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND inv.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  ));

-- Triggers de updated_at
CREATE TRIGGER update_financial_closings_updated_at
  BEFORE UPDATE ON public.financial_closings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna financial_status em service_requests para rastrear se já foi incluída em fechamento/fatura
ALTER TABLE public.service_requests 
  ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'pending' CHECK (financial_status IN ('pending', 'closing_included', 'invoice_included', 'settled'));
