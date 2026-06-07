// scripts/test_grc_api.js
// Test script to check direct connectivity and response from the Standard GRC API

async function testConnection() {
  const url = 'https://standard-api.bekaa.eu/api/v1/scf/frameworks';
  const apiKey = process.env.STANDARD_GRC_API_KEY || 'standard_live_767965817f084242aa3e236d69ee99e48a100dfe81f047cca9314eff504b5e37';
  
  console.log('=== Retesting Standard GRC API Access ===');
  console.log('URL:', url);
  console.log('Using API Key:', apiKey === 'test-api-key' ? 'using placeholder key' : 'using configured key');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'x-standard-tenant-id': 'b4410209-e1c1-4b44-8dcf-9e92a7263941',
        'Accept': 'application/json'
      }
    });

    console.log('HTTP Status:', res.status);
    console.log('Headers:', JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
    
    const text = await res.text();
    console.log('Response Body:', text);
  } catch (err) {
    console.error('API Request failed:', err);
  }
}

testConnection();
