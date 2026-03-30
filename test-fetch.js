const axios = require('axios');

async function testFetch() {
    try {
        console.log('Testing GET /api/products...');
        const start = Date.now();
        const res = await axios.get('http://localhost:3000/api/products');
        const end = Date.now();
        console.log('Success!');
        console.log('Response status:', res.status);
        console.log('Count:', res.data.length);
        console.log('Time taken:', end - start, 'ms');
    } catch (err) {
        console.error('Fetch failed:');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', err.response.data);
        } else {
            console.error('Message:', err.message);
        }
    }
}

testFetch();
