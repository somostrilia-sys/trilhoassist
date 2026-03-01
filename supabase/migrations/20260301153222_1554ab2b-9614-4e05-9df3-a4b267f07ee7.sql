
-- Remove existing coverages for all plans of client Objetivo Auto
DELETE FROM plan_coverages
WHERE plan_id IN (
  SELECT id FROM plans WHERE client_id = 'cb50f118-97dd-4762-bdf6-8f9d0d98145c'
);

-- Insert coverages for all active plans: 1 use per service type every 30 days
-- Service types: tow_light, tow_heavy, tow_motorcycle, locksmith, tire_change, battery, fuel, lodging, other
INSERT INTO plan_coverages (plan_id, service_type, max_uses, period_type, period_days, max_km, lodging_max_value, lodging_per)
SELECT 
  p.id,
  st.service_type,
  1,
  'days',
  30,
  NULL,
  CASE WHEN st.service_type = 'lodging' THEN 150 ELSE NULL END,
  CASE WHEN st.service_type = 'lodging' THEN 'vehicle' ELSE NULL END
FROM plans p
CROSS JOIN (
  VALUES 
    ('tow_light'),
    ('tow_heavy'),
    ('tow_motorcycle'),
    ('locksmith'),
    ('tire_change'),
    ('battery'),
    ('fuel'),
    ('lodging'),
    ('other')
) AS st(service_type)
WHERE p.client_id = 'cb50f118-97dd-4762-bdf6-8f9d0d98145c'
  AND p.active = true;
