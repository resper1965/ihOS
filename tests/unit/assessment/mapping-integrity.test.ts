// tests/unit/assessment/mapping-integrity.test.ts
// Two genuinely different standards never map to a byte-identical set of SCF
// controls. detectClonedMappings exists because 5 of 7 framework mappings in
// this project turned out to be prefix-renamed clones of the two real ones,
// undetected for two months.

import { describe, it, expect } from "vitest";
import { detectClonedMappings, type MappingRow } from "@/lib/assessment/mapping-integrity";

// iso27001 is the real mapping; soc2 is it with "SOC2-" glued on.
const clonedPair: MappingRow[] = [
  { framework_code: "iso27001", target_control_id: "5.1", scf_control_code: "GOV-01" },
  { framework_code: "iso27001", target_control_id: "5.2", scf_control_code: "GOV-02" },
  { framework_code: "soc2", target_control_id: "SOC2-5.1", scf_control_code: "GOV-01" },
  { framework_code: "soc2", target_control_id: "SOC2-5.2", scf_control_code: "GOV-02" },
];

const genuinelyDifferent: MappingRow[] = [
  { framework_code: "iso27001", target_control_id: "5.1", scf_control_code: "GOV-01" },
  { framework_code: "iso27001", target_control_id: "5.2", scf_control_code: "GOV-02" },
  { framework_code: "soc2", target_control_id: "CC6.1", scf_control_code: "IAC-01" },
  { framework_code: "soc2", target_control_id: "CC6.2", scf_control_code: "GOV-01" },
];

describe("detectClonedMappings", () => {
  it("flags a prefix-renamed clone and names the prefix", () => {
    const findings = detectClonedMappings(clonedPair);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sharedScfControls: 2,
      strippedPrefix: "SOC2-",
      targetIdsIdenticalAfterStrip: true,
    });
    // Either ordering of the pair is acceptable; both codes must appear.
    expect([findings[0].suspect, findings[0].mirrors].sort()).toEqual(["iso27001", "soc2"]);
  });

  it("does not flag frameworks with genuinely different control sets", () => {
    expect(detectClonedMappings(genuinelyDifferent)).toEqual([]);
  });

  it("flags an identical SCF set even when target ids are not a simple prefix variant", () => {
    const rows: MappingRow[] = [
      { framework_code: "a", target_control_id: "A.1", scf_control_code: "GOV-01" },
      { framework_code: "b", target_control_id: "totally-different", scf_control_code: "GOV-01" },
    ];
    const findings = detectClonedMappings(rows);
    expect(findings).toHaveLength(1);
    expect(findings[0].targetIdsIdenticalAfterStrip).toBe(false);
    expect(findings[0].strippedPrefix).toBeNull();
  });

  it("returns nothing for a single framework, or for no rows", () => {
    expect(detectClonedMappings([clonedPair[0]])).toEqual([]);
    expect(detectClonedMappings([])).toEqual([]);
  });

  it("reports each colliding pair once, not twice", () => {
    // Three frameworks sharing one SCF set => 3 pairs (a-b, a-c, b-c).
    const rows: MappingRow[] = [
      { framework_code: "a", target_control_id: "1", scf_control_code: "GOV-01" },
      { framework_code: "b", target_control_id: "B-1", scf_control_code: "GOV-01" },
      { framework_code: "c", target_control_id: "C-1", scf_control_code: "GOV-01" },
    ];
    expect(detectClonedMappings(rows)).toHaveLength(3);
  });
});
