import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * On 2026-09-08 the vendor's framework_code changed shape from a human phrase
 * ("ISO 27001 2022") to a slug ("general-iso-27001-2022"). All eight curated
 * identities silently stopped matching: measured that day, every one of them
 * joined zero rows. Nothing detected it, because a curation row that matches
 * nothing looks exactly like a framework with no mappings.
 *
 * This asserts the shape, which is the part a machine can check. Whether the
 * slug names the RIGHT framework stays a human decision, recorded in the
 * rationale column.
 */
const sql = readFileSync(
  resolve(process.cwd(), 'docs/sql/2026-09-08_APPLY_ME_recurate_identities.sql'),
  'utf8',
);

/** Every quoted string in a VALUES position, in order. */
function curatedPairs(): Array<{ local: string; vendor: string }> {
  const out: Array<{ local: string; vendor: string }> = [];
  const re = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'(exact|probable|undecided|rejected)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push({ local: m[1], vendor: m[2] });
  return out;
}

describe('a curated vendor framework code is a slug, not a phrase', () => {
  it('curates all eight local codes', () => {
    const locals = curatedPairs().map((p) => p.local).sort();
    expect(locals).toEqual([
      'BR-LGPD', 'EU-DORA', 'EU-GDPR', 'TX-LEVEL-2',
      'iso27001', 'iso27701', 'nist_800_53', 'soc2',
    ]);
  });

  it('every vendor code is slug-shaped', () => {
    for (const { local, vendor } of curatedPairs()) {
      expect(vendor, `${local} must curate to a slug`).toMatch(/^[a-z0-9]+(-[a-z0-9.&]+)*$/);
      expect(vendor, `${local} must not contain a space`).not.toMatch(/\s/);
    }
  });

  it('records why each decision was made', () => {
    // A curation row without a rationale is a guess wearing a signature.
    expect(sql).toMatch(/rationale/i);
    expect((sql.match(/ON CONFLICT \(local_code\) DO UPDATE/gi) ?? []).length).toBeGreaterThan(0);
  });
});
