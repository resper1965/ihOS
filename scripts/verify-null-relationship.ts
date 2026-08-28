// Confirm the column now accepts an unrecorded relationship, and clean up after.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const V = '8260df81-979f-4eab-a525-26550ad95d79';
const PROBE_REQ = '__nullability_probe__';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient() as any;

  const { error: insErr } = await db.from('scf_control_mappings').upsert(
    [{
      scf_version_id: V,
      control_code: 'AAT-01',
      framework_code: 'ISO 27001 2022',
      requirement_code: PROBE_REQ,
      relationship_type: null,
      is_official: true,
      is_synthetic: false,
      strength_is_trustworthy: true,
    }],
    { onConflict: 'scf_version_id,control_code,framework_code,requirement_code' },
  );
  console.log('null relationship_type accepted:', insErr ? 'NO — ' + insErr.message : 'YES');

  // A sixth value must still be refused by the CHECK.
  const { error: sixthErr } = await db.from('scf_control_mappings').upsert(
    [{
      scf_version_id: V,
      control_code: 'AAT-01',
      framework_code: 'ISO 27001 2022',
      requirement_code: PROBE_REQ + '_6th',
      relationship_type: 'partially_maybe',
      is_official: true,
      is_synthetic: false,
      strength_is_trustworthy: true,
    }],
    { onConflict: 'scf_version_id,control_code,framework_code,requirement_code' },
  );
  console.log(
    'sixth value still refused    :',
    sixthErr ? 'YES — ' + sixthErr.message.slice(0, 70) : 'NO — the CHECK is not guarding',
  );

  // Remove both probes.
  await db.from('scf_control_mappings').delete().eq('scf_version_id', V).eq('requirement_code', PROBE_REQ);
  await db.from('scf_control_mappings').delete().eq('scf_version_id', V).eq('requirement_code', PROBE_REQ + '_6th');

  const { count } = await db
    .from('scf_control_mappings')
    .select('control_code', { count: 'exact', head: true })
    .eq('scf_version_id', V);
  console.log(`\nprobes removed. mappings: ${count}`);
}

main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
