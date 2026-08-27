// Operator script: run the SCF sync from the command line.
//
// Same functions the route calls (src/lib/standard-api/sync/*), so this is not a
// second implementation that can drift. The route exists for a browser session;
// this exists for an operator with the service-role key, which is the only way
// to run the ~13-minute crosswalk walk outside a serverless timeout.
//
//   npx tsx scripts/run-scf-sync.ts verify
//   npx tsx scripts/run-scf-sync.ts catalog
//   npx tsx scripts/run-scf-sync.ts crosswalk [resumeAfterControlCode]
//
// Reads .env then .env.local, in that order, so .env.local wins.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const stage = process.argv[2] ?? 'verify';
const resumeAfter = process.argv[3];

async function main() {
  const { createThrottle } = await import('../src/lib/standard-api/sync/throttle');
  const { getLatestScfVersionId, syncControlCatalog, syncFrameworkCatalog } = await import(
    '../src/lib/standard-api/sync/catalog'
  );
  const { createAdminClient } = await import('../src/lib/supabase/admin');

  const throttle = createThrottle();
  const db = createAdminClient() as unknown as {
    from: (t: string) => { select: (c: string, o?: unknown) => Promise<{ count: number | null; error: { message: string } | null }> };
  };

  const counts = async () => {
    const out: Record<string, string> = {};
    for (const t of [
      'scf_framework_catalog',
      'scf_controls_cache',
      'scf_control_mappings',
      'framework_identity_curation',
      'scf_sync_jobs',
    ]) {
      const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
      out[t] = error ? `ERROR: ${error.message}` : String(count ?? 0);
    }
    return out;
  };

  if (stage === 'verify') {
    console.log('row counts:');
    for (const [k, v] of Object.entries(await counts())) console.log(`  ${k.padEnd(30)} ${v}`);
    return;
  }

  const scfVersionId = await getLatestScfVersionId(throttle);
  console.log(`scf_version_id = ${scfVersionId}\n`);

  if (stage === 'catalog') {
    const fw = await syncFrameworkCatalog(scfVersionId, throttle);
    console.log(`frameworks: ${fw.synced} synced, ${fw.rejected.length} rejected`);

    const ct = await syncControlCatalog(scfVersionId, throttle, (n) => {
      if (n % 500 === 0) console.log(`  controls: ${n}…`);
    });
    console.log(`controls:   ${ct.synced} synced, ${ct.rejected.length} rejected`);
    if (ct.rejected.length > 0) console.log('  first rejects:', ct.rejected.slice(0, 3));
    return;
  }

  if (stage === 'crosswalk') {
    const { syncCrosswalk } = await import('../src/lib/standard-api/sync/crosswalk');
    console.log(
      `walking the crosswalk${resumeAfter ? ` from after ${resumeAfter}` : ''} — ` +
        'roughly 64 minutes. The API takes ~2.6s per mappings call, so its own ' +
        'latency binds, not the 120-req/60s limit.',
    );
    const r = await syncCrosswalk(scfVersionId, {
      throttle,
      resumeAfterControlCode: resumeAfter,
      // Always skip controls that already have mappings. Re-walking one costs
      // 2.6s for nothing, and this makes every run a resume without the caller
      // having to know where the last one stopped — which matters because what
      // is stored is not a contiguous prefix once any probe has run.
      skipControlsWithMappings: true,
      onProgress: (walked, stored) => {
        if (walked % 10 === 0) console.log(`  ${walked}/1473 controls, ${stored} mappings`);
      },
    });
    console.log(
      `\ndone: ${r.controlsWalked} controls, ${r.mappingsStored} mappings stored, ` +
        `${r.skippedSelfReferential} self-referential skipped, ${r.failures.length} failures`,
    );
    if (r.failures.length > 0) console.log('first failures:', r.failures.slice(0, 5));
    console.log(`resume point if needed: ${r.lastControlCode}`);
    return;
  }

  console.error(`unknown stage "${stage}" — use verify | catalog | crosswalk`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
