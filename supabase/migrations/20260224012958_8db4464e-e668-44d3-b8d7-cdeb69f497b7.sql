
-- Add Z-API columns to tenants table
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS zapi_instance_id text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS zapi_token text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS zapi_security_token text;
