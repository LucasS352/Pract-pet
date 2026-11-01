const { PrismaClient: HeartPrismaClient } = require('../../src/generated/heart-client');
const { GoogleGenAI } = require('@google/genai');
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

async function generateProducts(category, count) {
  console.log(`🤖 Solicitando ${count} produtos da categoria '${category}' para a IA (Gemini 1.5 Flash)...`);
  
  const prompt = `
Você é um sistema de catálogo fiscal brasileiro especializado no segmento de varejo/conveniência.
Por favor, gere uma lista de exatamente ${count} produtos brasileiros reais, populares e de marcas reconhecidas da categoria "${category}".

Requisitos rigorosos:
1. 'ean': Deve ser um código de barras EAN-13 válido (13 dígitos numéricos). O código deve fazer sentido para a marca e não deve ser um número inventado aleatoriamente se possível, caso contrário gere um ean válido compatível com o produto.
2. 'name': Nome comercial completo do produto em PT-BR (Ex: "Cerveja Heineken Long Neck 330ml").
3. 'brand': A marca do produto (Ex: "Heineken", "Ambev", "Coca-Cola", "Elma Chips").
4. 'ncm': Código NCM válido (8 dígitos numéricos) exatamente compatível com a categoria do produto no Brasil.
5. 'cest': Código CEST válido (7 dígitos numéricos) se o produto possuir substituição tributária (muito comum em bebidas e salgadinhos). Se não tiver, envie null.
6. 'unit': Unidade de medida (retorne apenas "UN", "LT", "FD", "CX", ou "KG"). Para bebidas e pacotes, geralmente é "UN".

Responda ÚNICA E EXCLUSIVAMENTE no formato de um array JSON com essa estrutura:
[
  { "ean": "7891021000109", "name": "...", "brand": "...", "ncm": "22030000", "cest": "0302100", "unit": "UN" }
]

NÃO inclua texto fora do JSON. Não inclua blocos de código (\`\`\`json). Apenas o array JSON puro.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // Baixa temperatura para resultados mais consistentes e menos inventados
      }
    });

    let rawText = response.text;
    
    // Limpar markdown de json se a IA teimosamente enviar
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const products = JSON.parse(rawText);
    
    if (!Array.isArray(products) || products.length === 0) {
      throw new Error("A IA não retornou um array de produtos válido.");
    }

    return products;
  } catch (error) {
    console.error("❌ Erro ao comunicar com a API da Gemini ou parsear JSON:", error.message);
    process.exit(1);
  }
}

async function populate() {
  const args = process.argv.slice(2);
  const category = args[0] || "Cervejas";
  const count = parseInt(args[1]) || 10; // Cuidado com limite de tokens, 10-30 é um bom tamanho por lote

  try {
    await heartPrisma.$connect();
    
    const products = await generateProducts(category, count);
    console.log(`✅ IA gerou ${products.length} produtos. Iniciando inserção no banco MasterProduct...`);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const prod of products) {
      try {
        // Usa o EAN como identificador único
        const result = await heartPrisma.masterProduct.upsert({
          where: { ean: prod.ean },
          update: {
            name: prod.name,
            brand: prod.brand,
            ncm: prod.ncm,
            cest: prod.cest,
            unit: prod.unit,
            category: category,
            source: "gemini_ai" // Rastreamos que veio da IA
          },
          create: {
            ean: prod.ean,
            name: prod.name,
            brand: prod.brand,
            ncm: prod.ncm,
            cest: prod.cest,
            unit: prod.unit,
            category: category,
            source: "gemini_ai"
          }
        });
        insertedCount++;
        process.stdout.write(`✅ Upsert: [${prod.ean}] ${prod.name} (NCM: ${prod.ncm})\n`);
      } catch (err) {
        skippedCount++;
        console.error(`⚠️ Erro ao salvar produto [${prod.ean}]: ${err.message}`);
      }
    }

    console.log(`\n🎉 Operação concluída! Categoria: ${category}`);
    console.log(`- Produtos processados: ${insertedCount}`);
    console.log(`- Produtos com erro/ignorados: ${skippedCount}`);

  } catch (error) {
    console.error("❌ Erro no script de povoamento:", error);
  } finally {
    await heartPrisma.$disconnect();
  }
}

populate();
