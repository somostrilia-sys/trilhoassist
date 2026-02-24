
-- Add api_type column to zapi_instances to support both Z-API and Evolution API
ALTER TABLE public.zapi_instances 
ADD COLUMN IF NOT EXISTS api_type text NOT NULL DEFAULT 'zapi';

-- Add evolution-specific columns
ALTER TABLE public.zapi_instances 
ADD COLUMN IF NOT EXISTS evolution_instance_name text,
ADD COLUMN IF NOT EXISTS evolution_instance_id text,
ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'disconnected';

-- Comment for clarity
COMMENT ON COLUMN public.zapi_instances.api_type IS 'Type of WhatsApp API: zapi or evolution';
COMMENT ON COLUMN public.zapi_instances.evolution_instance_name IS 'Instance name in Evolution API';
COMMENT ON COLUMN public.zapi_instances.evolution_instance_id IS 'Instance ID returned by Evolution API';
COMMENT ON COLUMN public.zapi_instances.connection_status IS 'Current connection status: connected, disconnected, connecting';
