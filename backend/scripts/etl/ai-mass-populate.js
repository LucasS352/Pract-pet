const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const fs = require('fs');
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

const PROGRESS_FILE = path.join(__dirname, 'progress.json');
const QUARANTINE_FILE = path.join(__dirname, 'quarantine.log');
const CATEGORIES_FILE = path.join(__dirname, 'categories-adega.json');

// --- UTILITÁRIOS ---

const delay = (ms) => new Promise(res => setTimeout(res, ms));

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completedCategories: [] };
}

function saveProgress(category) {
  const progress = loadProgress();
  if (!progress.completedCategories.includes(category)) {
    progress.completedCategories.push(category);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }
}

function logQuarantine(ean, name, reason) {
  const logMsg = `[${new Date().toISOString()}] EAN: ${ean} | Produto: ${name} | Motivo: ${reason}\n`;
  fs.appendFileSync(QUARANTINE_FILE, logMsg);
}

// --- CAMADA 1: VALIDAÇÃO MATEMÁTICA E SINTÁTICA ---

function isValidEAN13(ean) {
  if (!ean || typeof ean !== 'string' || !/^\d{13}$/.test(ean)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(ean[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(ean[12]);
}

function isValidNCM(ncm) {
  if (!ncm || typeof ncm !== 'string' || !/^\d{8}$/.test(ncm)) return false;
  return true;
}

// --- GERAÇÃO (PROMPT 1) ---

async function generateProductsBatch(category) {
  console.log(`\n⏳ [GERAÇÃO] Solicitando lote para a categoria: "${category}"...`);
  
  const prompt = `
Você é um sistema de banco de dados fiscal brasileiro.
Gere 50 produtos reais, populares e super específicos vendidos em distribuidoras de bebidas/adegas no Brasil, pertencentes exatamente a esta sub-categoria: "${category}".

Requisitos RIGOROSOS:
1. 'ean': Deve ser um EAN-13 matematicamente válido. Forneça o código exato se souber. NÃO crie sequências óbvias (ex: 7891000000014). Se inventar um EAN para ilustrar, o DÍGITO VERIFICADOR DEVE ESTAR CORRETO.
2. 'name': Nome comercial COMPLETO em PT-BR (Marca, tipo, volume/peso).
3. 'brand': A marca real do produto.
4. 'ncm': Código NCM válido (8 dígitos). (Cerveja=22030000, Água/Refri=2202, Destilados=2208, Tabaco=2402, etc).
5. 'cest': Código CEST (7 dígitos) se aplicável, ou null.
6. 'unit': "UN", "LT", "KG", "CX", ou "FD".

Responda ÚNICA E EXCLUSIVAMENTE com o array JSON puro. Nada mais.
Formato: [{"ean": "...", "name": "...", "brand": "...", "ncm": "...", "cest": "...", "unit": "..."}]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.3 }
    });

    let rawText = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(rawText);
  } catch (error) {
    console.error(`❌ [ERRO GERAÇÃO] Falha na API ou JSON inválido: ${error.message}`);
    return [];
  }
}

// --- CAMADA 2: AUDITORIA IA (PROMPT 2) ---

async function auditProducts(products) {
  console.log(`🕵️‍♂️ [AUDITORIA] Enviando ${products.length} produtos válidos matematicamente para checklist da IA...`);
  
  const prompt = `
Atue como um inspetor fiscal rígido e analise este array JSON de produtos.
Seu trabalho é identificar APENAS os produtos que são CLARAS ALUCINAÇÕES (ex: Nomes genéricos demais que não existem no mercado real, marcas que não fabricam aquele produto, ou códigos que você tem quase certeza que são falsos para esse item específico).

Retorne ÚNICA E EXCLUSIVAMENTE os códigos EAN dos produtos que foram REPROVADOS, separados por vírgula.
Se TODOS os produtos parecerem plausíveis e reais, responda exatamente e apenas com a palavra: OK

JSON para análise:
${JSON.stringify(products)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.1 }
    });

    const text = response.text.trim();
    
    if (text.toUpperCase() === 'OK') return [];
    
    // Extrai apenas os números (EANs rejeitados)
    return text.split(',').map(e => e.trim()).filter(e => /^\d{13}$/.test(e));
  } catch (error) {
    console.warn(`⚠️ [ERRO AUDITORIA] Falha ao auditar: ${error.message}`);
    throw error; // Lança para o loop de retentativas
  }
}

// --- ORQUESTRADOR PRINCIPAL ---

async function runMassPopulation() {
  if (!fs.existsSync(CATEGORIES_FILE)) {
    console.error("❌ ERRO: categories-adega.json não encontrado.");
    process.exit(1);
  }

  const allCategories = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
  const progress = loadProgress();
  
  const pendingCategories = allCategories.filter(c => !progress.completedCategories.includes(c));
  
  console.log(`🚀 Iniciando Mega-Povoamento.`);
  console.log(`📊 Total: ${allCategories.length} | Concluídos: ${progress.completedCategories.length} | Restantes: ${pendingCategories.length}`);
  
  if (pendingCategories.length === 0) {
    console.log("🎉 Todas as categorias já foram processadas!");
    return;
  }

  await heartPrisma.$connect();

  for (const category of pendingCategories) {
    let rawProducts = [];
    
    // Tentativas em caso de Rate Limit (429)
    let retries = 5;
    while (retries > 0) {
      rawProducts = await generateProductsBatch(category);
      if (rawProducts.length > 0) break;
      
      console.log(`⏳ [RATE LIMIT] Pausa de 10s. Tentativas restantes: ${retries - 1}`);
      await delay(10000); 
      retries--;
    }

    if (rawProducts.length === 0) {
      console.log(`⏭️ Puxando próxima categoria devido a falhas consecutivas.`);
      continue;
    }

    // --- FILTRO CAMADA 1 ---
    const layer1Valid = [];
    for (const prod of rawProducts) {
      if (!isValidEAN13(prod.ean)) {
        logQuarantine(prod.ean, prod.name, 'Camada 1: EAN-13 Matematicamente Inválido');
        continue;
      }
      if (!isValidNCM(prod.ncm)) {
        logQuarantine(prod.ean, prod.name, 'Camada 1: NCM Inválido (deve ter 8 dígitos)');
        continue;
      }
      layer1Valid.push(prod);
    }

    console.log(`✔️ Camada 1: ${layer1Valid.length}/${rawProducts.length} produtos passaram na validação matemática.`);

    if (layer1Valid.length === 0) {
      saveProgress(category);
      continue;
    }

    // --- FILTRO CAMADA 2 ---
    let rejectedEans = [];
    
    // Turbo: Delay mínimo
    await delay(1000);
    
    let auditRetries = 3;
    while (auditRetries > 0) {
      try {
        rejectedEans = await auditProducts(layer1Valid);
        break; 
      } catch (err) {
        console.log(`⏳ [RATE LIMIT AUDITORIA] Pausa de 10s...`);
        await delay(10000);
        auditRetries--;
      }
    }

    const finalProducts = layer1Valid.filter(p => !rejectedEans.includes(p.ean));
    
    for (const p of layer1Valid) {
      if (rejectedEans.includes(p.ean)) {
        logQuarantine(p.ean, p.name, 'Camada 2: Reprovado pela Auditoria Cruzada da IA (Alucinação)');
      }
    }

    console.log(`✔️ Camada 2: ${finalProducts.length}/${layer1Valid.length} produtos aprovados na auditoria final.`);

    // --- PERSISTÊNCIA ---
    let inserted = 0;
    for (const prod of finalProducts) {
      try {
        await heartPrisma.masterProduct.upsert({
          where: { ean: prod.ean },
          update: {
            name: prod.name,
            brand: prod.brand || 'Genérico',
            ncm: prod.ncm,
            cest: prod.cest || null,
            unit: prod.unit || 'UN',
            category: category,
            source: "gemini_mass_audit"
          },
          create: {
            ean: prod.ean,
            name: prod.name,
            brand: prod.brand || 'Genérico',
            ncm: prod.ncm,
            cest: prod.cest || null,
            unit: prod.unit || 'UN',
            category: category,
            source: "gemini_mass_audit"
          }
        });
        inserted++;
      } catch (err) {
        logQuarantine(prod.ean, prod.name, `Erro de Banco de Dados: ${err.message}`);
      }
    }

    console.log(`💾 Banco: ${inserted} produtos salvos com sucesso!`);
    
    // Salva progresso
    saveProgress(category);

    // Turbo: 2 segundos entre categorias
    console.log(`💤 [TURBO] Descansando 2 segundos antes da próxima categoria...\n`);
    await delay(2000);
  }

  await heartPrisma.$disconnect();
  console.log("🏁 MEGA-POVOAMENTO CONCLUÍDO COM SUCESSO!");
}

runMassPopulation();
