// What the SoA declares, and how much of it reaches the SCF spine.
//
//   npx tsx scripts/soa-coverage.ts > docs/measurements/2026-09-09-soa-coverage.md
//
// The gap this exists to show: the proprietary crosswalk holds no Annex B
// codes, so applicable Annex B controls have no path to the spine. An applicable
// control with no mapping must read as UNMAPPED, never as absent from a
// denominator -- that is the difference between "we do not claim this" and "we
// cannot say".

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const PAGE = 1000;

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { SOA_DOCUMENT_ID } = await import('../src/lib/soa/source');
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => {
          order: (c: string) => { range: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };
        };
        order: (c: string) => {
          order: (c: string) => {
            order: (c: string) => { range: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };
          };
        };
      };
    };
  };

  // Paged with .range() and a total ordering. annex_code is unique within one
  // document, so it alone totally orders soa_entries.
  const soa: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('soa_entries')
      .select('annex_code, applicable, standard, annex, title')
      .eq('document_id', SOA_DOCUMENT_ID)
      .order('annex_code')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`soa_entries: ${error.message}`);
    const rows = data ?? [];
    soa.push(...rows);
    if (rows.length < PAGE) break;
  }

  // The crosswalk's key is (edition, annex_code, control_code) -- all three
  // order it totally. The same annex_code can legally appear under two
  // different editions, so the map is keyed by the (edition, annex_code)
  // pair, not by annex_code alone -- a hand-curated row could otherwise
  // inflate the link count with a row that has nothing to do with the SoA
  // entry's own standard.
  const editionKey = (edition: unknown, annexCode: unknown) => `${String(edition)}|${String(annexCode)}`;

  const mapped = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('annex_control_mappings')
      .select('annex_code, control_code, edition')
      .order('annex_code')
      .order('control_code')
      .order('edition')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`annex_control_mappings: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const k = editionKey(r.edition, r.annex_code);
      mapped.set(k, (mapped.get(k) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }

  // Every lookup is scoped to the SoA entry's own standard -- soa_entries.standard
  // and annex_control_mappings.edition share the same vocabulary
  // (iso27001:2022, iso27701:2019), so this is a scoping join, not a translation.
  const applicable = soa.filter((r) => r.applicable === true);
  const unmapped = applicable.filter((r) => !mapped.has(editionKey(r.standard, r.annex_code)));
  const links = applicable.reduce((a, r) => a + (mapped.get(editionKey(r.standard, r.annex_code)) ?? 0), 0);

  console.log('# Cobertura da SoA sobre a espinha SCF\n');
  console.log(`Documento: ${SOA_DOCUMENT_ID}  `);
  console.log(`Medido em: ${new Date().toISOString().slice(0, 10)}\n`);
  console.log('Um controle **aplicável sem mapeamento** e um controle **não aplicável** são');
  console.log('coisas diferentes. O primeiro é uma lacuna de cobertura: nós reivindicamos o');
  console.log('controle e não sabemos dizer a que ele corresponde no SCF. O segundo é uma');
  console.log('decisão registrada. Nenhum dos dois pode sumir de um denominador em silêncio.\n');
  console.log('As ligações contadas abaixo são restritas à norma (`standard`/`edition`) de cada');
  console.log('entrada da SoA -- uma mesma sigla de anexo sob outra norma não entra na conta.\n');

  console.log('## Por norma e anexo\n');
  console.log('| norma | anexo | controles | aplicáveis | aplicáveis sem mapeamento |');
  console.log('|---|---|---|---|---|');
  const groups = [...new Set(soa.map((r) => `${r.standard}|${r.annex}`))].sort();
  for (const g of groups) {
    const [std, ann] = g.split('|');
    const rows = soa.filter((r) => r.standard === std && r.annex === ann);
    const ap = rows.filter((r) => r.applicable === true);
    const un = ap.filter((r) => !mapped.has(editionKey(r.standard, r.annex_code)));
    console.log(`| ${std} | ${ann} | ${rows.length} | ${ap.length} | ${un.length} |`);
  }

  console.log(`\n## Total\n`);
  console.log(`| | |`);
  console.log(`|---|---|`);
  console.log(`| controles declarados | ${soa.length} |`);
  console.log(`| aplicáveis | ${applicable.length} |`);
  console.log(`| aplicáveis que alcançam o SCF | ${applicable.length - unmapped.length} |`);
  console.log(`| **aplicáveis SEM mapeamento** | **${unmapped.length}** |`);
  console.log(`| ligações SCF no total | ${links} |`);

  if (unmapped.length > 0) {
    console.log(`\n## Aplicáveis sem mapeamento\n`);
    console.log('Cada um destes é reivindicado pela Ionic e não tem caminho até a espinha.\n');
    console.log('| código | título |');
    console.log('|---|---|');
    for (const r of unmapped) console.log(`| \`${r.annex_code}\` | ${String(r.title).slice(0, 70)} |`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
