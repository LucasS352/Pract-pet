const { PrismaClient: TenantPrismaClient } = require('@prisma/client');
const { PrismaClient: HeartPrismaClient } = require('../src/generated/heart-client');
const heartDb = new HeartPrismaClient({ datasources: { db: { url: 'mysql://root:7bar@2025@mysql:3306/heart' } } });
async function migrateLegacy() {
  console.log('🚀 Iniciando Migracao de Legado para Perfis Fiscais...');
  const profiles = await heartDb.fiscalProfile.findMany({ where: { scope: 'SYSTEM', status: 'ACTIVE' } });
  const ncmMap = new Map();
  for (const p of profiles) { if (p.ncm && !ncmMap.has(p.ncm)) { ncmMap.set(p.ncm, p.id); } }
  const fallbackProfileId = 'fp_mercadoria_geral';
  const tenants = await heartDb.tenant.findMany({ where: { status: 'active' } });
  for (const tenant of tenants) {
    console.log(\n🏢 Processando Tenant: );
    const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenant.databaseUrl } } });
    try {
      const productsToMigrate = await tenantDb.product.findMany({
        where: { fiscalProfileId: null, isActive: true },
        select: { id: true, name: true, ncm: true },
      });
      if (productsToMigrate.length === 0) { console.log('  ✅ Nenhum produto para migrar.'); continue; }
      console.log(  🔄 Encontrados  produtos sem Perfil Fiscal. Iniciando match...);
      let matched = 0; let fallbacked = 0;
      for (const prod of productsToMigrate) {
        let matchedId = fallbackProfileId;
        if (prod.ncm && ncmMap.has(prod.ncm)) { matchedId = ncmMap.get(prod.ncm); matched++; } else { fallbacked++; }
        await tenantDb.product.update({ where: { id: prod.id }, data: { fiscalProfileId: matchedId, emiteNfce: true } });
      }
      console.log(  ✅ Migracao concluida:  NCM,  Geral.);
    } catch (e) {
      console.error(  ❌ Erro ao migrar tenant :, e);
    } finally {
      await tenantDb.();
    }
  }
  console.log('\n🎉 Migracao Global Concluida!');
}
migrateLegacy().catch(e => { console.error(e); process.exit(1); }).finally(() => heartDb.());
