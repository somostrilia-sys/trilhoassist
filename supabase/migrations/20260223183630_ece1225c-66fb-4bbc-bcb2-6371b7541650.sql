
-- Super admin can manage ALL conversations across all tenants
CREATE POLICY "Super admins can manage all conversations"
ON public.whatsapp_conversations
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Super admin can manage ALL messages across all tenants
CREATE POLICY "Super admins can manage all messages"
ON public.whatsapp_messages
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Super admin can manage ALL conversation notes
CREATE POLICY "Super admins can manage all notes"
ON public.whatsapp_conversation_notes
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Drop existing broad operator policies and replace with restricted ones
DROP POLICY IF EXISTS "Operators can manage conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Users can view conversations in their tenant" ON public.whatsapp_conversations;

-- Admins can manage all conversations in their tenant
CREATE POLICY "Admins can manage conversations in their tenant"
ON public.whatsapp_conversations
FOR ALL
USING (
  has_role(auth.uid(), 'admin') 
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Operators can only view conversations assigned to them
CREATE POLICY "Operators can view own conversations"
ON public.whatsapp_conversations
FOR SELECT
USING (
  has_role(auth.uid(), 'operator') 
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  AND (assigned_to = auth.uid() OR assigned_to IS NULL)
);

-- Operators can update conversations assigned to them
CREATE POLICY "Operators can update own conversations"
ON public.whatsapp_conversations
FOR UPDATE
USING (
  has_role(auth.uid(), 'operator') 
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  AND (assigned_to = auth.uid() OR assigned_to IS NULL)
);

-- Operators can insert new conversations in their tenant
CREATE POLICY "Operators can insert conversations"
ON public.whatsapp_conversations
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'operator') 
  AND tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
);

-- Update messages policies similarly
DROP POLICY IF EXISTS "Operators can manage messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Users can view messages via conversation" ON public.whatsapp_messages;

-- Admins can manage all messages in their tenant
CREATE POLICY "Admins can manage messages in their tenant"
ON public.whatsapp_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND has_role(auth.uid(), 'admin')
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND has_role(auth.uid(), 'admin')
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Operators can view/manage messages only from their own conversations
CREATE POLICY "Operators can view own messages"
ON public.whatsapp_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND has_role(auth.uid(), 'operator')
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
      AND (c.assigned_to = auth.uid() OR c.assigned_to IS NULL)
  )
);

CREATE POLICY "Operators can insert own messages"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM whatsapp_conversations c
    WHERE c.id = whatsapp_messages.conversation_id
      AND has_role(auth.uid(), 'operator')
      AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
      AND (c.assigned_to = auth.uid() OR c.assigned_to IS NULL)
  )
);
