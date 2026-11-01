const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

// EANs errados que tentamos adicionar no último script (para remover)
const WRONG_EANS = [
  "7891991000840", // Guaraná Antigo
  "7894900011609", // Fanta Laranja Antigo
  "7894900011661", // Fanta Uva Antigo
  "7894900011715", // Sprite Antigo
  "7892840813350", // Pepsi Antigo
  "7894900014020", // Kuat Antigo
  "7891991001472", // Sukita Antigo
  "7891991001083", // Soda Antigo
  "7894900730104", // Schweppes Antigo
  "17891991000847" // Fardo Guaraná Antigo
];

// Lista verificada oficial pelo usuário
const CORRECT_SODAS = [
  { ean: "7891991001342", name: "Refrigerante Guaraná Antarctica PET 2L", brand: "Antarctica", ncm: "22021000", unit: "UN" },
  { ean: "7894900031515", name: "Refrigerante Fanta Laranja PET 2L", brand: "Fanta", ncm: "22021000", unit: "UN" },
  { ean: "7894900051513", name: "Refrigerante Fanta Uva PET 2L", brand: "Fanta", ncm: "22021000", unit: "UN" },
  { ean: "7894900681000", name: "Refrigerante Sprite PET 2L", brand: "Sprite", ncm: "22021000", unit: "UN" },
  { ean: "7892840800000", name: "Refrigerante Pepsi PET 2L", brand: "Pepsi", ncm: "22021000", unit: "UN" },
  { ean: "7894900911510", name: "Refrigerante Kuat PET 2L", brand: "Kuat", ncm: "22021000", unit: "UN" },
  { ean: "7891149440801", name: "Refrigerante Sukita Laranja PET 2L", brand: "Sukita", ncm: "22021000", unit: "UN" },
  { ean: "7891991001359", name: "Refrigerante Soda Antarctica PET 2L", brand: "Antarctica", ncm: "22021000", unit: "UN" },
  { ean: "7894900180541", name: "Refrigerante Schweppes Citrus PET 1.5L", brand: "Schweppes", ncm: "22021000", unit: "UN" }
];

async function run() {
  await heartPrisma.$connect();
  console.log("🧹 INICIANDO LIMPEZA DOS CÓDIGOS ERRADOS...");

  let removed = 0;
  for (const ean of WRONG_EANS) {
    try {
      await heartPrisma.masterProduct.delete({ where: { ean } });
      console.log(`🗑️ Removido EAN antigo: [${ean}]`);
      removed++;
    } catch (e) {
      // Ignora se não existir
    }
  }

  console.log(`\n🚀 INJETANDO A LISTA VERIFICADA OFICIAL...`);
  let added = 0;
  for (const soda of CORRECT_SODAS) {
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
          source: 'manual_verified_list'
        }
      });
      console.log(`✅ Adicionado: [${soda.ean}] ${soda.name}`);
      added++;
    } else {
      console.log(`⏭️ Já existe: [${soda.ean}] ${soda.name}`);
    }
  }

  await heartPrisma.$disconnect();
  console.log(`\n🎉 CORREÇÃO FINALIZADA!`);
  console.log(`📊 Foram removidos ${removed} códigos antigos e inseridos ${added} códigos oficiais.`);
}

run();
