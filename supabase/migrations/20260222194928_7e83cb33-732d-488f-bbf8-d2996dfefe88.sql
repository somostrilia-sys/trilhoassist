
-- Conversations table: one per WhatsApp phone number
CREATE TABLE public.whatsapp_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  phone TEXT NOT NULL,
  contact_name TEXT,
  beneficiary_id UUID REFERENCES public.beneficiaries(id),
  status TEXT NOT NULL DEFAULT 'open', -- open, pending_service, service_created, closed
  service_request_id UUID REFERENCES public.service_requests(id),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound', -- inbound, outbound
  message_type TEXT NOT NULL DEFAULT 'text', -- text, image, audio, video, document, location
  content TEXT,
  media_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  external_id TEXT, -- ID from WhatsApp provider
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whatsapp_conversations_tenant ON public.whatsapp_conversations(tenant_id);
CREATE INDEX idx_whatsapp_conversations_phone ON public.whatsapp_conversations(phone);
CREATE INDEX idx_whatsapp_conversations_status ON public.whatsapp_conversations(status);
CREATE INDEX idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);

-- RLS
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: users in tenant can view, admins/operators can manage
CREATE POLICY "Users can view conversations in their tenant"
ON public.whatsapp_conversations FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

CREATE POLICY "Operators can manage conversations"
ON public.whatsapp_conversations FOR ALL
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Messages: accessible via conversation tenant
CREATE POLICY "Users can view messages via conversation"
ON public.whatsapp_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.whatsapp_conversations c
  WHERE c.id = whatsapp_messages.conversation_id
  AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

CREATE POLICY "Operators can manage messages"
ON public.whatsapp_messages FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.whatsapp_conversations c
  WHERE c.id = whatsapp_messages.conversation_id
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.whatsapp_conversations c
  WHERE c.id = whatsapp_messages.conversation_id
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
  AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;

-- Updated_at trigger
CREATE TRIGGER update_whatsapp_conversations_updated_at
BEFORE UPDATE ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
