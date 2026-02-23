
-- Add WhatsApp group configuration to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_group_id text,
  ADD COLUMN IF NOT EXISTS km_margin integer DEFAULT 10;

COMMENT ON COLUMN public.clients.whatsapp_group_id IS 'WhatsApp group JID for automatic label sending';
COMMENT ON COLUMN public.clients.km_margin IS 'Fixed KM margin to add to estimated distance';
