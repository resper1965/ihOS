const { createClient } = require('@supabase/supabase-js');

// Load env vars from .env file
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uomdcazsriznqytvnsrv.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Querying intelligence_snapshots...');
  const { data: rawSnapshot, error } = await supabase
    .from('intelligence_snapshots')
    .select('*')
    .eq('snapshot_type', 'scorecard')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('rawSnapshot keys:', Object.keys(rawSnapshot || {}));
  console.log('rawSnapshot snapshot_data:', JSON.stringify(rawSnapshot?.snapshot_data, null, 2));
}

test();
