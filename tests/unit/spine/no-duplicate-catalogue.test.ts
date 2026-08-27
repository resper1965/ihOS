import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The file with comments removed.
 *
 * These assertions look for absent code, and the file explains what it removed
 * by quoting it — so a naive grep matches the explanation and reports the defect
 * still present. Stripping comments first is what makes these tests about code
 * rather than about prose. (First written without this, and all three failed
 * against a correct implementation.)
 */
function localEngine(): string {
  const raw = readFileSync(
    resolve(process.cwd(), 'src/lib/assessment/local-engine.ts'),
    'utf8',
  );
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/^[ \t]*\/\/.*$/gm, '');  // whole-line // comments
}

describe('there is one control base, and it is the vendor catalogue', () => {
  it('no committed JSON duplicates the control catalogue', () => {
    expect(
      existsSync(resolve(process.cwd(), 'src/lib/assessment/data/iso27001-annex-a.json')),
    ).toBe(false);
  });

  it('no engine substitutes a hardcoded control code when a lookup misses', () => {
    // local-engine.ts:99 was `scfCodes[0] || 'GOV-01.3'` — an unmapped Annex A
    // control was silently attributed to a default, and the domain was derived
    // from that default. It existed only because the engine started from ISO
    // controls and had to guess an SCF code. Iterating the SCF catalogue means
    // the control IS the SCF control, so there is nothing left to guess.
    expect(localEngine()).not.toMatch(/\|\|\s*['"]GOV-01\.3['"]/);
  });

  it('does not import a control list from disk', () => {
    const src = localEngine();
    expect(src).not.toMatch(/from\s+['"]\.\/data\/iso27001-annex-a\.json['"]/);
    expect(src).not.toMatch(/ISO27001_ANNEX_A/);
  });
});

describe('framework figures are per-framework, not one number relabelled', () => {
  it('does not map one score across every requested framework', () => {
    // The defect this replaces:
    //
    //   const score = Math.round((totalConforming / controls.length) * 100);
    //   const frameworkScores = config.frameworks.map(fwId => ({
    //     frameworkId: fwId, score, totalRequired: controls.length, ...
    //   }));
    //
    // Asking for two frameworks returned the SAME number twice — control
    // coverage over the catalogue's own length, stamped with a framework name.
    // A figure that cannot differ between frameworks is not a framework figure.
    const src = localEngine();
    expect(src).not.toMatch(/config\.frameworks\.map\(\s*fwId\s*=>\s*\(\{/);
  });

  it('obtains framework figures from the crosswalk projection', () => {
    const src = localEngine();
    expect(src).toMatch(/projectFrameworkFromCrosswalk/);
  });

  it('divides by requirements, never by the catalogue length', () => {
    // totalRequired must come from the projection's requirement count. Dividing
    // by controls.length answers "how much of the catalogue did we implement",
    // which is a real question and not this one.
    expect(src()).not.toMatch(/totalConforming\s*\/\s*controls\.length/);

    function src() {
      return localEngine();
    }
  });
});
