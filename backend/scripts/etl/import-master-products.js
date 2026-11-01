#!/usr/bin/env node
/**
 * ============================================================
 *  import-master-products.js
 *  ETL — Open Food Facts → Heart DB (MasterProduct)
 * ============================================================
 *
 *  Estratégia: Usar a API de busca do Open Food Facts com
 *  paginação para buscar produtos relevantes para o segmento
 *  de Adega / Disk Bebidas no Brasil.
 *
 *  Categorias importadas:
 *    Bebidas: cervejas, vinhos, destilados, energéticos, refrigerantes, águas
 *    Conveniência: chocolates, leites, macarrão instantâneo, papel higiênico,
 *                  detergentes, salgadinhos, biscoitos
 *
 *  Pré-requisitos:
 *    - Node.js >= 18 (fetch nativo)
 *    - DATABASE_URL_HEART no .env do backend (ou exportado no shell)
 *    - Rodar na raiz do backend: node scripts/etl/import-master-products.js
 *
 *  Uso:
 *    node scripts/etl/import-master-products.js
 *    node scripts/etl/import-master-products.js --dry-run   (só gera o JSON, não insere)
 *    node scripts/etl/import-master-products.js --limit 500 (limita total de produtos)
 * ============================================================
 */

const path = require('path');
const fs   = require('fs');
const { PrismaClient } = require('../../src/generated/heart-client');

// ─── Configuração ────────────────────────────────────────────
const DRY_RUN     = process.argv.includes('--dry-run');
const LIMIT_ARG   = process.argv.indexOf('--limit');
const MAX_TOTAL   = LIMIT_ARG !== -1 ? parseInt(process.argv[LIMIT_ARG + 1]) : 12000;
const PAGE_SIZE   = 50;   // OFF limita bem a 50 por request
const DELAY_MS    = 600;  // Delay entre requests (respeitar rate-limit OFF)
const OUTPUT_FILE = path.join(__dirname, 'master_products_seed.json');

// ─── Dicionário NCM / CEST por categoria OFF ─────────────────
// Fonte: Tabela CEST CONFAZ + NCM Capítulo 22 (Bebidas)
const CATEGORY_MAP = {
  // === BEBIDAS ALCOÓLICAS ===
  'en:beers':               { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:craft-beers':         { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:lagers':              { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:ales':                { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:pilsners':            { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:stouts':              { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:chopp':               { ncm: '22030000', cest: '0300200', unit: 'LT' },
  'en:wines':               { ncm: '22042100', cest: '0200900', unit: 'UN' },
  'en:red-wines':           { ncm: '22042100', cest: '0200900', unit: 'UN' },
  'en:white-wines':         { ncm: '22042100', cest: '0200900', unit: 'UN' },
  'en:rose-wines':          { ncm: '22042100', cest: '0200900', unit: 'UN' },
  'en:sparkling-wines':     { ncm: '22041000', cest: '0200900', unit: 'UN' },
  'en:champagnes':          { ncm: '22041000', cest: '0200900', unit: 'UN' },
  'en:proseccos':           { ncm: '22041000', cest: '0200900', unit: 'UN' },
  'en:whiskies':            { ncm: '22083000', cest: '0200200', unit: 'UN' },
  'en:whisky':              { ncm: '22083000', cest: '0200200', unit: 'UN' },
  'en:scotch-whiskies':     { ncm: '22083000', cest: '0200200', unit: 'UN' },
  'en:vodkas':              { ncm: '22086000', cest: '0200200', unit: 'UN' },
  'en:gins':                { ncm: '22085000', cest: '0200200', unit: 'UN' },
  'en:rums':                { ncm: '22084000', cest: '0200400', unit: 'UN' },
  'en:cachacas':            { ncm: '22084000', cest: '0200400', unit: 'UN' },
  'en:brandies':            { ncm: '22082000', cest: '0200200', unit: 'UN' },
  'en:tequilas':            { ncm: '22089000', cest: '0200200', unit: 'UN' },
  'en:liqueurs':            { ncm: '22089000', cest: '0200200', unit: 'UN' },
  'en:spirits':             { ncm: '22089000', cest: '0200200', unit: 'UN' },
  'en:ciders':              { ncm: '22061000', cest: '0200800', unit: 'UN' },

  // === BEBIDAS NÃO ALCOÓLICAS ===
  'en:energy-drinks':       { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:soft-drinks':         { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:sodas':               { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:colas':               { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:lemonades':           { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:fruit-juices':        { ncm: '20099900', cest: null,      unit: 'UN' },
  'en:orange-juices':       { ncm: '20091100', cest: null,      unit: 'UN' },
  'en:mineral-waters':      { ncm: '22011000', cest: '0300500', unit: 'UN' },
  'en:waters':              { ncm: '22011000', cest: '0300500', unit: 'UN' },
  'en:sparkling-waters':    { ncm: '22011000', cest: '0300500', unit: 'UN' },
  'en:iced-teas':           { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:isotonic-drinks':     { ncm: '22021000', cest: '0300600', unit: 'UN' },

  // === CONVENIÊNCIA ===
  'en:chocolates':          { ncm: '18069000', cest: null, unit: 'UN' },
  'en:chocolate-bars':      { ncm: '18062000', cest: null, unit: 'UN' },
  'en:milks':               { ncm: '04011000', cest: null, unit: 'LT' },
  'en:long-life-milks':     { ncm: '04012000', cest: null, unit: 'LT' },
  'en:instant-noodles':     { ncm: '19023000', cest: null, unit: 'UN' },
  'en:pastas':              { ncm: '19021900', cest: null, unit: 'UN' },
  'en:chips':               { ncm: '20052000', cest: null, unit: 'UN' },
  'en:snacks':              { ncm: '19059090', cest: null, unit: 'UN' },
  'en:crackers':            { ncm: '19059020', cest: null, unit: 'UN' },
  'en:cookies':             { ncm: '19059090', cest: null, unit: 'UN' },
  'en:biscuits':            { ncm: '19059090', cest: null, unit: 'UN' },
  'en:toilet-papers':       { ncm: '48181000', cest: null, unit: 'UN' },
  'en:paper-towels':        { ncm: '48182000', cest: null, unit: 'UN' },
  'en:detergents':          { ncm: '34022000', cest: null, unit: 'UN' },
  'en:dishwashing-liquids': { ncm: '34022000', cest: null, unit: 'UN' },
  'en:cigarettes':          { ncm: '24022000', cest: '0600100', unit: 'UN' },
  'en:coffee':              { ncm: '09011100', cest: null, unit: 'UN' },
  'en:instant-coffees':     { ncm: '21011100', cest: null, unit: 'UN' },
  'en:chewing-gums':        { ncm: '17041000', cest: null, unit: 'UN' },
  'en:candies':             { ncm: '17049000', cest: null, unit: 'UN' },
};

// Categorias a buscar na API (agrupadas para otimizar requests)
const SEARCH_CATEGORIES = [
  'beers', 'wines', 'sparkling-wines', 'whiskies', 'vodkas', 'gins', 'rums',
  'cachacas', 'spirits', 'energy-drinks', 'soft-drinks', 'mineral-waters',
  'chocolates', 'milks', 'instant-noodles', 'chips', 'snacks', 'cookies',
  'crackers', 'toilet-papers', 'detergents', 'coffee', 'cigarettes', 'ciders',
];

// ─── Helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normaliza o nome: capitaliza primeira letra, remove tags HTML residuais
 */
function normalizeName(name) {
  if (!name) return null;
  return name
    .replace(/<[^>]+>/g, '')    // remove HTML
    .replace(/\s+/g, ' ')       // colapsa espaços
    .trim()
    .replace(/^./, c => c.toUpperCase()); // Capitaliza 1ª letra
}

/**
 * Extrai quantidade e unidade do campo quantity (ex: "350 ml" → "350ml")
 * e determina a unidade de venda correta.
 */
function inferUnit(product, fallbackUnit = 'UN') {
  const qty = product.quantity || '';
  if (/\d+\s*[Ll]$/i.test(qty) || /\d+\s*ml/i.test(qty)) return 'UN'; // Líquidos unitários
  if (/kg/i.test(qty)) return 'KG';
  if (/\d+\s*x/i.test(qty)) return 'FD'; // Fardos (ex: 12x350ml)
  return fallbackUnit;
}

/**
 * Busca dados fiscais pela lista de categorias do produto.
 * Percorre a lista em ordem de prioridade (mais específico primeiro).
 */
function getFiscalData(categoriesTags = [], defaultUnit = 'UN') {
  for (const cat of categoriesTags) {
    const key = cat.toLowerCase();
    if (CATEGORY_MAP[key]) {
      return {
        ncm: CATEGORY_MAP[key].ncm,
        cest: CATEGORY_MAP[key].cest,
        unit: CATEGORY_MAP[key].unit,
      };
    }
  }
  return { ncm: null, cest: null, unit: defaultUnit };
}

/**
 * Valida se uma string é um EAN-13 válido (13 dígitos numéricos).
 * Também valida o dígito verificador.
 */
function isValidEan13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;

  // Valida dígito verificador
  const digits = ean.split('').map(Number);
  const check = digits[12];
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const expectedCheck = (10 - (sum % 10)) % 10;
  return check === expectedCheck;
}

/**
 * Busca produtos de uma categoria via Open Food Facts API v2.
 * Retorna array de produtos normalizados.
 */
async function fetchCategoryProducts(category, maxPerCategory = 500) {
  const products = [];
  let page = 1;
  let hasMore = true;

  console.log(`\n  📦 Buscando: ${category}...`);

  while (hasMore && products.length < maxPerCategory) {
    const url = [
      'https://world.openfoodfacts.org/cgi/search.pl',
      `?action=process`,
      `&json=1`,
      `&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}`,
      `&tagtype_1=countries&tag_contains_1=contains&tag_1=brazil`,
      `&page_size=${PAGE_SIZE}`,
      `&page=${page}`,
      `&fields=code,product_name,product_name_pt,brands,categories_tags,quantity`,
      `&sort_by=unique_scans_n`, // Prioriza produtos mais escaneados (mais relevantes)
    ].join('');

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': '7Bar-PDV/1.0 (Sistema PDV para Adegas; reuse@openfoodfacts.org)',
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`  ⚠️  Rate limit atingido. Aguardando 3s...`);
          await sleep(3000);
          continue;
        }
        console.warn(`  ⚠️  HTTP ${res.status} para categoria ${category}, página ${page}`);
        break;
      }

      const data = await res.json();
      const pageProducts = data.products || [];

      if (pageProducts.length === 0) {
        hasMore = false;
        break;
      }

      for (const p of pageProducts) {
        const code = String(p.code || '').trim();
        if (!isValidEan13(code)) continue;

        // Usa nome em PT-BR se disponível, senão usa nome genérico
        const rawName = p.product_name_pt || p.product_name || '';
        const name = normalizeName(rawName);
        if (!name || name.length < 3) continue;

        const categoriesTags = p.categories_tags || [];
        const fiscal = getFiscalData(categoriesTags);
        const unit   = inferUnit(p, fiscal.unit);
        const brand  = normalizeName(p.brands?.split(',')[0]); // Primeira marca

        products.push({
          ean:      code,
          name,
          brand:    brand || null,
          ncm:      fiscal.ncm,
          cest:     fiscal.cest,
          unit,
          category: categoriesTags[0] || `en:${category}`,
          source:   'openfoodfacts',
        });
      }

      console.log(`    Página ${page}: ${products.length} produtos válidos acumulados`);
      page++;

      // Se retornou menos que PAGE_SIZE, não há mais páginas
      if (pageProducts.length < PAGE_SIZE) {
        hasMore = false;
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  ❌ Erro ao buscar ${category} pág ${page}:`, err.message);
      break;
    }
  }

  return products;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   7Bar — ETL Open Food Facts → Base Mestre de EANs  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Modo: ${DRY_RUN ? 'DRY RUN (sem inserção no banco)' : 'PRODUÇÃO (inserindo no banco)'}`);
  console.log(`Limite total: ${MAX_TOTAL} produtos`);
  console.log(`Categorias: ${SEARCH_CATEGORIES.length}`);
  console.log('');

  const allProducts = new Map(); // EAN → produto (deduplicação)
  const maxPerCategory = Math.ceil(MAX_TOTAL / SEARCH_CATEGORIES.length);

  for (const category of SEARCH_CATEGORIES) {
    if (allProducts.size >= MAX_TOTAL) {
      console.log(`\n✅ Limite de ${MAX_TOTAL} produtos atingido. Parando busca.`);
      break;
    }

    const catProducts = await fetchCategoryProducts(category, maxPerCategory);
    for (const p of catProducts) {
      if (!allProducts.has(p.ean)) {
        allProducts.set(p.ean, p);
      }
    }
    console.log(`  ✔ Total acumulado: ${allProducts.size} EANs únicos`);
  }

  const finalProducts = Array.from(allProducts.values()).slice(0, MAX_TOTAL);

  console.log(`\n📊 Resumo:`);
  console.log(`  Total de produtos coletados: ${finalProducts.length}`);
  console.log(`  Com NCM:  ${finalProducts.filter(p => p.ncm).length}`);
  console.log(`  Com CEST: ${finalProducts.filter(p => p.cest).length}`);
  console.log(`  Com marca: ${finalProducts.filter(p => p.brand).length}`);

  // Salva o JSON de seed para auditoria
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalProducts, null, 2), 'utf-8');
  console.log(`\n💾 Arquivo salvo: ${OUTPUT_FILE}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN: Nenhuma inserção no banco realizada.');
    console.log('   Remova --dry-run para inserir os dados.\n');
    return;
  }

  // ─── Inserção no Heart DB ──────────────────────────────────
  console.log('\n🔗 Conectando ao Heart DB...');

  // Carrega .env do backend
  try {
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
  } catch {
    // dotenv é opcional — DATABASE_URL_HEART pode estar no ambiente
  }

  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log(`⚙️  Inserindo ${finalProducts.length} produtos em batches de 500...`);

  let inserted = 0;
  let skipped  = 0;
  const BATCH  = 500;

  for (let i = 0; i < finalProducts.length; i += BATCH) {
    const batch = finalProducts.slice(i, i + BATCH);

    // upsert garante idempotência (pode rodar múltiplas vezes sem duplicar)
    const results = await Promise.allSettled(
      batch.map(p =>
        prisma.masterProduct.upsert({
          where:  { ean: p.ean },
          update: {
            name:     p.name,
            brand:    p.brand,
            ncm:      p.ncm,
            cest:     p.cest,
            unit:     p.unit,
            category: p.category,
          },
          create: p,
        })
      )
    );

    const batchInserted = results.filter(r => r.status === 'fulfilled').length;
    const batchSkipped  = results.filter(r => r.status === 'rejected').length;
    inserted += batchInserted;
    skipped  += batchSkipped;

    console.log(`  Batch ${Math.ceil((i + BATCH) / BATCH)}: ${batchInserted} ok, ${batchSkipped} erros`);
  }

  await prisma.$disconnect();

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  ✅ Importação concluída!                            ║`);
  console.log(`║     Inseridos/Atualizados: ${String(inserted).padEnd(26)}║`);
  console.log(`║     Erros:                 ${String(skipped).padEnd(26)}║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('\n❌ Erro fatal no ETL:', err);
  process.exit(1);
});
