const fs = require('fs');
const path = require('path');

async function uploadFile(filePath) {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  
  const blob = new Blob([fileContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('category', 'ISMS_CORE');
  
  formData.append('forceIndex', 'true');
  formData.append('clarityReport', JSON.stringify({ status: 'UNCLEAR', issues: ['Forced by admin'] }));

  console.log('Uploading:', fileName);
  const res = await fetch('http://localhost:3000/api/documents/upload', {
    method: 'POST',
    body: formData
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

async function run() {
  await uploadFile('/mnt/c/Users/resper/OneDrive/Download-Sync/5a40e441-2721-4855-a5c2-46594550663f_32 2 (1).docx');
  await uploadFile('/mnt/c/Users/resper/OneDrive/Download-Sync/SAD - Solution Architecture Document_nCommand_Lite_v2.5.X_en-US (1).docx');
}

run();
