
-- Clients (empresas que contratam a assistência)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  contact_email TEXT,
  contact_phone TEXT,
  api_endpoint TEXT,
  api_key TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage clients" ON public.clients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Plans
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  max_dispatches_per_year INT DEFAULT 4,
  max_tow_km INT DEFAULT 100,
  services JSONB DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage plans" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Beneficiaries (veículos/associados)
CREATE TABLE public.beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.plans(id),
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  vehicle_plate TEXT,
  vehicle_model TEXT,
  vehicle_year INT,
  vehicle_chassis TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view beneficiaries" ON public.beneficiaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators can manage beneficiaries" ON public.beneficiaries FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- Providers (prestadores de serviço)
CREATE TABLE public.providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  services TEXT[] DEFAULT '{}',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city TEXT,
  state TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view providers" ON public.providers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage providers" ON public.providers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- Service types enum
CREATE TYPE public.service_type AS ENUM ('tow_light', 'tow_heavy', 'tow_motorcycle', 'locksmith', 'tire_change', 'battery', 'fuel', 'lodging', 'other');

-- Event types enum
CREATE TYPE public.event_type AS ENUM ('mechanical_failure', 'accident', 'theft', 'flat_tire', 'locked_out', 'battery_dead', 'fuel_empty', 'other');

-- Service request status
CREATE TYPE public.request_status AS ENUM ('open', 'awaiting_dispatch', 'dispatched', 'in_progress', 'completed', 'cancelled', 'refunded');

-- Dispatch status
CREATE TYPE public.dispatch_status AS ENUM ('pending', 'sent', 'accepted', 'rejected', 'expired', 'cancelled', 'completed');

-- Service Requests (atendimentos)
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT UNIQUE NOT NULL,
  beneficiary_id UUID REFERENCES public.beneficiaries(id),
  client_id UUID REFERENCES public.clients(id),
  plan_id UUID REFERENCES public.plans(id),
  operator_id UUID REFERENCES auth.users(id),
  
  -- Requester info
  requester_name TEXT NOT NULL,
  requester_phone TEXT NOT NULL,
  requester_email TEXT,
  requester_phone_secondary TEXT,

  -- Service details
  service_type service_type NOT NULL DEFAULT 'tow_light',
  event_type event_type NOT NULL DEFAULT 'other',
  
  -- Vehicle info (denormalized for quick access)
  vehicle_plate TEXT,
  vehicle_model TEXT,
  vehicle_year INT,
  vehicle_lowered BOOLEAN DEFAULT false,
  difficult_access BOOLEAN DEFAULT false,

  -- Addresses
  origin_address TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_address TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  estimated_km DOUBLE PRECISION,

  -- Financial
  provider_cost NUMERIC(10,2) DEFAULT 0,
  charged_amount NUMERIC(10,2) DEFAULT 0,
  
  -- Status
  status request_status NOT NULL DEFAULT 'open',
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view service_requests" ON public.service_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators can manage service_requests" ON public.service_requests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Operators can update service_requests" ON public.service_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- Auto-generate protocol
CREATE OR REPLACE FUNCTION public.generate_protocol()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.protocol := 'ATD' || TO_CHAR(NOW(), 'YYYYMMDD') || '/' || LPAD(NEXTVAL('protocol_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;
CREATE SEQUENCE IF NOT EXISTS public.protocol_seq START 1;
CREATE TRIGGER set_protocol BEFORE INSERT ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.generate_protocol();

-- Dispatches (acionamentos)
CREATE TABLE public.dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID REFERENCES public.service_requests(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id),
  status dispatch_status NOT NULL DEFAULT 'pending',
  quoted_amount NUMERIC(10,2),
  final_amount NUMERIC(10,2),
  estimated_arrival_min INT,
  distance_km DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view dispatches" ON public.dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operators can manage dispatches" ON public.dispatches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "Operators can update dispatches" ON public.dispatches FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'));

-- Enable realtime for service_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatches;

-- Updated at triggers
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_beneficiaries_updated_at BEFORE UPDATE ON public.beneficiaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dispatches_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
