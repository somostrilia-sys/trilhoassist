
-- Add 'collision' to service_type enum
ALTER TYPE public.service_type ADD VALUE IF NOT EXISTS 'collision';

-- Add share_token to service_requests for public link
ALTER TABLE public.service_requests 
ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE DEFAULT NULL;

-- Create collision_media table for file uploads
CREATE TABLE public.collision_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('photo', 'audio', 'video', 'document')),
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.collision_media ENABLE ROW LEVEL SECURITY;

-- RLS: Operators/admins can manage collision media
CREATE POLICY "Operators can manage collision media"
ON public.collision_media
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator'))
    AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- RLS: Public read access via share_token (handled at app level, but allow select for authenticated)
CREATE POLICY "Users can view collision media in their tenant"
ON public.collision_media
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND sr.tenant_id IN (SELECT get_user_tenant_ids(auth.uid()))
  )
);

-- Create storage bucket for collision media
INSERT INTO storage.buckets (id, name, public) VALUES ('collision-media', 'collision-media', true);

-- Storage policies: authenticated users can upload
CREATE POLICY "Authenticated users can upload collision media"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'collision-media'
  AND auth.role() = 'authenticated'
);

-- Storage policies: anyone can view (public bucket for shared links)
CREATE POLICY "Anyone can view collision media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'collision-media');

-- Storage policies: authenticated users can delete their uploads
CREATE POLICY "Authenticated users can delete collision media"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'collision-media'
  AND auth.role() = 'authenticated'
);

-- Function to generate share token automatically for collision requests
CREATE OR REPLACE FUNCTION public.generate_collision_share_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.service_type = 'collision' AND NEW.share_token IS NULL THEN
    NEW.share_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_collision_share_token
BEFORE INSERT ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.generate_collision_share_token();
