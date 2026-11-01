import { PrismaClient as HeartPrismaClient } from './src/generated/heart-client';
import { PrismaClient as TenantPrismaClient } from '@prisma/client';

const heartPrisma = new HeartPrismaClient();

async function run() {
  console.log('🔄 Iniciando sincronização do Catálogo Mestre...');
  const allTenants = await heartPrisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, databaseUrl: true },
  });

  let synced = 0;
  let tenantsProcessed = 0;

  for (const tenant of allTenants) {
    if (!tenant.databaseUrl) continue;
    const client = new TenantPrismaClient({
      datasources: { db: { url: tenant.databaseUrl } },
    });

    try {
      await client.$connect();

      const products = await client.product.findMany({
        where: {
          barcode: { not: null },
          OR: [
            { imageUrl: { not: null } },
            { ncm: { not: null } },
          ],
        },
        select: {
          barcode: true,
          name: true,
          imageUrl: true,
          ncm: true,
          cest: true,
        },
      });

      for (const p of products) {
        if (!p.barcode) continue;

        const existing = await heartPrisma.masterProduct.findUnique({
          where: { ean: p.barcode },
        });

        if (!existing) {
          await heartPrisma.masterProduct.create({
            data: {
              ean: p.barcode,
              name: p.name,
              imageUrl: p.imageUrl || null,
              ncm: p.ncm || null,
              cest: p.cest || null,
              source: `tenant:${tenant.name}`,
            },
          });
          synced++;
        } else {
          const needsUpdate = (!existing.imageUrl && p.imageUrl) || (!existing.ncm && p.ncm);
          if (needsUpdate) {
            await heartPrisma.masterProduct.update({
              where: { ean: p.barcode },
              data: {
                imageUrl: existing.imageUrl || p.imageUrl || null,
                ncm: existing.ncm || p.ncm || null,
                cest: existing.cest || p.cest || null,
              },
            });
            synced++;
          }
        }
      }

      tenantsProcessed++;
      console.log(`✅ Tenant "${tenant.name}": ${products.length} produtos verificados.`);
    } catch (err: any) {
      console.warn(`Erro no tenant "${tenant.name}": ${err.message}`);
    } finally {
      await client.$disconnect();
    }
  }

  console.log(`🎯 Sincronização completa: ${synced} novos produtos/atualizados de ${tenantsProcessed} tenants.`);
}

run()
  .catch(console.error)
  .finally(() => heartPrisma.$disconnect());
