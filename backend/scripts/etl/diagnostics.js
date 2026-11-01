const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function analyze() {
  await heartPrisma.$connect();
  
  const total = await heartPrisma.masterProduct.count();
  console.log(`\n📊 Total de Produtos no Banco Mestre: ${total}\n`);

  const categories = await heartPrisma.masterProduct.groupBy({
    by: ['category'],
    _count: {
      id: true
    },
    orderBy: {
      _count: { id: 'desc' }
    }
  });

  console.log(`📂 Distribuição por Categorias:`);
  categories.forEach(c => {
    console.log(`- ${c.category}: ${c._count.id} produtos`);
  });

  await heartPrisma.$disconnect();
}

analyze().catch(console.error);
