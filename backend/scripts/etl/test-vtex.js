const axios = require('axios');

async function testVtex() {
  console.log("Testando API do Atacadão (VTEX)...");
  try {
    const url = 'https://www.atacadao.com.br/api/catalog_system/pub/products/search?ft=cerveja';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const products = response.data;
    console.log(`Encontrados ${products.length} produtos.`);
    
    if (products.length > 0) {
      const p = products[0];
      console.log("Nome:", p.productName);
      console.log("Marca:", p.brand);
      
      // EAN na VTEX geralmente fica em items[0].ean ou algo assim
      if (p.items && p.items.length > 0) {
        console.log("EAN:", p.items[0].ean);
      }
    }
  } catch (err) {
    console.error("Erro VTEX:", err.message);
  }
}

testVtex();
