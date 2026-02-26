
-- FIX: provider_tracking INSERT - restrict to dispatch with provider_token
DROP POLICY IF EXISTS "Anyone can insert tracking via edge function" ON public.provider_tracking;

CREATE POLICY "Insert tracking via valid dispatch"
  ON public.provider_tracking FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      WHERE d.id = provider_tracking.dispatch_id
      AND d.provider_token IS NOT NULL
    )
  );
