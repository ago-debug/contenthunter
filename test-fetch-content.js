const axios = require('axios');

async function testFetch() {
    try {
        console.log('Testing GET /api/products and checking content...');
        const res = await axios.get('http://localhost:3000/api/products');
        console.log('Count:', res.data.length);
        console.log('First Item:', JSON.stringify(res.data[0], null, 2));
    } catch (err) {
        console.error('Fetch failed!', err.message);
    }
}

testFetch();
