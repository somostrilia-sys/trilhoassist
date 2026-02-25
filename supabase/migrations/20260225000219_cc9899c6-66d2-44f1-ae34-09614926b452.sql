
-- Add UazapiGO columns to tenants (reuse evolution columns conceptually, add new ones)
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS uazapi_server_url text,
  ADD COLUMN IF NOT EXISTS uazapi_admin_token text;

-- Add instance_token to zapi_instances for UazapiGO per-instance auth
ALTER TABLE public.zapi_instances
  ADD COLUMN IF NOT EXISTS instance_token text;
