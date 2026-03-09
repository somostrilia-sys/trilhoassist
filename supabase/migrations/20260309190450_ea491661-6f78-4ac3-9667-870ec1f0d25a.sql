-- Insert coverages for all REDCAR plans (1 use per 30 days each)
-- Services: tow_light, battery, return_home, driver_friend, fuel, lodging, locksmith, tire_change
INSERT INTO plan_coverages (plan_id, service_type, max_uses, period_type, period_days, lodging_max_value, lodging_per, lodging_max_total, notes, active)
SELECT p.id, s.service_type, 1, 'days', 30,
  CASE 
    WHEN s.service_type = 'lodging' THEN 80
    WHEN s.service_type = 'return_home' THEN 50
    ELSE NULL
  END,
  CASE 
    WHEN s.service_type IN ('lodging', 'return_home') THEN 'person'
    ELSE NULL
  END,
  NULL,
  CASE 
    WHEN s.service_type = 'return_home' THEN 'Em caso de colisão ou roubo, limite de R$ 500,00'
    ELSE NULL
  END,
  true
FROM plans p
JOIN clients c ON c.id = p.client_id
CROSS JOIN (
  VALUES ('tow_light'::service_type), ('battery'::service_type), ('return_home'::service_type), 
         ('driver_friend'::service_type), ('fuel'::service_type), ('lodging'::service_type), 
         ('locksmith'::service_type), ('tire_change'::service_type)
) AS s(service_type)
WHERE c.id = '3cf405d9-787a-4567-b8e5-cdbe39f182c7' AND p.active = true;

-- Insert coverages for all TRIO plans (1 use per 30 days each)
INSERT INTO plan_coverages (plan_id, service_type, max_uses, period_type, period_days, lodging_max_value, lodging_per, lodging_max_total, notes, active)
SELECT p.id, s.service_type, 1, 'days', 30,
  CASE 
    WHEN s.service_type IN ('lodging', 'return_home') THEN 100
    ELSE NULL
  END,
  CASE 
    WHEN s.service_type IN ('lodging', 'return_home') THEN 'person'
    ELSE NULL
  END,
  CASE 
    WHEN s.service_type IN ('lodging', 'return_home') THEN 500
    ELSE NULL
  END,
  NULL,
  true
FROM plans p
JOIN clients c ON c.id = p.client_id
CROSS JOIN (
  VALUES ('tow_light'::service_type), ('battery'::service_type), ('return_home'::service_type), 
         ('driver_friend'::service_type), ('fuel'::service_type), ('lodging'::service_type), 
         ('locksmith'::service_type), ('tire_change'::service_type)
) AS s(service_type)
WHERE c.id = 'e25c6813-07f7-4421-94d6-1f5496e40ffc' AND p.active = true;