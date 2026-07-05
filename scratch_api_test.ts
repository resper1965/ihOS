import fs from 'fs';

async function run() {
  const fileContent = Buffer.from('test pdf content');
  
  const blob = new Blob([fileContent], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, 'test.pdf');
  formData.append('category', 'ISMS_CORE');
  formData.append('clarityReport', JSON.stringify({ status: 'UNCLEAR', issues: [] }));

  const res = await fetch('http://localhost:3000/api/documents/upload', {
    method: 'POST',
    body: formData
  });

  console.log(res.status);
  console.log(await res.text());
}
run();
