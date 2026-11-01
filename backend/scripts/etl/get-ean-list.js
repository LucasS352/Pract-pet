const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('📋 Buscando 20 produtos da Base Mestre para teste...\n');
  
  const products = await heartPrisma.masterProduct.findMany({
    take: 20,
    select: {
      ean: true,
      name: true,
      brand: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log('--- LISTA DE EANs PARA TESTE ---');
  products.forEach((p, i) => {
    console.log(`${i + 1}. [${p.ean}] - ${p.name}${p.brand ? ` (${p.brand})` : ''}`);
  });
  console.log('--------------------------------');
}

main().finally(() => heartPrisma.$disconnect());
