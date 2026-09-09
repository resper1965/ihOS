// The gate before dropping scf_framework_mappings.
//
//   npx tsx scripts/gate-old-mapping-table.ts > docs/measurements/2026-09-09-mapping-ids-lost.md
//
// SCOPE WIDENED 2026-09-08: the plan's original version of this script only
// compared the two frameworks the DefectDojo resolver reads (iso27001,
// nist_800_53). That was written on the belief that scf_framework_mappings had
// four consumers. A pre-flight scan found NINE (see progress.md, "FINDING A").
// So this measures the whole table -- every framework_code actually present,
// and every reader/writer actually in the tree -- not one consumer's slice.
//
// The rule is NOT "preserve coverage". The old table is partly fabricated --
// 25,589 of its rows (a different set, quarantined in 20260825000002) were
// manufactured by prefixing one framework's ids into another's -- so losing
// coverage may be exactly right. The rule is EXPLAINED coverage: every id that
// resolved before and does not resolve now must be accounted for, by a person,
// as either genuinely absent from the official crosswalk or a vocabulary
// mismatch we have to fix.
//
// Reads only. Nothing here writes to the database.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();
const CURATION_SQL_PATH = 'docs/sql/2026-09-08_APPLY_ME_recurate_identities.sql';
// This script's own path, so it does not report itself as a "consumer" --
// every line below that builds a query string against the old table would
// otherwise match its own grep.
const SELF_PATH = 'scripts/gate-old-mapping-table.ts';

const TABLE = 'scf_framework_mappings';
// Matches TABLE but not TABLE_quarantine, which is a different table that stays.
const TABLE_RE = /scf_framework_mappings(?!_quarantine)/;

type DbClient = {
  from: (t: string) => {
    select: (c: string) => {
      range: (
        a: number,
        b: number,
      ) => Promise<{ data: Array<Record<string, string | null>> | null; error: { message: string } | null }>;
    };
  };
};

// ---------------------------------------------------------------------------
// Section 1: Consumidores -- every file under src/ and scripts/ that mentions
// the old table, found by walking the tree at runtime. Not a hardcoded list:
// the whole reason Task 5 was widened is that a hardcoded consumer count (four)
// was wrong (nine).
// ---------------------------------------------------------------------------

interface Consumer {
  file: string;
  line: number;
  kind: 'leitura' | 'escrita' | 'comentario' | 'tipo gerado' | 'verificar manualmente';
}

const SCAN_DIRS = ['src', 'scripts'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'coverage', '.git']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

function classify(lines: string[], matchIdx: number): Consumer['kind'] {
  const trimmed = lines[matchIdx].trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return 'comentario';
  }
  // Look at a small window around the match for the chained call that follows
  // `.from('scf_framework_mappings')` -- it is usually a line or two away.
  const windowStart = Math.max(0, matchIdx - 2);
  const windowEnd = Math.min(lines.length, matchIdx + 10);
  const window = lines.slice(windowStart, windowEnd).join('\n');
  if (/\.(insert|upsert|update|delete)\s*\(/.test(window)) return 'escrita';
  if (/\.select\s*\(/.test(window)) return 'leitura';
  return 'verificar manualmente';
}

function findConsumers(): Consumer[] {
  const out: Consumer[] = [];
  for (const dir of SCAN_DIRS) {
    const dirPath = join(REPO_ROOT, dir);
    let files: string[];
    try {
      files = walk(dirPath);
    } catch {
      continue;
    }
    for (const absFile of files) {
      const relFile = relative(REPO_ROOT, absFile).split(sep).join('/');
      if (relFile === SELF_PATH) continue; // the measurement tool itself, not a product consumer
      const text = readFileSync(absFile, 'utf8');
      if (!TABLE_RE.test(text)) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!TABLE_RE.test(lines[i])) continue;
        let kind = classify(lines, i);
        if (kind === 'verificar manualmente' && /types\.generated\.ts$/.test(relFile)) {
          kind = 'tipo gerado';
        }
        out.push({ file: relFile, line: i + 1, kind });
      }
    }
  }
  out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return out;
}

// ---------------------------------------------------------------------------
// Section 2/3 support: curated identity resolution, with a fallback to the SQL
// file when the database row does not resolve.
//
// framework_identity_curation in the LIVE database still holds the OLD
// human-phrase vendor codes as of this writing -- the re-curation SQL
// (docs/sql/2026-09-08_APPLY_ME_recurate_identities.sql) exists but a person
// has not applied it yet. So resolveVendorFrameworkCode() against the live
// client will throw for every framework until that file is applied. When it
// does, this script falls back to reading the SAME slugs out of that pending
// SQL file, and says so plainly in the generated document -- a reader must
// know whether a number came from applied database state or a pending file.
// ---------------------------------------------------------------------------

interface CuratedPair {
  local: string;
  vendor: string;
}

function curatedPairsFromSqlFile(): CuratedPair[] {
  const sql = readFileSync(join(REPO_ROOT, CURATION_SQL_PATH), 'utf8');
  const re = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'(exact|probable|undecided|rejected)'/g;
  const out: CuratedPair[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push({ local: m[1], vendor: m[2] });
  return out;
}

interface Resolution {
  slug: string | null;
  source:
    | 'banco (aplicado)'
    | 'banco tem frase antiga -- usando arquivo pendente'
    | 'arquivo pendente (nao aplicado)'
    | 'sem identidade';
}

// A curated vendor_framework_code is a slug: lowercase, hyphenated, no spaces
// (Global Constraints, plan 2026-09-08). The vendor changed this column's shape
// on 2026-09-08; a value containing a space, or one that fails this shape, is
// the OLD human-phrase form ("ISO 27001 2022") and matches zero rows in the
// current catalogue -- it does NOT throw, because the row exists and is
// non-empty, so a naive "did it throw" check misses this case entirely.
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9.&]+)*$/;
function looksLikeSlug(v: string): boolean {
  return !/\s/.test(v) && SLUG_SHAPE.test(v);
}

async function resolveWithFallback(
  local: string,
  db: DbClient,
  fallback: CuratedPair[],
): Promise<Resolution> {
  let dbSlug: string | null = null;
  try {
    const { resolveVendorFrameworkCode } = await import('../src/lib/assessment/curation/identity');
    dbSlug = await resolveVendorFrameworkCode(local, db as never);
  } catch {
    dbSlug = null;
  }

  if (dbSlug !== null && looksLikeSlug(dbSlug)) {
    return { slug: dbSlug, source: 'banco (aplicado)' };
  }

  const hit = fallback.find((p) => p.local === local);
  if (hit) {
    return {
      slug: hit.vendor,
      source:
        dbSlug !== null
          ? 'banco tem frase antiga -- usando arquivo pendente'
          : 'arquivo pendente (nao aplicado)',
    };
  }
  return { slug: null, source: 'sem identidade' };
}

// ---------------------------------------------------------------------------
// Paging helper. supabase-js caps an unbounded select() at 1,000 rows and
// .limit() does NOT lift that cap -- it silently returns 1,000. This has
// already produced two wrong measurements in this codebase. The only correct
// full-table read pages with .range(from, from + 999) until a short page.
// ---------------------------------------------------------------------------

const PAGE = 1000;

async function readAllOldMappings(db: DbClient): Promise<Array<{ framework_code: string; target_control_id: string }>> {
  const out: Array<{ framework_code: string; target_control_id: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select('framework_code, target_control_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${TABLE}: ${error.message}`);
    const rows = (data ?? []) as Array<{ framework_code: string; target_control_id: string }>;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function readAllSpineRequirementCodes(
  db: DbClient,
  scfVersionId: string,
  slug: string,
): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const q = (db.from('scf_control_mappings') as unknown as {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { eq: (c: string, v: string) => { range: (a: number, b: number) => Promise<{
          data: Array<{ requirement_code: string }> | null;
          error: { message: string } | null;
        }> } };
      };
    }).select('requirement_code');
    const { data, error } = await q.eq('scf_version_id', scfVersionId).eq('framework_code', slug).range(from, from + PAGE - 1);
    if (error) throw new Error(`scf_control_mappings: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows.map((r) => r.requirement_code));
    if (rows.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { getCachedScfVersionId } = await import('../src/lib/standard-api/sync/catalog');
  const db = createAdminClient() as unknown as DbClient;

  const scfVersionId = await getCachedScfVersionId();
  const consumers = findConsumers();
  const oldRows = await readAllOldMappings(db);
  const fallbackPairs = curatedPairsFromSqlFile();

  const frameworksInOldTable = [...new Set(oldRows.map((r) => r.framework_code))].sort();

  const idsByFramework = new Map<string, Set<string>>();
  for (const row of oldRows) {
    const set = idsByFramework.get(row.framework_code) ?? new Set<string>();
    set.add(row.target_control_id);
    idsByFramework.set(row.framework_code, set);
  }

  console.log('# O que deixa de resolver quando a tabela velha sai\n');
  console.log(`Versao do catalogo (espinha): \`${scfVersionId}\`  `);
  console.log(`Medido em: ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(
    'A regra aqui **nao e "preservar cobertura"**. A tabela `scf_framework_mappings` ' +
      'e parcialmente fabricada -- um conjunto de linhas foi manufaturado prefixando ' +
      'ids de um framework para dentro de outro -- entao perder cobertura pode ser o ' +
      'certo acontecendo. A regra e **cobertura explicada**: todo id que resolvia antes ' +
      'e nao resolve mais precisa cair em uma de duas caixas, classificada por uma ' +
      'pessoa -- **ausente do crosswalk oficial**, ou **incompatibilidade de ' +
      'vocabulario** a corrigir.\n',
  );
  console.log(
    '**Escopo ampliado em relacao ao plano original**: o script original desta tarefa ' +
      'comparava so os dois frameworks que o resolver do DefectDojo le (`iso27001`, ' +
      '`nist_800_53`), com base na crenca de que a tabela velha tinha quatro ' +
      'consumidores. Um levantamento encontrou nove. Este documento cobre a tabela ' +
      'inteira: todo `framework_code` de fato presente nela, e todo arquivo que a le ' +
      'ou escreve.\n',
  );

  console.log(
    '**Sobre a curadoria usada abaixo**: `framework_identity_curation` no banco ao ' +
      'vivo ainda guarda os valores antigos em frase humana (ex.: "ISO 27001 2022"), ' +
      'porque `docs/sql/2026-09-08_APPLY_ME_recurate_identities.sql` existe mas ' +
      '**ainda nao foi aplicado por uma pessoa**. Quando a resolucao contra o banco ' +
      'falha, este script cai para os mesmos pares lidos diretamente desse arquivo ' +
      'pendente. Cada framework abaixo diz explicitamente de onde veio a sua ' +
      'identidade -- banco aplicado, ou arquivo pendente.\n',
  );

  // ---- Section: Consumidores ----
  console.log('## Consumidores\n');
  console.log(
    `Todo arquivo em \`src/\` e \`scripts/\` que menciona \`${TABLE}\`, encontrado por ` +
      'varredura em tempo de execucao (nao e uma lista fixa -- uma lista fixa e ' +
      'exatamente o que errou o numero de consumidores desta tabela antes). ' +
      `Excluidas ocorrencias de \`${TABLE}_quarantine\`, que e uma tabela diferente e permanece.\n`,
  );
  if (consumers.length === 0) {
    console.log('Nenhum consumidor encontrado -- inesperado; revisar o script de varredura.\n');
  } else {
    console.log('| arquivo | tipo | linha |');
    console.log('|---|---|---|');
    for (const c of consumers) {
      console.log(`| \`${c.file}\` | ${c.kind} | ${c.line} |`);
    }
    console.log('');
    console.log(
      '`tipo` e derivado heuristicamente pela chamada encadeada mais proxima ' +
        '(`.select(` = leitura, `.insert(`/`.upsert(`/`.update(`/`.delete(` = escrita, ' +
        'comentario = mencao sem uso real, tipo gerado = declaracao de schema gerada). ' +
        '"verificar manualmente" precisa de leitura humana antes de contar como leitura ou escrita.\n',
    );
  }

  // ---- Sections: Cobertura por framework + Ids perdidos ----
  console.log('## Cobertura por framework\n');
  console.log(
    'Para cada `framework_code` distinto de fato presente na tabela velha ' +
      '(nao apenas os dois que o resolver do DefectDojo usa).\n',
  );

  const lostSections: string[] = [];

  // A.-prefix concentration check (spec 7's stop condition): the baseline
  // share must be measured over the FULL old-table id set for the framework,
  // never assumed from the lost set alone -- assuming it is the same defect
  // class as the fabricated rows this whole project removes.
  function aPrefixStats(ids: string[]): { total: number; aPrefixed: number; pct: number } {
    const total = ids.length;
    const aPrefixed = ids.filter((id) => id.startsWith('A.')).length;
    return { total, aPrefixed, pct: total === 0 ? 0 : (aPrefixed / total) * 100 };
  }

  function emitAPrefixComparison(baseline: ReturnType<typeof aPrefixStats>, lost: ReturnType<typeof aPrefixStats>): void {
    console.log('| | total | comecam com `A.` | % |');
    console.log('|---|---|---|---|');
    console.log(`| requisitos na tabela velha (base) | ${baseline.total} | ${baseline.aPrefixed} | ${baseline.pct.toFixed(1)}% |`);
    console.log(`| ids perdidos | ${lost.total} | ${lost.aPrefixed} | ${lost.pct.toFixed(1)}% |\n`);

    if (lost.total === 0) {
      console.log('Nenhum id perdido -- comparacao nao se aplica.\n');
      return;
    }
    const diff = lost.pct - baseline.pct;
    const overRepresented = diff > 0.05; // guard against float noise at ~equal shares
    const sign = diff >= 0 ? '+' : '';
    console.log(
      `Entre os ids perdidos, ${lost.pct.toFixed(1)}% comecam com \`A.\`, contra ${baseline.pct.toFixed(1)}% ` +
        `na tabela velha inteira -- diferenca de ${sign}${diff.toFixed(1)} pontos percentuais.`,
    );
    if (overRepresented && lost.aPrefixed / lost.total > 0.5) {
      console.log(
        '\n**ATENCAO -- ISSO PARA O PROJETO**: os ids `A.`-prefixados (Annex A) estao ' +
          'SOBRE-REPRESENTADOS entre os perdidos E formam a maioria deles. Por spec 7, ' +
          'isso e o sinal de que Annex A pode ser um framework de vendor SEPARADO, o que ' +
          'reabre o desenho e nao deve ser contornado alargando um matcher ou curando um ' +
          'segundo codigo local como sinonimo.\n',
      );
    } else if (overRepresented) {
      console.log(
        '\nSobre-representados em relacao a base, mas nao formam maioria dos perdidos -- ' +
          'nao caracteriza a concentracao que a spec 7 trata como sinal de parar.\n',
      );
    } else {
      console.log(
        '\nProporcional a base (nao sobre-representado) -- nao caracteriza a concentracao ' +
          'que a spec 7 trata como sinal de parar.\n',
      );
    }
  }

  for (const local of frameworksInOldTable) {
    const antes = idsByFramework.get(local) ?? new Set<string>();
    const antesArr = [...antes];
    const baselineStats = aPrefixStats(antesArr);
    const resolution = await resolveWithFallback(local, db, fallbackPairs);

    console.log(`### \`${local}\`\n`);

    if (resolution.slug === null) {
      console.log(
        `Sem identidade curada (${resolution.source}). Os ${antes.size} requisitos ` +
          'da tabela velha ficam todos sem resolucao na espinha.\n',
      );
      console.log('| | |');
      console.log('|---|---|');
      console.log(`| requisitos na tabela velha | ${antes.size} |`);
      console.log(`| requisitos na espinha | 0 |`);
      console.log(`| **deixam de resolver** | **${antes.size}** |`);
      console.log(`| passam a resolver (novos) | 0 |\n`);
      // Every old id is lost by definition here, so the lost set IS the base
      // set -- the comparison is trivially equal, stated explicitly rather
      // than silently skipped.
      emitAPrefixComparison(baselineStats, baselineStats);
      lostSections.push(
        `### \`${local}\`\n\nSem identidade curada -- todos os ${antes.size} ids listados abaixo.\n\n` +
          '| id | ausente do crosswalk / vocabulario | nota |\n|---|---|---|\n' +
          antesArr.sort().map((id) => `| \`${id}\` | | |`).join('\n') +
          '\n',
      );
      continue;
    }

    const novaCodes = await readAllSpineRequirementCodes(db, scfVersionId, resolution.slug);
    const depois = new Set(novaCodes);

    const perdidos = antesArr.filter((id) => !depois.has(id)).sort();
    const ganhos = [...depois].filter((id) => !antes.has(id)).length;

    console.log(`Slug curado: \`${resolution.slug}\` (fonte: ${resolution.source})\n`);
    console.log('| | |');
    console.log('|---|---|');
    console.log(`| requisitos na tabela velha | ${antes.size} |`);
    console.log(`| requisitos na espinha | ${depois.size} |`);
    console.log(`| **deixam de resolver** | **${perdidos.length}** |`);
    console.log(`| passam a resolver (novos) | ${ganhos} |\n`);

    const lostStats = aPrefixStats(perdidos);
    console.log('**Verificacao de concentracao em `A.` (Annex A) -- spec 7:**\n');
    emitAPrefixComparison(baselineStats, lostStats);

    if (perdidos.length > 0) {
      lostSections.push(
        `### \`${local}\` (${resolution.slug})\n\n` +
          '| id | ausente do crosswalk / vocabulario | nota |\n|---|---|---|\n' +
          perdidos.map((id) => `| \`${id}\` | | |`).join('\n') +
          '\n',
      );
    } else {
      lostSections.push(`### \`${local}\` (${resolution.slug})\n\nNenhum id perdido.\n`);
    }
  }

  console.log('## Ids perdidos\n');
  console.log(
    'Por framework, os ids que resolviam antes e nao resolvem mais. Colunas em branco ' +
      'para uma pessoa classificar cada um como *ausente do crosswalk* ou ' +
      '*incompatibilidade de vocabulario*.\n',
  );
  for (const section of lostSections) console.log(section);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
