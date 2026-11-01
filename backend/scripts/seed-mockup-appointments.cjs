const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3308,
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || '7bar@2025',
    database: 's_o_s',
  });

  console.log('Connected to s_o_s');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 1. Operators
  const operators = [
    { name: 'Juliana Alves', jobTitle: 'Tosadora' },
    { name: 'Camila Rocha', jobTitle: 'Banhista' },
    { name: 'Dr. Carlos', jobTitle: 'Médico Veterinário' },
    { name: 'Paula Mendes', jobTitle: 'Esteticista Pet' },
    { name: 'Bruno Alves', jobTitle: 'Banhista' },
    { name: 'Equipe', jobTitle: 'Geral' },
  ];

  for (const op of operators) {
    const [rows] = await connection.query('SELECT id FROM operators WHERE name = ? LIMIT 1', [op.name]);
    if (rows.length === 0) {
      await connection.query(
        'INSERT INTO operators (id, name, pin, jobTitle, active, isManager, createdAt, updatedAt) VALUES (UUID(), ?, ?, ?, 1, 0, ?, ?)',
        [op.name, '$2b$10$5cJNjBbvYhGDSIPsSLORje6KDsda5Ie69msPjv1QXFkqU7fODNOaG', op.jobTitle, now, now]
      );
      console.log(`Inserted operator: ${op.name}`);
    }
  }

  // 2. Services
  const services = [
    { name: 'Banho e Tosa', duration: 90, price: 95.0, color: '#2563eb' },
    { name: 'Banho Essencial', duration: 60, price: 65.0, color: '#0f766e' },
    { name: 'Consulta Veterinária', duration: 45, price: 150.0, color: '#dc2626' },
    { name: 'Hidratação de Pelagem', duration: 30, price: 45.0, color: '#c2410c' },
    { name: 'Tosa Higiênica', duration: 45, price: 55.0, color: '#7c3aed' },
    { name: 'Vacina V8', duration: 20, price: 90.0, color: '#0891b2' },
    { name: 'Vacina V10', duration: 20, price: 110.0, color: '#0891b2' },
    { name: 'Vacina Antirrábica', duration: 20, price: 60.0, color: '#0891b2' },
    { name: 'Exame Laboratorial', duration: 30, price: 120.0, color: '#475569' },
    { name: 'Hidratação + Unhas', duration: 45, price: 65.0, color: '#ea580c' },
  ];

  for (const svc of services) {
    const [rows] = await connection.query('SELECT id FROM pet_services WHERE name = ? LIMIT 1', [svc.name]);
    if (rows.length === 0) {
      await connection.query(
        'INSERT INTO pet_services (id, name, description, durationMinutes, price, color, active, createdAt, updatedAt) VALUES (UUID(), ?, ?, ?, ?, ?, 1, ?, ?)',
        [svc.name, `Serviço de ${svc.name}`, svc.duration, svc.price, svc.color, now, now]
      );
      console.log(`Inserted service: ${svc.name}`);
    }
  }

  // Helper maps
  const [opRows] = await connection.query('SELECT id, name FROM operators');
  const opMap = new Map(opRows.map(r => [r.name, r.id]));

  const [svcRows] = await connection.query('SELECT id, name, price, durationMinutes FROM pet_services');
  const svcMap = new Map(svcRows.map(r => [r.name, r]));

  // 3. Tutors and Pets
  const petsData = [
    { pet: 'Thor', tutor: 'Bruno Alves', phone: '11987651004', breed: 'Spitz Alemão', species: 'dog' },
    { pet: 'Luna', tutor: 'Carolina Souza', phone: '11987651005', breed: 'Border Collie', species: 'dog' },
    { pet: 'Milo', tutor: 'Mariana Costa', phone: '11987651001', breed: 'Golden Retriever', species: 'dog' },
    { pet: 'Bela', tutor: 'Paula Mendes', phone: '11987651003', breed: 'Poodle', species: 'dog' },
    { pet: 'Nina', tutor: 'Paula Mendes', phone: '11987651003', breed: 'SRD', species: 'cat' },
    { pet: 'Toby', tutor: 'Rafael Lima', phone: '11987651002', breed: 'Beagle', species: 'dog' },
    { pet: 'Mel', tutor: 'Mariana Costa', phone: '11987651001', breed: 'Golden Retriever', species: 'dog' },
    { pet: 'Simba', tutor: 'Diego Martins', phone: '11987651006', breed: 'Persa', species: 'cat' },
    { pet: 'Lola', tutor: 'Fernanda Rocha', phone: '11987651007', breed: 'Shih-tzu', species: 'dog' },
    { pet: 'Bob', tutor: 'Lucas Silva', phone: '11987651008', breed: 'Lhasa Apso', species: 'dog' },
    { pet: 'Amora', tutor: 'Beatriz Santos', phone: '11987651009', breed: 'SRD', species: 'cat' },
    { pet: 'Fred', tutor: 'Rodrigo Alves', phone: '11987651010', breed: 'Bulldog Francês', species: 'dog' },
    { pet: 'Lua', tutor: 'Juliana Lima', phone: '11987651011', breed: 'Husky Siberiano', species: 'dog' },
    { pet: 'Oliver', tutor: 'Camila Gomes', phone: '11987651012', breed: 'Siamês', species: 'cat' },
    { pet: 'Maya', tutor: 'Gabriel Castro', phone: '11987651013', breed: 'Border Collie', species: 'dog' },
    { pet: 'Zoe', tutor: 'Aline Oliveira', phone: '11987651014', breed: 'Yorkshire', species: 'dog' },
    { pet: 'Nick', tutor: 'Eduardo Ramos', phone: '11987651015', breed: 'Pinscher', species: 'dog' },
    { pet: 'Cacau', tutor: 'Larissa Vieira', phone: '11987651016', breed: 'Labrador', species: 'dog' },
    { pet: 'Meg', tutor: 'Patrícia Dias', phone: '11987651017', breed: 'Golden Retriever', species: 'dog' },
    { pet: 'loquinho', tutor: 'Bruno Alves', phone: '11987651004', breed: 'Bulldog', species: 'dog' },
    { pet: 'Bento', tutor: 'Rafael Lima', phone: '11987651002', breed: 'Shih-tzu', species: 'dog' },
    { pet: 'Mia', tutor: 'Renata Farias', phone: '11987651018', breed: 'Maltês', species: 'dog' },
    { pet: 'Apolo', tutor: 'Thiago Martins', phone: '11987651019', breed: 'Pastor Alemão', species: 'dog' },
    { pet: 'Lili', tutor: 'Sabrina Souza', phone: '11987651020', breed: 'Chihuahua', species: 'dog' },
    { pet: 'Nino', tutor: 'Marcelo Nogueira', phone: '11987651021', breed: 'Pug', species: 'dog' },
  ];

  const petMap = new Map(); // petName -> { id, customerId }

  for (const item of petsData) {
    let customerId;
    const [cRows] = await connection.query('SELECT id FROM customers WHERE name = ? OR phone = ? LIMIT 1', [item.tutor, item.phone]);
    if (cRows.length > 0) {
      customerId = cRows[0].id;
    } else {
      const [cRes] = await connection.query(
        'INSERT INTO customers (id, name, phone, email, createdAt, updatedAt) VALUES (UUID(), ?, ?, ?, ?, ?)',
        [item.tutor, item.phone, `${item.tutor.toLowerCase().replace(/[^a-z]/g, '')}@example.com`, now, now]
      );
      const [newCRows] = await connection.query('SELECT id FROM customers WHERE phone = ? LIMIT 1', [item.phone]);
      customerId = newCRows[0].id;
      console.log(`Inserted customer: ${item.tutor}`);
    }

    let petId;
    const [pRows] = await connection.query('SELECT id FROM pets WHERE name = ? LIMIT 1', [item.pet]);
    if (pRows.length > 0) {
      petId = pRows[0].id;
    } else {
      await connection.query(
        'INSERT INTO pets (id, customerId, name, species, breed, sex, size, active, createdAt, updatedAt) VALUES (UUID(), ?, ?, ?, ?, "M", "M", 1, ?, ?)',
        [customerId, item.pet, item.species, item.breed, now, now]
      );
      const [newPRows] = await connection.query('SELECT id FROM pets WHERE name = ? LIMIT 1', [item.pet]);
      petId = newPRows[0].id;
      console.log(`Inserted pet: ${item.pet}`);
    }
    petMap.set(item.pet, { id: petId, customerId });
  }

  // 4. Exactly the 28 Appointments from the Mockup Image 1
  const appointmentsToSeed = [
    // Seg 20 Out
    { day: '2026-10-20', time: '09:00', duration: 90, pet: 'Thor', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'delivered' },
    { day: '2026-10-20', time: '10:30', duration: 45, pet: 'Luna', service: 'Consulta Veterinária', prof: 'Dr. Carlos', status: 'checked_in' },
    { day: '2026-10-20', time: '14:00', duration: 30, pet: 'Milo', service: 'Hidratação de Pelagem', prof: 'Paula Mendes', status: 'scheduled' },
    { day: '2026-10-20', time: '16:30', duration: 45, pet: 'Bela', service: 'Tosa Higiênica', prof: 'Juliana Alves', status: 'scheduled' },

    // Ter 21 Out
    { day: '2026-10-21', time: '09:00', duration: 60, pet: 'Nina', service: 'Banho Essencial', prof: 'Paula Mendes', status: 'scheduled' },
    { day: '2026-10-21', time: '11:00', duration: 20, pet: 'Toby', service: 'Vacina V8', prof: 'Dr. Carlos', status: 'scheduled' },
    { day: '2026-10-21', time: '14:00', duration: 90, pet: 'Mel', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'requested' },
    { day: '2026-10-21', time: '15:30', duration: 45, pet: 'Simba', service: 'Consulta Veterinária', prof: 'Dr. Carlos', status: 'scheduled' },
    { day: '2026-10-21', time: '17:00', duration: 45, pet: 'Lola', service: 'Tosa Higiênica', prof: 'Bruno Alves', status: 'scheduled' },

    // Qua 22 Out
    { day: '2026-10-22', time: '09:00', duration: 90, pet: 'Bob', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'scheduled' },
    { day: '2026-10-22', time: '10:30', duration: 30, pet: 'Amora', service: 'Hidratação de Pelagem', prof: 'Paula Mendes', status: 'bathing' },
    { day: '2026-10-22', time: '13:00', duration: 45, pet: 'Fred', service: 'Consulta Veterinária', prof: 'Dr. Carlos', status: 'requested' },
    { day: '2026-10-22', time: '15:00', duration: 60, pet: 'Lua', service: 'Banho Essencial', prof: 'Bruno Alves', status: 'scheduled' },

    // Qui 23 Out
    { day: '2026-10-23', time: '08:30', duration: 30, pet: 'Oliver', service: 'Exame Laboratorial', prof: 'Dr. Carlos', status: 'scheduled' },
    { day: '2026-10-23', time: '10:00', duration: 90, pet: 'Maya', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'scheduled' },
    { day: '2026-10-23', time: '13:30', duration: 45, pet: 'Zoe', service: 'Tosa Higiênica', prof: 'Bruno Alves', status: 'scheduled' },
    { day: '2026-10-23', time: '15:00', duration: 20, pet: 'Nick', service: 'Vacina Antirrábica', prof: 'Dr. Carlos', status: 'requested' },
    { day: '2026-10-23', time: '17:00', duration: 90, pet: 'Cacau', service: 'Banho e Tosa', prof: 'Paula Mendes', status: 'scheduled' },
    { day: '2026-10-23', time: '18:30', duration: 30, pet: 'Meg', service: 'Hidratação de Pelagem', prof: 'Juliana Alves', status: 'scheduled' },

    // Sex 24 Out
    { day: '2026-10-24', time: '09:00', duration: 60, pet: 'loquinho', service: 'Banho Essencial', prof: 'Bruno Alves', status: 'grooming' },
    { day: '2026-10-24', time: '11:00', duration: 45, pet: 'Nina', service: 'Hidratação + Unhas', prof: 'Paula Mendes', status: 'ready' },
    { day: '2026-10-24', time: '14:00', duration: 45, pet: 'Toby', service: 'Tosa Higiênica', prof: 'Bruno Alves', status: 'scheduled' },
    { day: '2026-10-24', time: '16:00', duration: 45, pet: 'Luna', service: 'Consulta Veterinária', prof: 'Dr. Carlos', status: 'scheduled' },
    { day: '2026-10-24', time: '18:00', duration: 90, pet: 'Bento', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'scheduled' },

    // Sáb 25 Out
    { day: '2026-10-25', time: '09:00', duration: 90, pet: 'Mia', service: 'Banho e Tosa', prof: 'Juliana Alves', status: 'scheduled' },
    { day: '2026-10-25', time: '11:00', duration: 45, pet: 'Apolo', service: 'Tosa Higiênica', prof: 'Bruno Alves', status: 'scheduled' },
    { day: '2026-10-25', time: '14:00', duration: 20, pet: 'Lili', service: 'Vacina V10', prof: 'Dr. Carlos', status: 'scheduled' },

    // Dom 26 Out
    { day: '2026-10-26', time: '10:00', duration: 60, pet: 'Nino', service: 'Banho Essencial', prof: 'Equipe', status: 'scheduled' },
  ];

  let insertedCount = 0;
  for (const app of appointmentsToSeed) {
    const startsAt = `${app.day} ${app.time}:00`;
    const [startH, startM] = app.time.split(':').map(Number);
    const endMinutes = startH * 60 + startM + app.duration;
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
    const endM = String(endMinutes % 60).padStart(2, '0');
    const endsAt = `${app.day} ${endH}:${endM}:00`;

    const petInfo = petMap.get(app.pet);
    if (!petInfo) continue;

    const [existing] = await connection.query(
      'SELECT id FROM pet_appointments WHERE petId = ? AND startsAt = ? LIMIT 1',
      [petInfo.id, startsAt]
    );

    if (existing.length === 0) {
      const profId = opMap.get(app.prof) || null;
      const svcInfo = svcMap.get(app.service) || { id: null, price: 50, durationMinutes: app.duration };

      const [res] = await connection.query(
        'INSERT INTO pet_appointments (id, customerId, petId, professionalId, startsAt, endsAt, status, source, createdAt, updatedAt) VALUES (UUID(), ?, ?, ?, ?, ?, ?, "internal", ?, ?)',
        [petInfo.customerId, petInfo.id, profId, startsAt, endsAt, app.status, now, now]
      );

      const [created] = await connection.query(
        'SELECT id FROM pet_appointments WHERE petId = ? AND startsAt = ? LIMIT 1',
        [petInfo.id, startsAt]
      );

      if (created.length > 0 && svcInfo.id) {
        await connection.query(
          'INSERT INTO pet_appointment_services (id, appointmentId, serviceId, nameSnapshot, priceSnapshot, durationMinutes) VALUES (UUID(), ?, ?, ?, ?, ?)',
          [created[0].id, svcInfo.id, app.service, svcInfo.price, svcInfo.durationMinutes]
        );
      }
      insertedCount++;
    }
  }

  console.log(`Seeding finished. Inserted ${insertedCount} appointments.`);
  await connection.end();
}

main().catch(console.error);
