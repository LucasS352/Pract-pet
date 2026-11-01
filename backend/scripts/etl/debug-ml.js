const axios = require('axios');
const cheerio = require('cheerio');

async function debug() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
  };

  try {
    const response = await axios.get('https://lista.mercadolivre.com.br/cerveja-lata', { headers });
    const $ = cheerio.load(response.data);
    
    console.log("Título da página:", $('title').text());
    
    let links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const classList = $(el).attr('class');
      if (href && href.includes('MLB') && !href.includes('click1')) {
        links.push({ class: classList, href: href.substring(0, 80) + '...' });
      }
    });

    console.log("Links de produtos encontrados:", links.slice(0, 5));
    
  } catch (err) {
    console.log("Erro:", err.message);
  }
}

debug();
