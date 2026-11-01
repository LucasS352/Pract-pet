const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  const brahma = await prisma.masterProduct.findUnique({ where: { ean: '7891991010412' } });
  const coca = await prisma.masterProduct.findUnique({ where: { ean: '7894900010015' } });
  
  console.log('Brahma:', brahma ? 'Encontrada - ' + brahma.name : 'NÃO ENCONTRADA');
  console.log('Coca-Cola:', coca ? 'Encontrada - ' + coca.name : 'NÃO ENCONTRADA');
}

main().finally(() => prisma.$disconnect());
