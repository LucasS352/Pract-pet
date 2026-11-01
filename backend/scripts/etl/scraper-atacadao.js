const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function isValidEAN13(ean) {
  if (!ean || !/^\d{13}$/.test(ean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(ean[12]);
}

// ── DICIONÁRIO FISCAL TURBO (Sem IA) ──────────────────────────────────────────
const FISCAL_MAP = {
  // Mercearia
  "Leite Integral": { ncm: "04012010", unit: "LT" },
  "Nescau": { ncm: "18069000", unit: "UN" },
  "Café Torrado": { ncm: "09012100", unit: "UN" },
  "Açúcar Refinado": { ncm: "17019900", unit: "KG" },
  "Óleo de Soja": { ncm: "15079011", unit: "UN" },
  "Arroz 5kg": { ncm: "10063021", unit: "FD" },
  "Feijão Carioca": { ncm: "07133319", unit: "KG" },
  "Macarrão Espaguete": { ncm: "19021900", unit: "UN" },
  "Miojo": { ncm: "19023000", unit: "UN" },
  
  // Limpeza e Higiene
  "Papel Higiênico": { ncm: "48181000", unit: "FD" },
  "Detergente Líquido": { ncm: "34025000", unit: "UN" },
  "Sabão em Pó": { ncm: "34025000", unit: "UN" },
  "Amaciante": { ncm: "34025000", unit: "UN" },
  "Sabonete": { ncm: "34011190", unit: "UN" },
  "Creme Dental": { ncm: "33061000", unit: "UN" },
  
  // Conveniência / Descartáveis
  "Carvão": { ncm: "44029000", unit: "KG" },
  "Gelo": { ncm: "22011000", unit: "KG" },
  "Copo Descartável": { ncm: "39241000", unit: "PCT" },
  "Prato Descartável": { ncm: "39241000", unit: "PCT" },
  "Guardanapo": { ncm: "48183000", unit: "PCT" },
  
  // Guloseimas
  "Chocolate Barra": { ncm: "18063220", unit: "UN" },
  "Caixa de Bombom": { ncm: "18069000", unit: "CX" },
  "Biscoito Recheado": { ncm: "19053100", unit: "UN" },
  "Biscoito": { ncm: "19059090", unit: "UN" },
  "Bala Halls": { ncm: "17049020", unit: "UN" },
  "Chiclete Trident": { ncm: "17041000", unit: "UN" },
  "Salgadinho": { ncm: "19059090", unit: "UN" },
  "Batata Pringles": { ncm: "19059090", unit: "UN" },
  "Batata Frita": { ncm: "19059090", unit: "UN" },
  "Amendoim Japonês": { ncm: "20081100", unit: "UN" },
  "Salgadinho Torcida": { ncm: "19059090", unit: "UN" },
  
  // Tabacaria e Conveniência Clássica
  "Cigarro": { ncm: "24022000", unit: "UN" },
  "Essência Zomo": { ncm: "24031100", unit: "UN" },
  "Isqueiro": { ncm: "96132000", unit: "UN" },
  "Fósforo": { ncm: "36050000", unit: "UN" },
  "Preservativo": { ncm: "40141000", unit: "UN" },

  // Cuidados Pessoais / Perfumaria (Alto Giro em Conveniência)
  "Fralda Descartável": { ncm: "96190000", unit: "PCT" },
  "Shampoo": { ncm: "33051000", unit: "UN" },
  "Condicionador": { ncm: "33052000", unit: "UN" },
  "Desodorante": { ncm: "33072010", unit: "UN" },
  "Aparelho de Barbear": { ncm: "82122010", unit: "UN" },

  // Bebidas (Repescagem em Massa para garantir tudo)
  "Cerveja Lata": { ncm: "22030000", unit: "UN" },
  "Cerveja Long Neck": { ncm: "22030000", unit: "UN" },
  "Refrigerante 2 Litros": { ncm: "22021000", unit: "UN" },
  "Refrigerante Lata": { ncm: "22021000", unit: "UN" },
  "Vinho Tinto": { ncm: "22042100", unit: "UN" },
  "Vodka": { ncm: "22086000", unit: "UN" },
  "Gin": { ncm: "22085000", unit: "UN" },
  "Whisky": { ncm: "22083020", unit: "UN" },

  // Específicos de Disk Bebidas / Adega (Itens de Ouro)
  "Licor": { ncm: "22087000", unit: "UN" },
  "Tequila": { ncm: "22089020", unit: "UN" },
  "Rum": { ncm: "22084000", unit: "UN" },
  "Conhaque": { ncm: "22082000", unit: "UN" },
  "Campari": { ncm: "22089090", unit: "UN" },
  "Aperol": { ncm: "22089090", unit: "UN" },
  "Corote": { ncm: "22060090", unit: "UN" },
  "Catuaba": { ncm: "22060090", unit: "UN" },
  "Isotônico": { ncm: "22029900", unit: "UN" },
  "Gatorade": { ncm: "22029900", unit: "UN" },
  "Suco Integral": { ncm: "20098990", unit: "UN" },
  "Água Tônica": { ncm: "22021000", unit: "UN" },
  "Xarope Monin": { ncm: "21069090", unit: "UN" },
  "Gelo de Coco": { ncm: "22029900", unit: "UN" },
  "Sal Grosso": { ncm: "25010020", unit: "KG" },
  "Limão": { ncm: "08055000", unit: "KG" },
  "Copão": { ncm: "39241000", unit: "PCT" }
};

async function scrapeAtacadao(queryTerm) {
  console.log(`\n⚡ Iniciando varredura TURBO de '${queryTerm}'...`);
  
  const fiscalData = FISCAL_MAP[queryTerm];
  if (!fiscalData) {
    console.log(`⚠️ Sem mapa fiscal para '${queryTerm}'. Pulando...`);
    return;
  }

  const MAX_PRODUCTS_PER_CATEGORY = 1000;
  const PAGE_SIZE = 49;
  let currentFrom = 0;
  let keepSearching = true;

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

      console.log(`📦 Encontrados ${products.length} itens. Salvando em massa...`);

      let newCount = 0;
      for (const p of products) {
        let ean = null;
        let imageUrl = null;

        if (p.items && p.items.length > 0) {
          if (p.items[0].ean) ean = p.items[0].ean.replace(/\D/g, '');
          if (p.items[0].images && p.items[0].images.length > 0) imageUrl = p.items[0].images[0].imageUrl;
        }

        if (ean && isValidEAN13(ean)) {
          const exists = await heartPrisma.masterProduct.findUnique({ where: { ean } });
          if (!exists) {
            try {
              await heartPrisma.masterProduct.create({
                data: {
                  ean,
                  name: p.productName,
                  brand: p.brand || 'Genérico',
                  ncm: fiscalData.ncm,
                  cest: null, // Sem AI, deixamos CEST nulo por padrão (menos crítico que NCM)
                  unit: fiscalData.unit,
                  imageUrl: imageUrl,
                  category: queryTerm,
                  source: 'scraper_atacadao_turbo'
                }
              });
              newCount++;
            } catch (err) {}
          }
        }
      }
      
      console.log(`✅ +${newCount} produtos salvos! (Próxima página...)`);
      currentFrom += PAGE_SIZE + 1;
      await delay(1000); // 1 segundo de respiro só pra não derrubar a VTEX do Atacadão

    } catch (error) {
      console.error("❌ Erro:", error.message);
      keepSearching = false;
    }
  }
}

async function run() {
  await heartPrisma.$connect();
  
  for (const keyword of Object.keys(FISCAL_MAP)) {
    await scrapeAtacadao(keyword);
  }

  await heartPrisma.$disconnect();
  console.log("🚀 Pipeline TURBO finalizado com sucesso!");
}

run();
