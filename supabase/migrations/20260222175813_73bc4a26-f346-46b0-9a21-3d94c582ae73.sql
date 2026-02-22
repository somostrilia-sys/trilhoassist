
-- Add cooperativa field to beneficiaries
ALTER TABLE public.beneficiaries ADD COLUMN cooperativa text;

-- Create plan_coverages table for detailed service rules per plan
CREATE TABLE public.plan_coverages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  service_type text NOT NULL, -- matches service_type enum values
  max_uses integer NOT NULL DEFAULT 1,
  period_type text NOT NULL DEFAULT 'days' CHECK (period_type IN ('days', 'calendar_month')),
  period_days integer, -- null when period_type = 'calendar_month'
  max_km integer, -- for tow services
  lodging_max_value numeric, -- max R$ for lodging
  lodging_per text CHECK (lodging_per IN ('person', 'vehicle')), -- for lodging
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(plan_id, service_type)
);

ALTER TABLE public.plan_coverages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view plan_coverages"
  ON public.plan_coverages FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage plan_coverages"
  ON public.plan_coverages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_plan_coverages_updated_at
  BEFORE UPDATE ON public.plan_coverages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
