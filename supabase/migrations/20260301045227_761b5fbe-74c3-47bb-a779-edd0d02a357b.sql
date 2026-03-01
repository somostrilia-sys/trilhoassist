
-- Step 1: Delete duplicate beneficiaries (same vehicle_plate + client_id), keeping the most recent one
DELETE FROM public.beneficiaries
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY client_id, vehicle_plate
        ORDER BY updated_at DESC, created_at DESC
      ) AS rn
    FROM public.beneficiaries
    WHERE vehicle_plate IS NOT NULL AND vehicle_plate != ''
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX idx_beneficiaries_client_plate_unique
ON public.beneficiaries (client_id, vehicle_plate)
WHERE vehicle_plate IS NOT NULL AND vehicle_plate != '';
