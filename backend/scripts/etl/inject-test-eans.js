const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('💉 Injetando produtos clássicos de teste...');

  await prisma.masterProduct.upsert({
    where: { ean: '7891991010412' },
    update: {},
    create: {
      ean: '7891991010412',
      name: 'Cerveja Brahma Chopp Lata 350ml',
      brand: 'Brahma',
      ncm: '22030000',
      cest: '0302200',
      unit: 'UN',
      category: 'Cerveja Lata',
      source: 'manual_injection'
    }
  });

  await prisma.masterProduct.upsert({
    where: { ean: '7894900010015' },
    update: {},
    create: {
      ean: '7894900010015',
      name: 'Refrigerante Coca-Cola 2 Litros',
      brand: 'Coca-Cola',
      ncm: '22021000',
      cest: '0300700',
      unit: 'UN',
      category: 'Refrigerante 2 Litros',
      source: 'manual_injection'
    }
  });

  console.log('✅ Brahma e Coca-Cola injetados com sucesso! Pode testar novamente.');
}

main().finally(() => prisma.$disconnect());
