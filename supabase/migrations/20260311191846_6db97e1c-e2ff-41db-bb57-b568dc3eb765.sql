
CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiaries_plate_client 
ON beneficiaries (vehicle_plate, client_id) 
WHERE vehicle_plate != '' AND vehicle_plate IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiaries_cpf_client 
ON beneficiaries (cpf, client_id) 
WHERE (vehicle_plate = '' OR vehicle_plate IS NULL) AND cpf IS NOT NULL AND cpf != '';
