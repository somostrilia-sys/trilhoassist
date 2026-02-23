
-- Add assigned_to column for agent distribution
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_to ON public.whatsapp_conversations(assigned_to);
