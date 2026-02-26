
-- Create security definer function to check if a service_request is a valid collision with share_token
CREATE OR REPLACE FUNCTION public.is_collision_with_share_token(_service_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE id = _service_request_id
    AND share_token IS NOT NULL
    AND service_type = 'collision'
  )
$$;

-- Drop old anon policies that use subqueries (which fail because anon can't read service_requests)
DROP POLICY IF EXISTS "Public can insert collision media via share token" ON public.collision_media;
DROP POLICY IF EXISTS "Public can view collision media via share token" ON public.collision_media;
DROP POLICY IF EXISTS "Public can delete collision media via share token" ON public.collision_media;

-- Recreate with security definer function
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
