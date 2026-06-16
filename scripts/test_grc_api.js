// scripts/test_grc_api.js
// Test script to check direct connectivity and response from the Standard GRC API

async function testConnection() {
  const url = 'https://standard-api.bekaa.eu/api/v1/scf/frameworks';
  const apiKey = process.env.STANDARD_GRC_API_KEY || 'standard_live_ac466fee12964728a6da8a6fe759ff667f5a9a959dc64b3ea3f3e03fbd1c9f35';
  
  console.log('=== Retesting Standard GRC API Access ===');
  console.log('URL:', url);
  console.log('Using API Key:', apiKey === 'test-api-key' ? 'using placeholder key' : 'using configured key');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'x-standard-tenant-id': process.env.STANDARD_GRC_TENANT_ID || '00000001-0000-0000-0000-000000000001',
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
