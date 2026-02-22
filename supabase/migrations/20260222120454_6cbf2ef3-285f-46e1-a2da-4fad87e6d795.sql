
-- Add user_id and tenant_id to providers
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- Add address fields
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS zip_code text;

-- Add bank/fiscal fields
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS bank_agency text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS pix_key text;

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_providers_user_id ON public.providers(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON public.providers(tenant_id);

-- Update RLS: providers can view their own record
CREATE POLICY "Providers can view own record"
ON public.providers FOR SELECT
USING (auth.uid() = user_id);

-- Providers can update their own record
CREATE POLICY "Providers can update own record"
ON public.providers FOR UPDATE
USING (auth.uid() = user_id);
