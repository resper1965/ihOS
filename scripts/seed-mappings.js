const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parse .env manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] ? match[2].trim() : '').replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Service Role Key in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchAllMappings(frameworkCode) {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    console.log(`Fetching page ${page} for ${frameworkCode}...`);
    const { data, error } = await supabase
      .from('scf_framework_mappings')
      .select('*')
      .eq('framework_code', frameworkCode)
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      break;
    }
    
    allData = allData.concat(data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }
  
  return allData;
}

async function upsertInBatches(rows) {
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Upserting batch of ${batch.length} rows...`);
    const { error } = await supabase
      .from('scf_framework_mappings')
      .upsert(batch, { onConflict: 'framework_code,target_control_id,scf_control_code' });
      
    if (error) {
      console.error("Upsert batch error:", error);
      throw error;
    }
  }
}

async function main() {
  console.log("Fetching all existing mappings...");
  
  // 1. Fetch all iso27001 mappings
  const iso27001Mappings = await fetchAllMappings('iso27001');
  console.log(`Found total ${iso27001Mappings.length} mappings for iso27001`);

  // 2. Fetch all iso27701 mappings
  const iso27701Mappings = await fetchAllMappings('iso27701');
  console.log(`Found total ${iso27701Mappings.length} mappings for iso27701`);

  // 3. Clone to BR-LGPD (from iso27701)
  if (iso27701Mappings.length > 0) {
    const lgpdRows = iso27701Mappings.map(m => ({
      framework_code: 'BR-LGPD',
      target_control_id: `LGPD-${m.target_control_id}`,
      scf_control_code: m.scf_control_code,
      synced_at: new Date().toISOString()
    }));
    
    console.log(`Cloning ${lgpdRows.length} mappings to BR-LGPD...`);
    await upsertInBatches(lgpdRows);
    console.log("BR-LGPD mappings cloned successfully.");

    // 4. Clone to EU-GDPR (from iso27701)
    const gdprRows = iso27701Mappings.map(m => ({
      framework_code: 'EU-GDPR',
      target_control_id: `GDPR-${m.target_control_id}`,
      scf_control_code: m.scf_control_code,
      synced_at: new Date().toISOString()
    }));

    console.log(`Cloning ${gdprRows.length} mappings to EU-GDPR...`);
    await upsertInBatches(gdprRows);
    console.log("EU-GDPR mappings cloned successfully.");
  }

  // 5. Clone to HI-2013 (from iso27001)
  if (iso27001Mappings.length > 0) {
    const hipaaRows = iso27001Mappings.map(m => ({
      framework_code: 'HI-2013',
      target_control_id: `HIPAA-${m.target_control_id}`,
      scf_control_code: m.scf_control_code,
      synced_at: new Date().toISOString()
    }));

    console.log(`Cloning ${hipaaRows.length} mappings to HI-2013...`);
    await upsertInBatches(hipaaRows);
    console.log("HI-2013 mappings cloned successfully.");
  }
}

main().catch(console.error);
