const axios = require('axios');

async function testFetch() {
    try {
        console.log('Testing GET /api/products on localhost:3000...');
        const res = await axios.get('http://localhost:3000/api/products');
        console.log('Success! Status:', res.status, 'Count:', res.data.length);
    } catch (err) {
        console.error('Fetch failed! Message:', err.message);
        console.error('Code:', err.code);
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', err.response.data);
        }
    }
}

testFetch();
