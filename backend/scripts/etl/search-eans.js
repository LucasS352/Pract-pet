const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('🔍 Buscando Brahmas no banco mestre...\n');
  const brahmas = await prisma.masterProduct.findMany({
    where: { name: { contains: 'Brahma' } },
    take: 10
  });
  brahmas.forEach(b => console.log(`[${b.ean}] - ${b.name}`));

  console.log('\n🔍 Buscando Coca-Colas no banco mestre...\n');
  const cocas = await prisma.masterProduct.findMany({
    where: { name: { contains: 'Coca' } },
    take: 10
  });
  cocas.forEach(c => console.log(`[${c.ean}] - ${c.name}`));
}

main().finally(() => prisma.$disconnect());
