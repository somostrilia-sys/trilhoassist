
-- Adicionar modelo de cobrança ao cliente (default: plate_plus_service)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'plate_plus_service'
  CHECK (billing_model IN ('plate_only', 'plate_plus_service'));

-- Adicionar valor por placa ao plano
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plate_fee NUMERIC DEFAULT 0;
