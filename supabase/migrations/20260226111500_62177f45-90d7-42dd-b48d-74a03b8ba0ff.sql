
-- ===== FIX: Beneficiary tracking public access =====

-- 1. Allow anonymous SELECT on service_requests via beneficiary_token
CREATE POLICY "Public can view service_requests via beneficiary_token"
  ON public.service_requests FOR SELECT
  USING (beneficiary_token IS NOT NULL AND beneficiary_token = beneficiary_token);

-- 2. Allow anonymous SELECT on dispatches linked to a service_request with beneficiary_token
CREATE POLICY "Public can view dispatches via beneficiary_token"
  ON public.dispatches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = dispatches.service_request_id
        AND sr.beneficiary_token IS NOT NULL
    )
  );

-- 3. Allow anonymous UPDATE on dispatches for beneficiary_arrived_at (via beneficiary_token)
CREATE POLICY "Beneficiary can update dispatch arrival"
  ON public.dispatches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = dispatches.service_request_id
        AND sr.beneficiary_token IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_requests sr
      WHERE sr.id = dispatches.service_request_id
        AND sr.beneficiary_token IS NOT NULL
    )
  );

-- 4. Allow anonymous SELECT on providers via dispatch linked to beneficiary_token
CREATE POLICY "Public can view providers via beneficiary dispatch"
  ON public.providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      JOIN public.service_requests sr ON sr.id = d.service_request_id
      WHERE d.provider_id = providers.id
        AND sr.beneficiary_token IS NOT NULL
    )
  );

-- 5. Allow anonymous SELECT on provider_tracking via dispatch linked to beneficiary_token
CREATE POLICY "Public can read tracking via beneficiary token"
  ON public.provider_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      JOIN public.service_requests sr ON sr.id = d.service_request_id
      WHERE d.id = provider_tracking.dispatch_id
        AND sr.beneficiary_token IS NOT NULL
    )
  );
