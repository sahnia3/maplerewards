-- Restore the de-duplicated transfer_partners rows (exact prior values).
INSERT INTO transfer_partners
  (id, from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, effective_to, notes)
VALUES
  ('17fee71f-f1b9-4c66-86e8-480df1933d39','10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000009',0.3333,3000,1000,5,true,'2026-04-05',NULL,'Marriott -> BA Avios 3:1 (5k bonus per 60k transferred)'),
  ('18d04118-2e15-425e-8d7d-efe0bc3d7179','10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000010',0.3333,3000,1000,5,true,'2026-04-05',NULL,'Marriott -> Flying Blue 3:1 (5k bonus per 60k transferred)'),
  ('3b86f828-f819-4d15-b11d-a1c38b15a8a7','10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001',0.3333,3000,1000,5,true,'2026-04-05',NULL,'Marriott -> Aeroplan 3:1 (5k bonus per 60k transferred)'),
  ('56e75879-2c29-457c-8152-37e9a479b4b2','10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000011',0.3333,3000,1000,5,true,'2026-04-05',NULL,'Marriott -> Asia Miles 3:1 (5k bonus per 60k transferred)'),
  ('81cda661-9bcf-45be-bc30-b7eade314766','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000013',1.2000,1000,1000,2,true,'2026-03-09',NULL,'Amex MR → Marriott Bonvoy 1:1.2')
ON CONFLICT (id) DO NOTHING;
