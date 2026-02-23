
-- Table to store real-time provider location during a dispatch
CREATE TABLE public.provider_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup by dispatch
CREATE INDEX idx_provider_tracking_dispatch ON public.provider_tracking(dispatch_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.provider_tracking ENABLE ROW LEVEL SECURITY;

-- Public insert (from tracking page via edge function)
CREATE POLICY "Anyone can insert tracking via edge function"
ON public.provider_tracking
FOR INSERT
WITH CHECK (true);

-- Public read (for beneficiary tracking page)
CREATE POLICY "Anyone can read tracking data"
ON public.provider_tracking
FOR SELECT
USING (true);

-- Add provider_token to dispatches for the provider tracking link
ALTER TABLE public.dispatches ADD COLUMN IF NOT EXISTS provider_token TEXT;

-- Add beneficiary_token to service_requests for beneficiary tracking link
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS beneficiary_token TEXT;

-- Enable realtime for tracking updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_tracking;
