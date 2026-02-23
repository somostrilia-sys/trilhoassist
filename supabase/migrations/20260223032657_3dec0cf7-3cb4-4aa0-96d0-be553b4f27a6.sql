-- Add custom_labels jsonb column to tenants for nomenclature customization
ALTER TABLE public.tenants
ADD COLUMN custom_labels jsonb DEFAULT '{}'::jsonb;

-- Add notification_settings jsonb column to tenants
ALTER TABLE public.tenants
ADD COLUMN notification_settings jsonb DEFAULT '{}'::jsonb;

-- Allow admins in tenant to update their own tenant
CREATE POLICY "Admins can update their tenant"
ON public.tenants
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND id IN (SELECT get_user_tenant_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND id IN (SELECT get_user_tenant_ids(auth.uid()))
);