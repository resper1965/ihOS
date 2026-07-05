import fs from 'fs';
import dotenv from 'dotenv';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const url = envConfig.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/match_documents_hybrid';
const key = envConfig.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query_text: "test",
      query_embedding: new Array(1536).fill(0),
      match_threshold: 0.0,
      match_count: 1
    })
  });
  const data = await res.json();
  if (data.error || data.message) console.error(data);
  else console.log(Object.keys(data[0] || {}));
}

main();
