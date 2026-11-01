const axios = require('axios');
const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('\n--- 1. CHECANDO O BANCO DE DADOS DIRETO ---');
  const dbProduct = await prisma.masterProduct.findUnique({ where: { ean: '7891991010412' } });
  if (dbProduct) {
    console.log(`✅ NO BANCO: Encontrado -> ${dbProduct.name}`);
  } else {
    console.log(`❌ ERRO: A Brahma não está no banco Mestre! O script de injeção falhou silenciosamente?`);
  }

  console.log('\n--- 2. TESTANDO A API DO NESTJS (Porta 3520) ---');
  try {
    // Note que precisa passar um token JWT, mas vamos ver se o endpoint responde 401 ou 404 ou 200
    const res = await axios.get('http://localhost:3520/api/products/lookup/7891991010412');
    console.log('✅ API RESPONDEU 200 OK:', res.data);
  } catch (err) {
    if (err.response) {
      console.log(`⚠️ API RESPONDEU STATUS ${err.response.status}:`, err.response.data);
    } else {
      console.log('❌ API NÃO RESPONDEU (Servidor offline?):', err.message);
    }
  }
}

main().finally(() => prisma.$disconnect());
