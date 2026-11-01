const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

const ESSENTIAL_SODAS = [
  { ean: "7894900011517", name: "Refrigerante Coca-Cola 2 Litros", brand: "Coca-Cola", ncm: "22021000", unit: "UN" },
  { ean: "7891991000840", name: "Refrigerante Guaraná Antarctica 2 Litros", brand: "Antarctica", ncm: "22021000", unit: "UN" },
  { ean: "7894900011609", name: "Refrigerante Fanta Laranja 2 Litros", brand: "Fanta", ncm: "22021000", unit: "UN" },
  { ean: "7894900011661", name: "Refrigerante Fanta Uva 2 Litros", brand: "Fanta", ncm: "22021000", unit: "UN" },
  { ean: "7894900011715", name: "Refrigerante Sprite 2 Litros", brand: "Sprite", ncm: "22021000", unit: "UN" },
  { ean: "7892840813350", name: "Refrigerante Pepsi 2 Litros", brand: "Pepsi", ncm: "22021000", unit: "UN" },
  { ean: "7894900014020", name: "Refrigerante Kuat 2 Litros", brand: "Kuat", ncm: "22021000", unit: "UN" },
  { ean: "7891991001472", name: "Refrigerante Sukita Laranja 2 Litros", brand: "Sukita", ncm: "22021000", unit: "UN" },
  { ean: "7891991001083", name: "Refrigerante Soda Antarctica 2 Litros", brand: "Antarctica", ncm: "22021000", unit: "UN" },
  { ean: "7894900730104", name: "Refrigerante Schweppes Citrus 1.5 Litros", brand: "Schweppes", ncm: "22021000", unit: "UN" },
  // Fardos (DUN-14 / EAN-14)
  { ean: "17894900011514", name: "Fardo Refrigerante Coca-Cola 2 Litros (6 Unidades)", brand: "Coca-Cola", ncm: "22021000", unit: "FD" },
  { ean: "17891991000847", name: "Fardo Refrigerante Guaraná Antarctica 2 Litros (6 Unidades)", brand: "Antarctica", ncm: "22021000", unit: "FD" }
];

async function run() {
  await heartPrisma.$connect();
  console.log("🚀 INJETANDO PRODUTOS ESSENCIAIS DIRETAMENTE NO BANCO...");

  let added = 0;
  for (const soda of ESSENTIAL_SODAS) {
    const exists = await heartPrisma.masterProduct.findUnique({ where: { ean: soda.ean } });
    if (!exists) {
      await heartPrisma.masterProduct.create({
        data: {
          ean: soda.ean,
          name: soda.name,
          brand: soda.brand,
          ncm: soda.ncm,
          cest: null,
          unit: soda.unit,
          category: 'Refrigerante 2 Litros',
          source: 'manual_injection_turbo'
        }
      });
      console.log(`✅ Adicionado: [${soda.ean}] ${soda.name}`);
      added++;
    } else {
      console.log(`⏭️ Já existe: [${soda.ean}] ${soda.name}`);
    }
  }

  await heartPrisma.$disconnect();
  console.log(`\n🎉 FINALIZADO! ${added} produtos cruciais inseridos com sucesso na base.`);
}

run();
