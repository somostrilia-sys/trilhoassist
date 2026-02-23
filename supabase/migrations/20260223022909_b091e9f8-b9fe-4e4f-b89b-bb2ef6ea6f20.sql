
-- Quick replies per tenant
CREATE TABLE public.whatsapp_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  category text DEFAULT 'geral',
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quick replies in their tenant"
ON public.whatsapp_quick_replies FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Admins can manage quick replies"
ON public.whatsapp_quick_replies FOR ALL
USING (has_role(auth.uid(), 'admin') AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'admin') AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Internal notes on conversations
CREATE TABLE public.whatsapp_conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can manage notes"
ON public.whatsapp_conversation_notes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_notes.conversation_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_conversation_notes.conversation_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Tags/labels for conversations
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal';
