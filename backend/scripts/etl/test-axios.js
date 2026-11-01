const axios = require('axios');

async function test() {
  try {
    console.log('Fetching...');
    const res = await axios.get('http://localhost:3520/api/products/lookup/7891991010412');
    console.log('Result:', res.data);
  } catch (err) {
    if (err.response) {
      console.log('Status Error:', err.response.status);
    } else {
      console.log('Network Error:', err.message);
    }
  }
}

test();
