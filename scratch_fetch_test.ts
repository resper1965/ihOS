import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testInsert() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/compliance_documents';
  const apikey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': apikey,
      'Authorization': 'Bearer ' + apikey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      filename: 'test.pdf',
      filepath: 'test/test.pdf',
      doc_type: 'pdf',
      category: 'ISMS_CORE',
      title: 'test',
      status: 'draft',
      clarity_report: { status: 'UNCLEAR', issues: [] }
    })
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}

testInsert();
