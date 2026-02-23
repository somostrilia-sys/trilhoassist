
-- Create NPS responses table
CREATE TABLE public.nps_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  beneficiary_token TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one response per token
ALTER TABLE public.nps_responses ADD CONSTRAINT nps_responses_token_unique UNIQUE (beneficiary_token);

-- Enable RLS
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

-- Admins/operators can view NPS in their tenant
CREATE POLICY "Users can view NPS in their tenant"
ON public.nps_responses
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- No direct insert/update/delete from client — handled via edge function with service role
