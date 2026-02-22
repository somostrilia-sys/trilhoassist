-- Allow admins and operators to view all profiles (needed for event timeline)
CREATE POLICY "Admins and operators can view all profiles"
ON public.profiles
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role)
);