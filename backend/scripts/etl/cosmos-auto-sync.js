#!/usr/bin/env node
/**
 * cosmos-auto-sync.js
 * 
 * Este script automatiza o enriquecimento de dados fiscais:
 * 1. Conecta no Heart DB e encontra tenants com `cosmosApiKey` configurado.
 * 2. Para cada tenant, conecta em seu banco de dados local.
 * 3. Encontra produtos que possuem código de barras (EAN), mas estão sem NCM/CEST,
 *    ou que ainda não existem no cache global (MasterProduct).
 * 4. Consulta a API Cosmos usando o limite diário do tenant (25 req/dia).
 * 5. Salva o resultado no MasterProduct (Cache Global) e atualiza o Produto local do tenant.
 * 
 * Uso: node scripts/etl/cosmos-auto-sync.js
 */

const { PrismaClient: HeartPrisma } = require('../../src/generated/heart-client');
const { PrismaClient: TenantPrisma } = require('@prisma/client');
require('dotenv').config();

const heartPrisma = new HeartPrisma();

// Mapeamento idêntico ao do MasterProductsService
const COSMOS_CATEGORY_NCM = {
  'Cerveja': { ncm: '22030000', cest: '0300100' },
  'Cervejas': { ncm: '22030000', cest: '0300100' },
  'Chope': { ncm: '22030000', cest: '0300200' },
  'Vinho': { ncm: '22042100', cest: '0200900' },
  'Vinhos': { ncm: '22042100', cest: '0200900' },
  'Espumante': { ncm: '22041000', cest: '0200900' },
  'Champagne': { ncm: '22041000', cest: '0200900' },
  'Whisky': { ncm: '22083000', cest: '0200200' },
  'Whiskey': { ncm: '22083000', cest: '0200200' },
  'Vodka': { ncm: '22086000', cest: '0200200' },
  'Gin': { ncm: '22085000', cest: '0200200' },
  'Rum': { ncm: '22084000', cest: '0200400' },
  'Cachaça': { ncm: '22084000', cest: '0200400' },
  'Aguardente': { ncm: '22084000', cest: '0200400' },
  'Tequila': { ncm: '22089000', cest: '0200200' },
  'Licor': { ncm: '22089000', cest: '0200200' },
  'Bebida Alcoólica': { ncm: '22089000', cest: '0200200' },
  'Energético': { ncm: '22021000', cest: '0300600' },
  'Refrigerante': { ncm: '22021000', cest: '0300600' },
  'Água': { ncm: '22011000', cest: '0300500' },
  'Água Mineral': { ncm: '22011000', cest: '0300500' },
  'Suco': { ncm: '20099900', cest: null },
  'Isotônico': { ncm: '22021000', cest: '0300600' },
  'Chocolate': { ncm: '18069000', cest: null },
  'Leite': { ncm: '04012000', cest: null },
  'Café': { ncm: '09011100', cest: null },
  'Cigarro': { ncm: '24022000', cest: '0600100' },
  'Cigarros': { ncm: '24022000', cest: '0600100' },
  'Biscoito': { ncm: '19059090', cest: null },
  'Snack': { ncm: '19059090', cest: null },
  'Salgadinho': { ncm: '20052000', cest: null },
  'Macarrão': { ncm: '19023000', cest: null },
  'Papel Higiênico': { ncm: '48181000', cest: null },
  'Detergente': { ncm: '34022000', cest: null },
};

function inferFiscalFromCosmos(categories) {
  for (const cat of categories) {
    if (COSMOS_CATEGORY_NCM[cat]) return COSMOS_CATEGORY_NCM[cat];
    for (const key of Object.keys(COSMOS_CATEGORY_NCM)) {
      if (cat.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cat.toLowerCase())) {
        return COSMOS_CATEGORY_NCM[key];
      }
    }
  }
  return { ncm: null, cest: null };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🔄 Iniciando Auto-Sync com a API Cosmos...\n');

  // 1. Busca tenants com token configurado
  const tenants = await heartPrisma.tenant.findMany({
    where: { cosmosApiKey: { not: null } },
  });

  if (tenants.length === 0) {
    console.log('❌ Nenhum tenant possui o Token Cosmos configurado.');
    return;
  }

  console.log(`✅ Encontrados ${tenants.length} tenants com token Cosmos configurado.\n`);

  for (const tenant of tenants) {
    console.log(`🏢 Processando Tenant: ${tenant.razaoSocial || tenant.id}`);

    const tenantPrisma = new TenantPrisma({
      datasources: { db: { url: tenant.databaseUrl } },
    });

    try {
      // Pega todos os produtos do tenant que tem EAN
      const products = await tenantPrisma.product.findMany({
        where: {
          barcode: { not: null, not: '' },
        },
        select: { id: true, name: true, barcode: true, ncm: true, cest: true }
      });

      let lookupsRealizados = 0;
      const MAX_LOOKUPS_POR_TENANT = 20; // Deixa 5 requisições livres para buscas manuais no dia

      for (const product of products) {
        if (lookupsRealizados >= MAX_LOOKUPS_POR_TENANT) {
          console.log(`   ⚠️  Limite de ${MAX_LOOKUPS_POR_TENANT} buscas atingido para este tenant.`);
          break;
        }

        const ean = product.barcode.trim().replace(/\D/g, '');
        if (ean.length !== 13) continue;

        // 1. Checa se já está no cache global MasterProduct e tem NCM
        const cached = await heartPrisma.masterProduct.findUnique({
          where: { ean }
        });

        // Se já está no cache, atualiza o produto do tenant com os dados do cache (se tiver NCM) e pula
        if (cached) {
          if (cached.name === 'NOT_FOUND') {
            console.log(`   [CACHE] EAN ${ean} ignorado (marcado como NOT_FOUND em buscas anteriores)`);
          } else if (cached.ncm) {
            if (!product.ncm || !product.cest) {
              await tenantPrisma.product.update({
                where: { id: product.id },
                data: {
                  ncm: product.ncm || cached.ncm,
                  cest: product.cest || cached.cest,
                }
              });
              console.log(`   [CACHE] EAN ${ean} (${product.name}) -> Atualizado NCM/CEST via Cache`);
            }
          }
          continue;
        }

        // 2. Se não está no cache (ou não tem NCM no cache), busca na Cosmos
        console.log(`   [COSMOS] Buscando EAN ${ean} (${product.name})...`);
        const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}`, {
          headers: {
            'X-Cosmos-Token': tenant.cosmosApiKey,
            'Content-Type': 'application/json',
            'User-Agent': '7Bar-PDV/1.0',
          },
        });

        if (res.status === 429) {
          console.log(`   ❌ Rate Limit atingido para o tenant. Pulando para o próximo.`);
          break;
        }

        if (!res.ok) {
          console.log(`   ❌ Não encontrado ou erro (${res.status}) na Cosmos. Salvando como NOT_FOUND.`);
          await heartPrisma.masterProduct.upsert({
            where: { ean },
            update: {},
            create: { ean, name: "NOT_FOUND", ncm: null, cest: null, unit: "UN", source: "cosmos" }
          });
          continue;
        }

        const data = await res.json();
        const name = data.description || data.product_name || null;
        if (!name) {
          await heartPrisma.masterProduct.upsert({
            where: { ean },
            update: {},
            create: { ean, name: "NOT_FOUND", ncm: null, cest: null, unit: "UN", source: "cosmos" }
          });
          continue;
        }

        const categories = (data.gtins_categories || []).map(c => c.category?.description || c.description || '');
        const fiscal = inferFiscalFromCosmos(categories);
        const ncm = data.ncm?.code || fiscal.ncm;
        const brand = data.brand?.name || null;

        // 3. Salva no MasterProduct (Cache Global)
        const productData = {
          ean,
          name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
          brand: brand,
          ncm: ncm,
          cest: fiscal.cest,
          unit: 'UN',
          category: categories[0] || null,
          source: 'cosmos',
        };

        await heartPrisma.masterProduct.upsert({
          where: { ean },
          update: { name: productData.name, brand: productData.brand, ncm: productData.ncm, cest: productData.cest },
          create: productData,
        });

        // 4. Atualiza o produto do cliente
        if (!product.ncm || !product.cest) {
          await tenantPrisma.product.update({
            where: { id: product.id },
            data: {
              ncm: product.ncm || productData.ncm,
              cest: product.cest || productData.cest,
            }
          });
        }

        console.log(`   ✅ Sucesso! Cache salvo e Produto atualizado.`);
        lookupsRealizados++;

        // Delay para não sobrecarregar
        await sleep(1000);
      }
    } catch (e) {
      console.error(`   ❌ Erro ao processar tenant:`, e.message);
    } finally {
      await tenantPrisma.$disconnect();
    }
  }

  await heartPrisma.$disconnect();
  console.log('\n🎉 Sincronização concluída!');
}

main();
