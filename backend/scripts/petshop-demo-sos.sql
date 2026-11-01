-- Massa demonstrativa idempotente para avaliação do módulo Pet Care na loja S.O.S.
-- Não apaga nem substitui dados existentes: inclui somente registros ausentes.
USE `s_o_s`;

START TRANSACTION;
SET @now = UTC_TIMESTAMP(3);
SET @local_day = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-03:00'));

-- Categorias e produtos de balcão
INSERT INTO categories (id, name, createdAt, updatedAt)
SELECT UUID(), 'Alimentação', @now, @now WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Alimentação');
INSERT INTO categories (id, name, createdAt, updatedAt)
SELECT UUID(), 'Higiene e Cuidados', @now, @now WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Higiene e Cuidados');
INSERT INTO categories (id, name, createdAt, updatedAt)
SELECT UUID(), 'Acessórios', @now, @now WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Acessórios');

SET @cat_food = (SELECT id FROM categories WHERE name = 'Alimentação' LIMIT 1);
SET @cat_care = (SELECT id FROM categories WHERE name = 'Higiene e Cuidados' LIMIT 1);
SET @cat_accessories = (SELECT id FROM categories WHERE name = 'Acessórios' LIMIT 1);

INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_food, 'Ração Premium Cães Adultos 15 kg', 'PET001', 'UN', 1, 168.00, 229.90, 8, 3, 18, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET001');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_food, 'Ração Premium Gatos 10 kg', 'PET002', 'UN', 1, 145.00, 199.90, 4, 3, 11, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET002');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_food, 'Sachê Frango 85 g', 'PET003', 'UN', 1, 2.10, 4.50, 36, 12, 42, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET003');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_food, 'Bifinho Petisco 500 g', 'PET004', 'UN', 1, 14.00, 25.90, 3, 5, 16, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET004');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_care, 'Shampoo Neutro 500 ml', 'PET005', 'UN', 1, 12.50, 24.90, 9, 4, 13, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET005');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_care, 'Condicionador Desembaraçante 500 ml', 'PET006', 'UN', 1, 13.50, 27.90, 0, 3, 9, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET006');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_care, 'Tapete Higiênico 30 unidades', 'PET007', 'PCT', 1, 32.00, 54.90, 7, 5, 21, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET007');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_care, 'Areia Higiênica para Gatos 4 kg', 'PET008', 'UN', 1, 10.00, 19.90, 2, 6, 24, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET008');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_accessories, 'Coleira Ajustável Tamanho M', 'PET009', 'UN', 1, 15.00, 34.90, 6, 3, 8, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET009');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_accessories, 'Guia Reforçada 1,2 m', 'PET010', 'UN', 1, 12.00, 29.90, 0, 3, 6, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET010');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_accessories, 'Brinquedo Mordedor Resistente', 'PET011', 'UN', 1, 8.00, 18.90, 14, 5, 15, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET011');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_accessories, 'Bola Interativa com Guizo', 'PET012', 'UN', 1, 6.00, 14.90, 11, 4, 19, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET012');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_care, 'Escova Removedora de Pelos', 'PET013', 'UN', 1, 18.00, 39.90, 5, 3, 7, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET013');
INSERT INTO products (id, categoryId, name, shortCode, unit, active, priceCost, priceSell, stock, minStock, salesCount, origem, emiteNfce, createdAt, updatedAt)
SELECT UUID(), @cat_accessories, 'Pote Inox Antiderrapante', 'PET014', 'UN', 1, 21.00, 44.90, 4, 3, 10, 0, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM products WHERE shortCode = 'PET014');

-- Equipe demonstrativa
INSERT INTO operators (id, name, pin, jobTitle, active, isManager, createdAt, updatedAt)
SELECT UUID(), 'Camila Rocha', '$2b$10$5cJNjBbvYhGDSIPsSLORje6KDsda5Ie69msPjv1QXFkqU7fODNOaG', 'Banhista', 1, 0, @now, @now WHERE NOT EXISTS (SELECT 1 FROM operators WHERE name = 'Camila Rocha');
INSERT INTO operators (id, name, pin, jobTitle, active, isManager, createdAt, updatedAt)
SELECT UUID(), 'Juliana Alves', '$2b$10$5cJNjBbvYhGDSIPsSLORje6KDsda5Ie69msPjv1QXFkqU7fODNOaG', 'Tosadora', 1, 0, @now, @now WHERE NOT EXISTS (SELECT 1 FROM operators WHERE name = 'Juliana Alves');
SET @camila = (SELECT id FROM operators WHERE name = 'Camila Rocha' LIMIT 1);
SET @juliana = (SELECT id FROM operators WHERE name = 'Juliana Alves' LIMIT 1);

-- Serviços
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Banho Essencial', 'Higienização completa, secagem e finalização.', 60, 65.00, '#0f766e', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Banho Essencial');
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Banho e Tosa Higiênica', 'Banho, corte higiênico, unhas e limpeza dos ouvidos.', 90, 95.00, '#2563eb', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Banho e Tosa Higiênica');
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Tosa Completa', 'Tosa personalizada conforme raça e preferência do tutor.', 90, 120.00, '#7c3aed', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Tosa Completa');
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Hidratação de Pelagem', 'Tratamento nutritivo para maciez e brilho.', 30, 45.00, '#c2410c', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Hidratação de Pelagem');
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Corte de Unhas', 'Corte cuidadoso e acabamento das unhas.', 20, 20.00, '#475569', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Corte de Unhas');
INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt)
SELECT UUID(), 'Escovação Dental', 'Higiene bucal com produto específico para pets.', 20, 25.00, '#0891b2', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_services WHERE name = 'Escovação Dental');

SET @svc_banho = (SELECT id FROM pet_services WHERE name = 'Banho Essencial' LIMIT 1);
SET @svc_hig = (SELECT id FROM pet_services WHERE name = 'Banho e Tosa Higiênica' LIMIT 1);
SET @svc_tosa = (SELECT id FROM pet_services WHERE name = 'Tosa Completa' LIMIT 1);
SET @svc_hidra = (SELECT id FROM pet_services WHERE name = 'Hidratação de Pelagem' LIMIT 1);
SET @svc_unhas = (SELECT id FROM pet_services WHERE name = 'Corte de Unhas' LIMIT 1);

-- Tutores
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Mariana Costa', '11987651001', '327.451.890-10', 'Rua das Acácias, 120', 'Próximo à praça', 'mariana.costa@example.com', 'Prefere contato por WhatsApp.', @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651001');
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Rafael Lima', '11987651002', '418.562.901-21', 'Avenida Central, 455', NULL, 'rafael.lima@example.com', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651002');
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Paula Mendes', '11987651003', NULL, 'Rua do Bosque, 78', 'Casa azul', 'paula.mendes@example.com', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651003');
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Bruno Alves', '11987651004', NULL, 'Alameda Santos, 910', NULL, 'bruno.alves@example.com', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651004');
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Carolina Souza', '11987651005', NULL, 'Rua Primavera, 33', NULL, 'carolina.souza@example.com', 'Avisar com 15 minutos de antecedência.', @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651005');
INSERT INTO customers (id, name, phone, cpfCnpj, address, reference, email, notes, createdAt, updatedAt)
SELECT UUID(), 'Diego Martins', '11987651006', NULL, 'Rua das Palmeiras, 240', NULL, 'diego.martins@example.com', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '11987651006');

SET @t1 = (SELECT id FROM customers WHERE phone = '11987651001' LIMIT 1);
SET @t2 = (SELECT id FROM customers WHERE phone = '11987651002' LIMIT 1);
SET @t3 = (SELECT id FROM customers WHERE phone = '11987651003' LIMIT 1);
SET @t4 = (SELECT id FROM customers WHERE phone = '11987651004' LIMIT 1);
SET @t5 = (SELECT id FROM customers WHERE phone = '11987651005' LIMIT 1);
SET @t6 = (SELECT id FROM customers WHERE phone = '11987651006' LIMIT 1);

-- Pets e fichas de cuidado
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t1, 'Mel', 'dog', 'Golden Retriever', 'female', '2021-04-12', 'large', 28.5, 'Dourado', 1, 'Sensibilidade a perfumes fortes', 'Dócil, fica ansiosa com secador.', 'Usar shampoo neutro.', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t1 AND name = 'Mel');
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t2, 'Bento', 'dog', 'Shih-tzu', 'male', '2020-08-03', 'small', 6.2, 'Branco e caramelo', 1, NULL, 'Calmo durante o banho.', 'Corte arredondado no rosto.', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t2 AND name = 'Bento');
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t3, 'Nina', 'cat', 'SRD', 'female', '2022-01-20', 'medium', 4.8, 'Cinza', 1, NULL, 'Precisa de manejo silencioso.', NULL, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t3 AND name = 'Nina');
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t4, 'Thor', 'dog', 'Spitz Alemão', 'male', '2023-02-15', 'small', 5.4, 'Creme', 0, NULL, 'Agitado, aceita petiscos como reforço.', NULL, 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t4 AND name = 'Thor');
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t5, 'Luna', 'dog', 'Border Collie', 'female', '2019-11-05', 'medium', 18.9, 'Preto e branco', 1, 'Dermatite atópica', 'Muito dócil.', 'Secagem em temperatura baixa.', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t5 AND name = 'Luna');
INSERT INTO pets (id, customerId, name, species, breed, sex, birthDate, size, weight, color, neutered, allergies, behavior, notes, active, createdAt, updatedAt)
SELECT UUID(), @t6, 'Chico', 'dog', 'Pug', 'male', '2021-06-18', 'small', 9.1, 'Fulvo', 1, NULL, 'Sensível ao calor e ao esforço.', 'Pausas durante a secagem.', 1, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pets WHERE customerId = @t6 AND name = 'Chico');

SET @p1 = (SELECT id FROM pets WHERE customerId = @t1 AND name = 'Mel' LIMIT 1);
SET @p2 = (SELECT id FROM pets WHERE customerId = @t2 AND name = 'Bento' LIMIT 1);
SET @p3 = (SELECT id FROM pets WHERE customerId = @t3 AND name = 'Nina' LIMIT 1);
SET @p4 = (SELECT id FROM pets WHERE customerId = @t4 AND name = 'Thor' LIMIT 1);
SET @p5 = (SELECT id FROM pets WHERE customerId = @t5 AND name = 'Luna' LIMIT 1);
SET @p6 = (SELECT id FROM pets WHERE customerId = @t6 AND name = 'Chico' LIMIT 1);

-- Carteira de vacinação
INSERT INTO pet_vaccinations (id, petId, vaccineName, status, appliedAt, nextDueAt, batchNumber, manufacturer, clinic, professional, notes, createdAt, updatedAt)
SELECT UUID(), @p1, 'V10', 'applied', DATE_SUB(@now, INTERVAL 330 DAY), DATE_ADD(@now, INTERVAL 35 DAY), 'V10-2841', 'PetBio', 'Clínica Jardim', 'Dra. Fernanda', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_vaccinations WHERE petId = @p1 AND vaccineName = 'V10');
INSERT INTO pet_vaccinations (id, petId, vaccineName, status, appliedAt, nextDueAt, batchNumber, manufacturer, clinic, professional, notes, createdAt, updatedAt)
SELECT UUID(), @p2, 'Antirrábica', 'overdue', DATE_SUB(@now, INTERVAL 390 DAY), DATE_SUB(@now, INTERVAL 25 DAY), 'RA-9120', 'VetSafe', 'Clínica Animal', 'Dr. Marcelo', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_vaccinations WHERE petId = @p2 AND vaccineName = 'Antirrábica');
INSERT INTO pet_vaccinations (id, petId, vaccineName, status, appliedAt, nextDueAt, batchNumber, manufacturer, clinic, professional, notes, createdAt, updatedAt)
SELECT UUID(), @p5, 'V10', 'applied', DATE_SUB(@now, INTERVAL 345 DAY), DATE_ADD(@now, INTERVAL 18 DAY), 'V10-7732', 'PetBio', 'Clínica Central', 'Dra. Luiza', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_vaccinations WHERE petId = @p5 AND vaccineName = 'V10');
INSERT INTO pet_vaccinations (id, petId, vaccineName, status, appliedAt, nextDueAt, batchNumber, manufacturer, clinic, professional, notes, createdAt, updatedAt)
SELECT UUID(), @p6, 'Gripe Canina', 'applied', DATE_SUB(@now, INTERVAL 340 DAY), DATE_ADD(@now, INTERVAL 25 DAY), 'GC-4438', 'VetSafe', 'Clínica Central', 'Dra. Luiza', NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_vaccinations WHERE petId = @p6 AND vaccineName = 'Gripe Canina');

-- Agenda do dia (horários gravados em UTC, exibidos em America/Sao_Paulo)
SET @a1_start = CONVERT_TZ(CONCAT(@local_day, ' 09:00:00'), '-03:00', '+00:00');
SET @a2_start = CONVERT_TZ(CONCAT(@local_day, ' 10:15:00'), '-03:00', '+00:00');
SET @a3_start = CONVERT_TZ(CONCAT(@local_day, ' 11:30:00'), '-03:00', '+00:00');
SET @a4_start = CONVERT_TZ(CONCAT(@local_day, ' 13:00:00'), '-03:00', '+00:00');
SET @a5_start = CONVERT_TZ(CONCAT(@local_day, ' 14:30:00'), '-03:00', '+00:00');
SET @a6_start = CONVERT_TZ(CONCAT(@local_day, ' 15:45:00'), '-03:00', '+00:00');

INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t1, @p1, @camila, @a1_start, DATE_ADD(@a1_start, INTERVAL 90 MINUTE), 'ready', 'internal', 'Tutor pediu laço azul.', DATE_ADD(@a1_start, INTERVAL 5 MINUTE), NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p1 AND startsAt = @a1_start);
INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t2, @p2, @juliana, @a2_start, DATE_ADD(@a2_start, INTERVAL 90 MINUTE), 'bathing', 'internal', 'Manter corte arredondado.', DATE_ADD(@a2_start, INTERVAL 3 MINUTE), NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p2 AND startsAt = @a2_start);
INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t3, @p3, NULL, @a3_start, DATE_ADD(@a3_start, INTERVAL 60 MINUTE), 'requested', 'client_portal', 'Solicitação recebida pela área do cliente.', NULL, NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p3 AND startsAt = @a3_start);
INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t4, @p4, @juliana, @a4_start, DATE_ADD(@a4_start, INTERVAL 90 MINUTE), 'scheduled', 'internal', NULL, NULL, NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p4 AND startsAt = @a4_start);
INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t5, @p5, @camila, @a5_start, DATE_ADD(@a5_start, INTERVAL 90 MINUTE), 'checked_in', 'internal', 'Usar secagem em temperatura baixa.', @a5_start, NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p5 AND startsAt = @a5_start);
INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, notes, checkedInAt, completedAt, createdAt, updatedAt)
SELECT UUID(), @t6, @p6, @camila, @a6_start, DATE_ADD(@a6_start, INTERVAL 60 MINUTE), 'finishing', 'internal', 'Fazer pausas durante a secagem.', DATE_ADD(@a6_start, INTERVAL 2 MINUTE), NULL, @now, @now WHERE NOT EXISTS (SELECT 1 FROM pet_appointments WHERE petId = @p6 AND startsAt = @a6_start);

SET @a1 = (SELECT id FROM pet_appointments WHERE petId = @p1 AND startsAt = @a1_start LIMIT 1);
SET @a2 = (SELECT id FROM pet_appointments WHERE petId = @p2 AND startsAt = @a2_start LIMIT 1);
SET @a3 = (SELECT id FROM pet_appointments WHERE petId = @p3 AND startsAt = @a3_start LIMIT 1);
SET @a4 = (SELECT id FROM pet_appointments WHERE petId = @p4 AND startsAt = @a4_start LIMIT 1);
SET @a5 = (SELECT id FROM pet_appointments WHERE petId = @p5 AND startsAt = @a5_start LIMIT 1);
SET @a6 = (SELECT id FROM pet_appointments WHERE petId = @p6 AND startsAt = @a6_start LIMIT 1);

INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a1, @svc_hig, 'Banho e Tosa Higiênica', 95.00, 90 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a1 AND serviceId = @svc_hig);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a2, @svc_hig, 'Banho e Tosa Higiênica', 95.00, 90 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a2 AND serviceId = @svc_hig);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a3, @svc_banho, 'Banho Essencial', 65.00, 60 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a3 AND serviceId = @svc_banho);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a4, @svc_tosa, 'Tosa Completa', 120.00, 90 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a4 AND serviceId = @svc_tosa);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a5, @svc_hidra, 'Hidratação de Pelagem', 45.00, 30 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a5 AND serviceId = @svc_hidra);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a5, @svc_banho, 'Banho Essencial', 65.00, 60 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a5 AND serviceId = @svc_banho);
INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes)
SELECT UUID(), @a6, @svc_banho, 'Banho Essencial', 65.00, 60 WHERE NOT EXISTS (SELECT 1 FROM pet_appointment_services WHERE appointmentId = @a6 AND serviceId = @svc_banho);

COMMIT;

SELECT
  (SELECT COUNT(*) FROM customers) AS tutors,
  (SELECT COUNT(*) FROM pets) AS pets,
  (SELECT COUNT(*) FROM pet_services) AS services,
  (SELECT COUNT(*) FROM pet_appointments WHERE DATE(CONVERT_TZ(startsAt, '+00:00', '-03:00')) = @local_day) AS appointments_today,
  (SELECT COUNT(*) FROM products) AS products;
