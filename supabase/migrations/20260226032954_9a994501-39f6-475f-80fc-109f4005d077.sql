
-- Allow anonymous users to INSERT collision_media when the service_request has a valid share_token
CREATE POLICY "Public can insert collision media via share token"
ON public.collision_media
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND sr.share_token IS NOT NULL
    AND sr.service_type = 'collision'
  )
);

-- Allow anonymous users to SELECT collision_media via share_token
CREATE POLICY "Public can view collision media via share token"
ON public.collision_media
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND sr.share_token IS NOT NULL
    AND sr.service_type = 'collision'
  )
);

-- Allow anonymous users to DELETE their own uploaded collision media via share_token
CREATE POLICY "Public can delete collision media via share token"
ON public.collision_media
FOR DELETE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = collision_media.service_request_id
    AND sr.share_token IS NOT NULL
    AND sr.service_type = 'collision'
  )
);

-- Storage: allow anonymous uploads to collision-media bucket
CREATE POLICY "Public can upload to collision-media bucket"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'collision-media');

-- Storage: allow anonymous to read from collision-media bucket
CREATE POLICY "Public can read collision-media bucket"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'collision-media');

-- Storage: allow anonymous to delete from collision-media bucket
CREATE POLICY "Public can delete from collision-media bucket"
ON storage.objects
FOR DELETE
TO anon
USING (bucket_id = 'collision-media');
