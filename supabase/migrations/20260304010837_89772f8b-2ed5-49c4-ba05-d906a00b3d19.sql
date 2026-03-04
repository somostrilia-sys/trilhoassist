
-- 1. Fix check_beneficiary_usage to also exclude 'deleted' status and the current request
CREATE OR REPLACE FUNCTION public.check_beneficiary_usage(_beneficiary_id uuid, _service_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan_id uuid;
  _coverage record;
  _usage_count int;
  _period_start timestamp with time zone;
  _has_exception boolean;
  _result jsonb;
BEGIN
  SELECT plan_id INTO _plan_id FROM beneficiaries WHERE id = _beneficiary_id;
  
  IF _plan_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_plan', 'usage', 0, 'limit', 0);
  END IF;

  SELECT * INTO _coverage FROM plan_coverages
  WHERE plan_id = _plan_id AND service_type = _service_type AND active = true
  LIMIT 1;

  IF _coverage IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'service_not_covered', 'usage', 0, 'limit', 0);
  END IF;

  IF _coverage.period_type = 'calendar_month' THEN
    _period_start := date_trunc('month', now());
  ELSIF _coverage.period_days IS NOT NULL THEN
    _period_start := now() - (_coverage.period_days || ' days')::interval;
  ELSE
    _period_start := now() - interval '30 days';
  END IF;

  -- Count only completed and in_progress requests, exclude cancelled/refunded
  SELECT COUNT(*) INTO _usage_count
  FROM service_requests
  WHERE beneficiary_id = _beneficiary_id
    AND service_type = _service_type::service_type
    AND status IN ('completed', 'in_progress', 'dispatched', 'awaiting_dispatch')
    AND created_at >= _period_start;

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
$function$;

-- 2. Fix RLS on plan_usage_exceptions to allow super_admin
DROP POLICY IF EXISTS "Operators can manage exceptions in their tenant" ON public.plan_usage_exceptions;

CREATE POLICY "Operators and super_admins can manage exceptions"
ON public.plan_usage_exceptions FOR ALL
USING (
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND (EXISTS (
      SELECT 1 FROM beneficiaries b JOIN clients c ON c.id = b.client_id
      WHERE b.id = plan_usage_exceptions.beneficiary_id
        AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )))
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
    AND (EXISTS (
      SELECT 1 FROM beneficiaries b JOIN clients c ON c.id = b.client_id
      WHERE b.id = plan_usage_exceptions.beneficiary_id
        AND c.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
    )))
  OR is_super_admin(auth.uid())
);
