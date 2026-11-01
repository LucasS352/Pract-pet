const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  const eans = ['7891991010412', '7894900010015', '991010412'];
  for (const ean of eans) {
    const product = await prisma.masterProduct.findUnique({ where: { ean } });
    if (product) {
      console.log(`✅ ENCONTRADO NO BANCO: [${product.ean}] - ${product.name}`);
    } else {
      console.log(`❌ NÃO ESTÁ NO BANCO: [${ean}]`);
    }
  }
}

main().finally(() => prisma.$disconnect());
