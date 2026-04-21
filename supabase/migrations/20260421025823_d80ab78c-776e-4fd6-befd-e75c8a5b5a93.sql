
-- Tabela de snapshots de fechamento por cooperativa
CREATE TABLE public.cooperativa_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  cooperativa text NOT NULL,
  mes_referencia date NOT NULL,
  total_atendimentos integer NOT NULL DEFAULT 0,
  valor_bruto numeric NOT NULL DEFAULT 0,
  valor_liquido numeric NOT NULL DEFAULT 0,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  gerado_automaticamente boolean NOT NULL DEFAULT false,
  enviado_externo_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id, cooperativa, mes_referencia)
);

CREATE INDEX idx_coop_closings_tenant_mes ON public.cooperativa_closings(tenant_id, mes_referencia DESC);
CREATE INDEX idx_coop_closings_cooperativa ON public.cooperativa_closings(cooperativa);

ALTER TABLE public.cooperativa_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cooperativa closings in their tenant"
ON public.cooperativa_closings FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Users can view cooperativa closings in their tenant"
ON public.cooperativa_closings FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())) OR is_super_admin(auth.uid()));

CREATE TRIGGER update_cooperativa_closings_updated_at
BEFORE UPDATE ON public.cooperativa_closings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilita extensões para cron + http (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
