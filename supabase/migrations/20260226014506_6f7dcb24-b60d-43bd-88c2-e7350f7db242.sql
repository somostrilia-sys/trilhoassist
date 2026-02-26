
-- Allow anonymous users to read providers when linked via dispatch (for navigation page)
CREATE POLICY "Public can view providers via dispatch"
ON public.providers FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.dispatches d
    WHERE d.provider_id = providers.id
      AND d.provider_token IS NOT NULL
  )
);
