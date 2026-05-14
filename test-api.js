const axios = require('axios');
axios.post('http://localhost:3000/api/ai/describe', {
  productData: { sku: 'TEST', title: 'Test Product' },
  language: 'it'
}).then(res => console.log(res.data)).catch(err => console.error(err.response ? err.response.data : err.message));
