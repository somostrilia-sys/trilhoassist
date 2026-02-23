
-- Add followup tracking to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS last_followup_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS followup_count integer NOT NULL DEFAULT 0;

-- Add followup config to tenants
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS followup_timeout_minutes integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS followup_max_retries integer NOT NULL DEFAULT 3;
