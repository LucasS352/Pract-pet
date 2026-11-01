const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('🔄 Buscando o tenant lucas...');
  const tenant = await heartPrisma.tenant.findUnique({ where: { databaseName: 'lucas' } });
  
  if (!tenant) {
    console.log('❌ Tenant lucas não encontrado!');
    return;
  }

  const { PrismaClient: TenantPrismaClient } = require('@prisma/client');
  const tenantPrisma = new TenantPrismaClient({
    datasources: { db: { url: tenant.databaseUrl } }
  });

  const products = await tenantPrisma.product.findMany({
    select: { id: true, name: true, imageUrl: true }
  });

  let countWithImage = 0;
  console.log(`\n📦 Produtos no banco da sua empresa (Total: ${products.length}):`);
  products.forEach(p => {
    if (p.imageUrl) {
      countWithImage++;
      console.log(`🖼️  [Com Imagem] ${p.name}`);
    } else {
      console.log(`❌ [Sem Imagem] ${p.name}`);
    }
  });

  console.log(`\n📊 Resumo: ${countWithImage} produtos com imagem, ${products.length - countWithImage} produtos sem imagem.`);
  
  await tenantPrisma.$disconnect();
}

main().finally(() => heartPrisma.$disconnect());
