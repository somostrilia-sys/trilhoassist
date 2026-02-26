
-- Create provider_invoices table
CREATE TABLE public.provider_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  status text NOT NULL DEFAULT 'pending',
  observation text,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_invoices ENABLE ROW LEVEL SECURITY;

-- Provider can view/insert their own invoices
CREATE POLICY "Providers can view own invoices"
  ON public.provider_invoices FOR SELECT
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY "Providers can insert own invoices"
  ON public.provider_invoices FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY "Providers can update own pending invoices"
  ON public.provider_invoices FOR UPDATE
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()) AND status = 'pending');

-- Admins/operators can manage all invoices in their tenant
CREATE POLICY "Admins can manage provider invoices in tenant"
  ON public.provider_invoices FOR ALL
  USING (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_invoices.provider_id
      AND p.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  )
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_invoices.provider_id
      AND p.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )
  );

-- Storage bucket for invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('provider-invoices', 'provider-invoices', false);

-- Storage policies
CREATE POLICY "Providers can upload invoices"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'provider-invoices' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view invoices"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'provider-invoices' AND auth.uid() IS NOT NULL);

CREATE POLICY "Providers can delete own invoices"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'provider-invoices' AND auth.uid() IS NOT NULL);
