
-- Table for manual usage exceptions by operators
CREATE TABLE public.plan_usage_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id uuid NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  justification text NOT NULL,
  granted_by uuid NOT NULL,
  used_at timestamp with time zone,
  service_request_id uuid REFERENCES public.service_requests(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_usage_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can manage exceptions"
ON public.plan_usage_exceptions
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'));

CREATE POLICY "Authenticated can view exceptions"
ON public.plan_usage_exceptions
FOR SELECT
USING (true);

-- Function to check beneficiary usage against plan limits
CREATE OR REPLACE FUNCTION public.check_beneficiary_usage(
  _beneficiary_id uuid,
  _service_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_id uuid;
  _coverage record;
  _usage_count int;
  _period_start timestamp with time zone;
  _has_exception boolean;
  _result jsonb;
BEGIN
  -- Get beneficiary's plan
  SELECT plan_id INTO _plan_id FROM beneficiaries WHERE id = _beneficiary_id;
  
  IF _plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_plan', 'usage', 0, 'limit', 0);
  END IF;

  -- Get coverage rule for this service type
  SELECT * INTO _coverage FROM plan_coverages
  WHERE plan_id = _plan_id AND service_type = _service_type AND active = true
  LIMIT 1;

  IF _coverage IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'service_not_covered', 'usage', 0, 'limit', 0);
  END IF;

  -- Calculate period start
  IF _coverage.period_type = 'calendar_month' THEN
    _period_start := date_trunc('month', now());
  ELSIF _coverage.period_days IS NOT NULL THEN
    _period_start := now() - (_coverage.period_days || ' days')::interval;
  ELSE
    _period_start := now() - interval '30 days';
  END IF;

  -- Count usage in period
  SELECT COUNT(*) INTO _usage_count
  FROM service_requests
  WHERE beneficiary_id = _beneficiary_id
    AND service_type = _service_type::service_type
    AND status NOT IN ('cancelled', 'refunded')
    AND created_at >= _period_start;

  -- Check for unused exception
  SELECT EXISTS(
    SELECT 1 FROM plan_usage_exceptions
    WHERE beneficiary_id = _beneficiary_id
      AND service_type = _service_type
      AND used_at IS NULL
  ) INTO _has_exception;

  IF _usage_count >= _coverage.max_uses AND NOT _has_exception THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'usage', _usage_count,
      'limit', _coverage.max_uses,
      'period_type', _coverage.period_type,
      'period_days', COALESCE(_coverage.period_days, 30),
      'has_exception', false
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', CASE WHEN _has_exception AND _usage_count >= _coverage.max_uses THEN 'exception_granted' ELSE 'within_limit' END,
    'usage', _usage_count,
    'limit', _coverage.max_uses,
    'period_type', _coverage.period_type,
    'period_days', COALESCE(_coverage.period_days, 30),
    'has_exception', _has_exception
  );
END;
$$;
