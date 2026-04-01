
CREATE OR REPLACE FUNCTION public.upsert_beneficiary_gia(
  _client_id uuid,
  _name text,
  _cpf text,
  _phone text,
  _active boolean,
  _vehicle_plate text,
  _vehicle_model text,
  _vehicle_year integer,
  _vehicle_chassis text,
  _vehicle_color text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _vehicle_plate IS NOT NULL AND _vehicle_plate <> '' THEN
    -- Upsert by client_id + vehicle_plate
    INSERT INTO public.beneficiaries (client_id, name, cpf, phone, active, vehicle_plate, vehicle_model, vehicle_year, vehicle_chassis, vehicle_color)
    VALUES (_client_id, _name, _cpf, _phone, _active, _vehicle_plate, _vehicle_model, _vehicle_year, _vehicle_chassis, _vehicle_color)
    ON CONFLICT (client_id, vehicle_plate) WHERE vehicle_plate IS NOT NULL AND vehicle_plate <> ''
    DO UPDATE SET
      name = EXCLUDED.name,
      cpf = EXCLUDED.cpf,
      phone = EXCLUDED.phone,
      active = EXCLUDED.active,
      vehicle_model = EXCLUDED.vehicle_model,
      vehicle_year = EXCLUDED.vehicle_year,
      vehicle_chassis = EXCLUDED.vehicle_chassis,
      vehicle_color = EXCLUDED.vehicle_color,
      updated_at = now();
  ELSIF _cpf IS NOT NULL AND _cpf <> '' THEN
    -- Upsert by cpf + client_id
    INSERT INTO public.beneficiaries (client_id, name, cpf, phone, active, vehicle_plate, vehicle_model, vehicle_year, vehicle_chassis, vehicle_color)
    VALUES (_client_id, _name, _cpf, _phone, _active, NULL, _vehicle_model, _vehicle_year, _vehicle_chassis, _vehicle_color)
    ON CONFLICT (cpf, client_id) WHERE (vehicle_plate = '' OR vehicle_plate IS NULL) AND cpf IS NOT NULL AND cpf <> ''
    DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      active = EXCLUDED.active,
      vehicle_model = EXCLUDED.vehicle_model,
      vehicle_year = EXCLUDED.vehicle_year,
      vehicle_chassis = EXCLUDED.vehicle_chassis,
      vehicle_color = EXCLUDED.vehicle_color,
      updated_at = now();
  END IF;
END;
$$;
