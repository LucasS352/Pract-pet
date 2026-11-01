const { execSync } = require('child_process');
const { PrismaClient } = require('../../src/generated/heart-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

async function main() {
  console.log('🔄 Buscando empresas (tenants) no banco central...');
  const tenants = await heartPrisma.tenant.findMany();
  
  for (const tenant of tenants) {
    console.log(`\n🚀 Sincronizando schema do banco da empresa: ${tenant.databaseName}`);
    try {
      // Seta a variável de ambiente dinamicamente para o prisma db push usar a URL correta do tenant
      execSync('npx prisma db push --schema=prisma/schema.prisma --accept-data-loss', {
        env: { ...process.env, DATABASE_URL_TENANT: tenant.databaseUrl },
        stdio: 'inherit'
      });
      console.log(`✅ Banco '${tenant.databaseName}' atualizado com sucesso!`);
    } catch (err) {
      console.error(`❌ Erro ao atualizar banco '${tenant.databaseName}':`, err.message);
    }
  }
}

main().finally(() => heartPrisma.$disconnect());
