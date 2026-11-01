const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  const cats = await heartPrisma.masterProduct.findMany({
    select: { category: true },
    distinct: ['category']
  });
  console.log(cats.map(c => c.category));
}

main().finally(() => heartPrisma.$disconnect());
