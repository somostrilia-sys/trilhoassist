
-- Remove overly permissive SELECT policy and keep only the operator ALL policy
DROP POLICY "Authenticated can view exceptions" ON public.plan_usage_exceptions;
