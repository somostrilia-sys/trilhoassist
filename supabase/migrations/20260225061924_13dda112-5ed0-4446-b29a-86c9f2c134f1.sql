
-- Allow anonymous users to read dispatches by provider_token
CREATE POLICY "Public can view dispatches by provider_token"
ON public.dispatches FOR SELECT
TO anon
USING (provider_token IS NOT NULL);

-- Allow anonymous users to update dispatches by provider_token (accept/reject/complete)
CREATE POLICY "Provider can update dispatch by token"
ON public.dispatches FOR UPDATE
TO anon
USING (provider_token IS NOT NULL)
WITH CHECK (provider_token IS NOT NULL);

-- Allow anonymous users to read service_requests linked to a dispatch with provider_token
CREATE POLICY "Public can view service_requests via dispatch"
ON public.service_requests FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.dispatches d
    WHERE d.service_request_id = service_requests.id
      AND d.provider_token IS NOT NULL
  )
);

-- Allow anonymous users to update service_requests status via provider tracking
CREATE POLICY "Provider can update service_request via dispatch"
ON public.service_requests FOR UPDATE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.dispatches d
    WHERE d.service_request_id = service_requests.id
      AND d.provider_token IS NOT NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dispatches d
    WHERE d.service_request_id = service_requests.id
      AND d.provider_token IS NOT NULL
  )
);
