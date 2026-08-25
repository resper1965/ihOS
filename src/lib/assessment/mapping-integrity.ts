// src/lib/assessment/mapping-integrity.ts
// Detects fabricated framework crosswalks in scf_framework_mappings.
//
// Why this exists: on 2026-08-25 an audit found 5 of 7 framework mappings were
// prefix-renamed clones of the two real ones (soc2/nist_800_53/HI-2013 cloned
// from iso27001; EU-GDPR/BR-LGPD from iso27701). They had been serving
// "gap analysis" results for two months. The signal that catches it: two
// genuinely different standards never map to a byte-identical set of SCF
// controls — SOC 2 has ~60 criteria, NIST 800-53 has ~1000 controls, and
// neither can share ISO 27001's exact 582.
//
// Scope: this detects EXACT duplication only — two frameworks whose SCF
// control sets are byte-identical. A near-clone (copy a mapping, then add,
// drop, or edit even one row) produces a non-identical set and will NOT be
// flagged. An empty result means "no exact duplicate found", not "no
// fabrication of any kind" — treat check:mappings' OK message accordingly.

export interface MappingRow {
  framework_code: string;
  target_control_id: string;
  scf_control_code: string;
}

export interface CloneFinding {
  suspect: string;
  mirrors: string;
  /** Size of the SCF control set the two frameworks share identically. */
  sharedScfControls: number;
  /** The prefix that turns one framework's target ids into the other's, if any. */
  strippedPrefix: string | null;
  /** True when stripping that prefix makes the target-id sets identical too. */
  targetIdsIdenticalAfterStrip: boolean;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Tries `longer` as the prefixed side and `shorter` as the bare side: finds a
 * prefix P such that stripping P from every id in `longer` reproduces
 * `shorter` exactly (e.g. "SOC2-5.1" over "5.1" yields "SOC2-"). Returns null
 * if no such P exists. Candidates are visited in sorted order so the result
 * is reproducible regardless of Set insertion order.
 */
function tryPrefixDirection(longer: Set<string>, shorter: Set<string>): string | null {
  const sampleLong = [...longer].sort()[0];
  for (const candidate of [...shorter].sort()) {
    if (!sampleLong.endsWith(candidate)) continue;
    const prefix = sampleLong.slice(0, sampleLong.length - candidate.length);
    if (prefix === "") continue;
    const stripped = new Set([...longer].map((id) => (id.startsWith(prefix) ? id.slice(prefix.length) : id)));
    if (setsEqual(stripped, shorter)) return prefix;
  }
  return null;
}

/**
 * Finds the prefix that maps one id set onto the other (e.g. "SOC2-5.1" over
 * "5.1" yields "SOC2-"), or null when the ids are not a uniform prefix
 * variant. Which side is "prefixed" isn't decided by sampling a single id's
 * length (fragile with mixed-length ids like "5.0" / "5.0.1" / "5.1.1") —
 * both directions are tried and whichever confirms a uniform prefix wins.
 */
function findUniformPrefix(a: Set<string>, b: Set<string>): string | null {
  if (a.size !== b.size || a.size === 0) return null;
  return tryPrefixDirection(a, b) ?? tryPrefixDirection(b, a);
}

export function detectClonedMappings(rows: MappingRow[]): CloneFinding[] {
  const scfByFramework = new Map<string, Set<string>>();
  const targetsByFramework = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!scfByFramework.has(row.framework_code)) {
      scfByFramework.set(row.framework_code, new Set());
      targetsByFramework.set(row.framework_code, new Set());
    }
    scfByFramework.get(row.framework_code)!.add(row.scf_control_code);
    targetsByFramework.get(row.framework_code)!.add(row.target_control_id);
  }

  const codes = [...scfByFramework.keys()].sort();
  const findings: CloneFinding[] = [];

  // Each unordered pair once.
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = codes[i];
      const b = codes[j];
      const scfA = scfByFramework.get(a)!;
      const scfB = scfByFramework.get(b)!;
      if (!setsEqual(scfA, scfB)) continue;

      const prefix = findUniformPrefix(targetsByFramework.get(a)!, targetsByFramework.get(b)!);
      findings.push({
        suspect: b,
        mirrors: a,
        sharedScfControls: scfA.size,
        strippedPrefix: prefix,
        targetIdsIdenticalAfterStrip: prefix !== null,
      });
    }
  }

  return findings;
}
