const { GoogleGenAI } = require('@google/genai');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.GEMINI_API_KEY;

async function test() {
  console.log("🔍 Testando API Key: " + apiKey.substring(0, 10) + "...");
  const genAI = new GoogleGenAI(apiKey);
  
  try {
    // Tenta listar os modelos disponíveis
    // Nota: listModels pode não estar disponível em todas as versões do SDK, 
    // mas vamos tentar gerar um conteúdo simples com o modelo base.
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Diga 'API FUNCIONANDO'");
    const response = await result.response;
    console.log("✅ RESPOSTA DA API: " + response.text());
  } catch (error) {
    console.error("❌ ERRO NO TESTE:");
    console.error(error.message);
    
    console.log("\n💡 Dica: Se deu 404, vamos tentar listar os modelos...");
    // Em algumas versões do SDK é genAI.listModels()
  }
}

test();
