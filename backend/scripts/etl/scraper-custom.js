const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function isValidEAN(ean) {
  if (!ean || !/^\d+$/.test(ean)) return false;
  
  // Apenas tamanhos oficiais de código de barras
  if (![8, 12, 13, 14].includes(ean.length)) return false;
  
  const digits = ean.split('').map(Number);
  const checkDigit = digits.pop(); // Remove e pega o último dígito
  
  // Inverte os dígitos restantes para o cálculo universal GTIN
  digits.reverse();
  
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // Multiplica alternadamente por 3 e 1
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

const CUSTOM_MAP = {
  // Bebidas Gerais
  "Refrigerante 2l": { ncm: "22021000", unit: "UN" },
  "Refrigerante": { ncm: "22021000", unit: "UN" },
  "Coca Cola": { ncm: "22021000", unit: "UN" },
  "Guaraná Antarctica": { ncm: "22021000", unit: "UN" },
  "Suco": { ncm: "20098990", unit: "UN" },
  "Energético": { ncm: "22029900", unit: "UN" },
  "Água Mineral": { ncm: "22011000", unit: "UN" },
  
  // Bebidas Específicas
  "Fanta Laranja 2 Litros": { ncm: "22021000", unit: "UN" },
  "Fanta Uva 2 Litros": { ncm: "22021000", unit: "UN" },
  "Sprite 2 Litros": { ncm: "22021000", unit: "UN" },
  "Pepsi 2 Litros": { ncm: "22021000", unit: "UN" },
  "Kuat 2 Litros": { ncm: "22021000", unit: "UN" },
  "Soda Antarctica 2 Litros": { ncm: "22021000", unit: "UN" },
  "Sukita 2 Litros": { ncm: "22021000", unit: "UN" },
  "Schweppes 1.5 Litros": { ncm: "22021000", unit: "UN" },
  
  // Limpeza
  "Detergente": { ncm: "34025000", unit: "UN" },
  "Sabão em Pó": { ncm: "34025000", unit: "UN" },
  "Amaciante": { ncm: "34025000", unit: "UN" },
  
  // Doces e Chocolates
  "Chocolate": { ncm: "18063220", unit: "UN" },
  "Bombom": { ncm: "18069000", unit: "UN" },
  "Doce": { ncm: "17049020", unit: "UN" },
  "Bala": { ncm: "17049020", unit: "UN" },
  "Chiclete": { ncm: "17041000", unit: "UN" },
  "Paçoca": { ncm: "20081100", unit: "UN" },
  
  // Biscoitos e Salgadinhos
  "Biscoito": { ncm: "19053100", unit: "UN" },
  "Bolacha": { ncm: "19053100", unit: "UN" },
  "Salgadinho": { ncm: "19059090", unit: "UN" },
  "Batata Palha": { ncm: "19059090", unit: "UN" },
  "Amendoim": { ncm: "20081100", unit: "UN" }
};

async function scrapeAtacadao(queryTerm) {
  console.log(`\n⚡ Iniciando varredura TURBO de '${queryTerm}'...`);
  
  const fiscalData = CUSTOM_MAP[queryTerm];
  if (!fiscalData) return 0;

  const MAX_PRODUCTS_PER_CATEGORY = 1000;
  const PAGE_SIZE = 49;
  let currentFrom = 0;
  let keepSearching = true;
  let totalNewCount = 0;
  let totalInvalidCount = 0;

  while (keepSearching && currentFrom < MAX_PRODUCTS_PER_CATEGORY) {
    try {
      const to = currentFrom + PAGE_SIZE;
      const url = `https://www.atacadao.com.br/api/catalog_system/pub/products/search?ft=${encodeURIComponent(queryTerm)}&_from=${currentFrom}&_to=${to}&O=OrderByTopSaleDESC`;
      
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const products = response.data;
      if (!products || products.length === 0) {
        keepSearching = false;
        break;
      }

      console.log(`📦 Encontrados ${products.length} itens (Página ${Math.floor(currentFrom/PAGE_SIZE) + 1}). Salvando...`);

      let newCount = 0;
      for (const p of products) {
        let ean = null;
        let imageUrl = null;

        if (p.items && p.items.length > 0) {
          if (p.items[0].ean) ean = p.items[0].ean.replace(/\D/g, '');
          if (p.items[0].images && p.items[0].images.length > 0) imageUrl = p.items[0].images[0].imageUrl;
        }

        if (ean && isValidEAN(ean)) {
          const exists = await heartPrisma.masterProduct.findUnique({ where: { ean } });
          if (!exists) {
            try {
              await heartPrisma.masterProduct.create({
                data: {
                  ean,
                  name: p.productName,
                  brand: p.brand || 'Genérico',
                  ncm: fiscalData.ncm,
                  cest: null,
                  unit: fiscalData.unit,
                  imageUrl: imageUrl,
                  category: queryTerm,
                  source: 'scraper_atacadao_turbo'
                }
              });
              newCount++;
              totalNewCount++;
            } catch (err) {}
          }
        } else if (ean) {
          // EAN extraído, mas a validação matemática falhou
          totalInvalidCount++;
        } else {
          // Nenhum EAN no produto
          totalInvalidCount++;
        }
      }
      
      console.log(`✅ +${newCount} novos produtos de '${queryTerm}' salvos! (Recusados por EAN inválido nesta página: ${products.length - newCount})`);
      currentFrom += PAGE_SIZE + 1;
      await delay(1000); 

    } catch (error) {
      console.error("❌ Erro:", error.message);
      keepSearching = false;
    }
  }
  
  return { newCount: totalNewCount, invalidCount: totalInvalidCount };
}

async function run() {
  await heartPrisma.$connect();
  
  console.log("🚀 INICIANDO SCRAPER DE PRODUTOS FALTANTES...");
  let totalAdicionadosGlobais = 0;
  let totalDescartadosGlobais = 0;
  
  for (const keyword of Object.keys(CUSTOM_MAP)) {
    const { newCount, invalidCount } = await scrapeAtacadao(keyword);
    totalAdicionadosGlobais += newCount;
    totalDescartadosGlobais += invalidCount;
  }

  await heartPrisma.$disconnect();
  console.log(`\n🎉 FINALIZADO!`);
  console.log(`📊 LOG DE RESULTADOS:`);
  console.log(`   ✅ ${totalAdicionadosGlobais} NOVOS produtos válidos inseridos na base.`);
  console.log(`   🚫 ${totalDescartadosGlobais} produtos foram REJEITADOS e barrados (EAN falso, erro de digitação ou sem código).`);
}

run();
