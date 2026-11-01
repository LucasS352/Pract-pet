#!/usr/bin/env node
/**
 * test-etl.js — Teste rápido do ETL
 * Busca 1 página de produtos sem filtro de país
 * e exibe os dados formatados para inspeção.
 *
 * Uso: node scripts/etl/test-etl.js [categoria]
 * Ex:  node scripts/etl/test-etl.js beers
 *      node scripts/etl/test-etl.js chocolates
 *      node scripts/etl/test-etl.js wines
 */

const CATEGORY = process.argv[2] || 'beers';
const PAGE_SIZE = 20; // só 20 para o teste ser rápido

const CATEGORY_MAP = {
  'en:beers':            { ncm: '22030000', cest: '0300100', unit: 'UN' },
  'en:wines':            { ncm: '22042100', cest: '0200900', unit: 'UN' },
  'en:sparkling-wines':  { ncm: '22041000', cest: '0200900', unit: 'UN' },
  'en:whiskies':         { ncm: '22083000', cest: '0200200', unit: 'UN' },
  'en:vodkas':           { ncm: '22086000', cest: '0200200', unit: 'UN' },
  'en:energy-drinks':    { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:mineral-waters':   { ncm: '22011000', cest: '0300500', unit: 'UN' },
  'en:chocolates':       { ncm: '18069000', cest: null,      unit: 'UN' },
  'en:milks':            { ncm: '04011000', cest: null,      unit: 'LT' },
  'en:instant-noodles':  { ncm: '19023000', cest: null,      unit: 'UN' },
  'en:soft-drinks':      { ncm: '22021000', cest: '0300600', unit: 'UN' },
  'en:coffee':           { ncm: '09011100', cest: null,      unit: 'UN' },
  'en:snacks':           { ncm: '19059090', cest: null,      unit: 'UN' },
  'en:cookies':          { ncm: '19059090', cest: null,      unit: 'UN' },
};

function isValidEan13(ean) {
  if (!/^\d{13}$/.test(ean)) return false;
  const digits = ean.split('').map(Number);
  const check = digits[12];
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return check === (10 - (sum % 10)) % 10;
}

function getFiscal(tags = []) {
  for (const t of tags) {
    if (CATEGORY_MAP[t.toLowerCase()]) return CATEGORY_MAP[t.toLowerCase()];
  }
  return { ncm: null, cest: null, unit: 'UN' };
}

async function main() {
  console.log('');
  console.log(`🔍 Testando categoria: ${CATEGORY}`);
  console.log(`   SEM filtro de país — busca global`);
  console.log('─'.repeat(70));

  // ── Requisição SEM country filter ──────────────────────────
  const url = [
    'https://world.openfoodfacts.org/cgi/search.pl',
    '?action=process&json=1',
    `&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(CATEGORY)}`,
    `&page_size=${PAGE_SIZE}&page=1`,
    '&fields=code,product_name,product_name_pt,brands,categories_tags,quantity,countries_tags',
    '&sort_by=unique_scans_n',
  ].join('');

  console.log(`\n[SEM PAÍS] Buscando...\n`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': '7Bar-PDV-Test/1.0' },
    });

    if (!res.ok) {
      console.error(`❌ HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    const products = data.products || [];
    console.log(`   Total na resposta: ${products.length} produtos`);
    console.log('');

    let valid = 0;
    let hasPortuguese = 0;

    for (const p of products.slice(0, 20)) {
      const code = String(p.code || '').trim();
      const namePt = p.product_name_pt || '';
      const nameEn = p.product_name || '';
      const name   = namePt || nameEn;
      const brand  = (p.brands || '').split(',')[0].trim();
      const fiscal = getFiscal(p.categories_tags || []);
      const countries = (p.countries_tags || []).join(', ');
      const eanOk = isValidEan13(code);

      if (!eanOk || !name || name.length < 3) continue;
      valid++;
      if (namePt) hasPortuguese++;

      // Linha de resultado
      console.log(`  EAN: ${code} | ${eanOk ? '✅' : '❌'}`);
      console.log(`  Nome PT : ${namePt || '—'}`);
      console.log(`  Nome EN : ${nameEn || '—'}`);
      console.log(`  Marca   : ${brand || '—'}`);
      console.log(`  NCM/CEST: ${fiscal.ncm || '—'} / ${fiscal.cest || '—'}`);
      console.log(`  Países  : ${countries.slice(0, 80) || '—'}`);
      console.log('─'.repeat(70));
    }

    console.log('');
    console.log(`📊 Resultado:`);
    console.log(`   Produtos válidos (EAN-13 + nome): ${valid}`);
    console.log(`   Com nome em PT-BR (product_name_pt): ${hasPortuguese}`);
    console.log(`   Sem nome PT (usa fallback EN): ${valid - hasPortuguese}`);
    console.log('');
    console.log('💡 Conclusão:');
    if (hasPortuguese === 0) {
      console.log('   ⚠️  Nenhum nome em PT-BR. Produtos virão em inglês.');
      console.log('   Sugestão: Adicionar tradução automática ou manter inglês mesmo.');
    } else if (hasPortuguese < valid / 2) {
      console.log(`   ⚠️  Só ${hasPortuguese}/${valid} têm nome PT-BR. Cobertura parcial.`);
    } else {
      console.log(`   ✅ ${hasPortuguese}/${valid} têm nome PT-BR. Boa cobertura!`);
    }

  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

main();
