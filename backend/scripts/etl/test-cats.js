const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  const targetCategories = [
    'Cerveja Lata', 'Cerveja Long Neck', 'Cerveja Garrafa', 
    'Refrigerante Lata', 'Energético', 
    'Salgadinho Elma Chips', 'Salgadinho', 
    'Cachaça', 'Whisky', 'Vodka', 'Gin', 
    'Vinho', 'Vinho Tinto', 
    'Isqueiro', 'Gelo', 'Fósforo', 
    'Detergente Líquido', 'Corote', 'Conhaque', 
    'Água Mineral', 'Água Tônica'
  ];

  console.log('Testando busca por categorias exatas...');
  const masterProducts = await heartPrisma.masterProduct.findMany({
    where: {
      category: { in: targetCategories }
    },
    select: { category: true }
  });

  console.log(`Total encontrado: ${masterProducts.length}`);
  
  // Agrupar e contar por categoria
  const counts = masterProducts.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + 1;
    return acc;
  }, {});

  console.log('Contagem por categoria:', counts);
}

main().finally(() => heartPrisma.$disconnect());
