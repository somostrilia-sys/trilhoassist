-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Update the trigger function to use the extensions schema
CREATE OR REPLACE FUNCTION public.generate_collision_share_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.service_type = 'collision' AND NEW.share_token IS NULL THEN
    NEW.share_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;