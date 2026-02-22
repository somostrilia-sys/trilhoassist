
CREATE OR REPLACE FUNCTION public.check_provider_not_blacklisted()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.provider_blacklist
    WHERE provider_id = NEW.provider_id
      AND active = true
  ) THEN
    RAISE EXCEPTION 'Prestador está na blacklist e não pode receber despachos.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_blacklist_before_dispatch
  BEFORE INSERT OR UPDATE ON public.dispatches
  FOR EACH ROW
  WHEN (NEW.provider_id IS NOT NULL)
  EXECUTE FUNCTION public.check_provider_not_blacklisted();
