
-- Drop restrictive public policies
DROP POLICY IF EXISTS "Public can insert collision media via share token" ON public.collision_media;
DROP POLICY IF EXISTS "Public can view collision media via share token" ON public.collision_media;
DROP POLICY IF EXISTS "Public can delete collision media via share token" ON public.collision_media;

-- Recreate as PERMISSIVE (default) so anon only needs ONE policy to pass
CREATE POLICY "Public can insert collision media via share token"
ON public.collision_media
FOR INSERT
TO anon
WITH CHECK (public.is_collision_with_share_token(service_request_id));

CREATE POLICY "Public can view collision media via share token"
ON public.collision_media
FOR SELECT
TO anon
USING (public.is_collision_with_share_token(service_request_id));

CREATE POLICY "Public can delete collision media via share token"
ON public.collision_media
FOR DELETE
TO anon
USING (public.is_collision_with_share_token(service_request_id));
