const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ ERRO: A variável GEMINI_API_KEY não foi encontrada no .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const heartPrisma = new HeartPrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_HEART } }
});

// Delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Validação matemática universal do EAN (GTIN-8, EAN-13, DUN-14)
function isValidEAN(ean) {
  if (!ean || !/^\d+$/.test(ean)) return false;
  if (![8, 12, 13, 14].includes(ean.length)) return false;
  
  const digits = ean.split('').map(Number);
  const checkDigit = digits.pop(); 
  
  digits.reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  
  return ((10 - (sum % 10)) % 10) === checkDigit;
}

// Pergunta para a IA classificar o NCM e CEST
async function enrichProductData(name, brand, category) {
  const prompt = `
Você é um especialista tributário brasileiro (SEFAZ).
Vou te passar o nome de um produto real extraído de um supermercado, e você me devolverá APENAS os códigos NCM e CEST desse produto.

Produto: "${name}"
Marca: "${brand}"
Categoria Geral: "${category}"

Responda ÚNICA E EXCLUSIVAMENTE em formato JSON com esta estrutura:
{
  "ncm": "8 dígitos numéricos válidos e exatos para esse produto",
  "cest": "7 dígitos numéricos (se tiver substituição tributária) ou null",
  "unit": "Retorne 'UN', 'LT', 'FD' ou 'KG' dependendo do tipo do produto"
}
Não coloque blocos de código markdown (\`\`\`json). Apenas o JSON puro.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.1 }
    });

    let rawText = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
  } catch (err) {
    console.error(`⚠️ Erro ao enriquecer produto com IA: ${err.message}`);
    return null;
  }
}

const cheerio = require('cheerio');

async function scrapeMercadoLivre(queryTerm) {
  console.log(`\n🔍 Raspando HTML de '${queryTerm}' no Mercado Livre...`);
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  };

  try {
    const searchUrl = `https://lista.mercadolivre.com.br/${queryTerm.toLowerCase().replace(/ /g, '-')}`;
    
    const response = await axios.get(searchUrl, { headers });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().toLowerCase();
    if (pageTitle.includes('validar') || pageTitle.includes('captcha')) {
      console.log(`⚠️ Fomos bloqueados pelo CAPTCHA do Mercado Livre na busca!`);
      return;
    }

    // Pega os links dos produtos na primeira página (Novo Layout "Poly" do ML)
    const productLinks = [];
    $('a').each((i, el) => {
      const link = $(el).attr('href');
      // Identifica links de produtos reais (ex: /MLB-1234...) e evita propagandas
      if (link && link.includes('MLB') && !link.includes('click1') && productLinks.length < 15) {
        // Remover query params de tracking para focar no produto
        const cleanLink = link.split('?')[0].split('#')[0];
        // Garantir que é um link absoluto
        const finalLink = cleanLink.startsWith('http') ? cleanLink : `https://produto.mercadolivre.com.br${cleanLink}`;
        
        if (!productLinks.includes(finalLink)) {
          productLinks.push(finalLink);
        }
      }
    });

    if (productLinks.length === 0) {
      console.log(`Nenhum link de produto detectado no HTML para '${queryTerm}'. O ML pode ter mudado o layout.`);
      return;
    }

    console.log(`📦 Encontrados ${productLinks.length} anúncios. Entrando em cada um para extrair o EAN...`);

    let validProducts = [];

    // Visitar cada produto para extrair especificações
    for (const link of productLinks) {
      try {
        const prodResponse = await axios.get(link, { headers });
        const $prod = cheerio.load(prodResponse.data);
        
        const title = $prod('h1.ui-pdp-title').text().trim();
        let ean = null;
        let brand = 'Genérico';

        // Tabela de especificações do ML
        $prod('table.ui-pdp-specs__table tr').each((i, row) => {
          const th = $prod(row).find('th').text().trim().toLowerCase();
          const td = $prod(row).find('td').text().trim();
          
          if (th.includes('código universal de produto')) {
            ean = td.replace(/\D/g, ''); // Apenas números
          }
          if (th.includes('marca')) {
            brand = td;
          }
        });

        if (ean && isValidEAN(ean)) {
          if (!validProducts.find(p => p.ean === ean)) {
            validProducts.push({ ean, name: title, brand });
            process.stdout.write(`+ [${ean}] ${title.substring(0, 30)}...\n`);
          }
        }
        
        // Pausa entre anúncios para evitar bloqueio
        await delay(2000);
      } catch (err) {
        process.stdout.write(`x (Falha ao ler anúncio) `);
      }
    }

    console.log(`\n✔️ Desta página, ${validProducts.length} possuem EAN-13 válido na tabela!`);

    if (validProducts.length === 0) return;

    console.log(`🤖 Iniciando enriquecimento fiscal com IA (Gemini)...`);
    
    for (const prod of validProducts) {
      const exists = await heartPrisma.masterProduct.findUnique({ where: { ean: prod.ean } });
      if (exists) {
        console.log(`⏭️ Ignorando [${prod.ean}] (Já cadastrado).`);
        continue;
      }

      console.log(`⏳ Enriquecendo: [${prod.ean}] ${prod.name}`);
      const enrichedData = await enrichProductData(prod.name, prod.brand, queryTerm);
      
      if (!enrichedData || !enrichedData.ncm) {
        console.log(`❌ Falha ao descobrir NCM para [${prod.ean}]. Pulando.`);
        continue;
      }

      try {
        await heartPrisma.masterProduct.create({
          data: {
            ean: prod.ean,
            name: prod.name,
            brand: prod.brand,
            ncm: enrichedData.ncm,
            cest: enrichedData.cest,
            unit: enrichedData.unit || 'UN',
            category: queryTerm,
            source: 'scraper_ml_html'
          }
        });
        console.log(`💾 Salvo no Banco: [${prod.ean}] NCM: ${enrichedData.ncm}`);
      } catch (dbErr) {
        console.error(`❌ Erro no banco:`, dbErr.message);
      }

      await delay(1500);
    }

  } catch (error) {
    console.error("❌ Erro grave ao acessar a busca do Mercado Livre:", error.message);
  }
}

async function run() {
  await heartPrisma.$connect();
  
  const keywords = [
    "Refrigerante Coca-Cola 2 Litros",
    "Refrigerante Guaraná Antarctica 2 Litros",
    "Refrigerante Fanta Laranja 2 Litros",
    "Refrigerante Sprite 2 Litros",
    "Refrigerante Pepsi 2 Litros",
    "Refrigerante Kuat 2 Litros"
  ];

  for (const keyword of keywords) {
    await scrapeMercadoLivre(keyword);
    console.log(`💤 Descansando 10 segundos antes da próxima busca...\n`);
    await delay(10000);
  }

  await heartPrisma.$disconnect();
  console.log("🎉 Mega Scraping HTML finalizado!");
}

run();
