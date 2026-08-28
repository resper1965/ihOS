// Is the crosswalk walk complete? Answered from the data, not from a log.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const V = '8260df81-979f-4eab-a525-26550ad95d79';

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient() as any;

  const readAll = async (table: string, cols: string) => {
    const out: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from(table).select(cols).eq('scf_version_id', V)
        .order('control_code').range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  };

  const controls = await readAll('scf_controls_cache', 'control_code');
  const mapped = new Set((await readAll('scf_control_mappings', 'control_code')).map((r) => r.control_code));

  const missing = controls.filter((c) => !mapped.has(c.control_code)).map((c) => c.control_code);

  console.log(`controls in catalogue     : ${controls.length}`);
  console.log(`controls with mappings    : ${mapped.size}`);
  console.log(`controls WITHOUT mappings : ${missing.length}`);
  if (missing.length > 0) {
    console.log(`  first 12: ${missing.slice(0, 12).join(', ')}`);
  } else {
    console.log('\n>>> WALK COMPLETE — every control has at least one mapping.');
  }

  // What the crosswalk actually holds, for the iso27001 lens specifically.
  const { count: isoRows } = await db
    .from('scf_control_mappings')
    .select('control_code', { count: 'exact', head: true })
    .eq('scf_version_id', V)
    .eq('framework_code', 'ISO 27001 2022');
  console.log(`\nmappings for "ISO 27001 2022": ${isoRows}`);

  // Relationship spread — this is what the curation policy will act on.
  for (const t of ['equal', 'subset', 'superset', 'intersects', 'no_relation']) {
    const { count } = await db
      .from('scf_control_mappings')
      .select('control_code', { count: 'exact', head: true })
      .eq('scf_version_id', V)
      .eq('relationship_type', t);
    console.log(`  ${t.padEnd(12)} ${count}`);
  }

  const { count: voidStrength } = await db
    .from('scf_control_mappings')
    .select('control_code', { count: 'exact', head: true })
    .eq('scf_version_id', V)
    .eq('strength_is_trustworthy', false);
  console.log(`\nrows with the void 0.500 strength: ${voidStrength}`);
}

main().catch((e) => { console.error('FATAL:', e instanceof Error ? e.message : e); process.exit(1); });
