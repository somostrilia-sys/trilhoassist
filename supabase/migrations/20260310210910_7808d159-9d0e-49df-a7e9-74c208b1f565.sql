
-- Create client_representatives table
CREATE TABLE public.client_representatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_representatives ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view representatives in their tenant
CREATE POLICY "Users can view representatives in their tenant"
ON public.client_representatives
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_representatives.client_id
    AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
  OR is_super_admin(auth.uid())
);

-- RLS: Admins/operators can manage representatives
CREATE POLICY "Admins can manage representatives"
ON public.client_representatives
FOR ALL
TO public
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_representatives.client_id
    AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_representatives.client_id
    AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Add requested_by field to service_requests for tracking who requested
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS requested_by_representative_id UUID REFERENCES public.client_representatives(id);
