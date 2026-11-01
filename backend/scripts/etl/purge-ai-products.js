const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function purge() {
  console.log("🧹 Iniciando expurgo de TODOS os produtos do banco MasterProduct...");
  
  try {
    await heartPrisma.$connect();
    
    // Apaga absolutamente todos os produtos do MasterProduct
    const result = await heartPrisma.masterProduct.deleteMany();
    
    console.log(`✅ Sucesso! Foram apagados ${result.count} produtos falsos/antigos do banco.`);
    console.log("A tabela MasterProduct agora está limpa e pronta para o Scraper BR.");
    
  } catch (error) {
    console.error("❌ Erro ao expurgar o banco:", error);
  } finally {
    await heartPrisma.$disconnect();
  }
}

purge();
