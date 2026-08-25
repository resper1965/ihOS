// tests/unit/assessment/framework-code-normalization.test.ts
// The crosswalk upload route used to uppercase every framework code, which
// would have created "ISO27001" alongside the real lowercase "iso27001" —
// silently splitting one framework's mappings across two codes. Uploads must
// canonicalize onto the code the registry already uses.

import { describe, it, expect } from "vitest";
import { normalizeFrameworkCode } from "@/lib/assessment/framework-registry";

describe("normalizeFrameworkCode", () => {
  it("canonicalizes case variants onto the registry's own code", () => {
    expect(normalizeFrameworkCode("ISO27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("iso27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("Iso27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("iso27701")).toBe("iso27701");
  });

  it("resolves a known alias to its canonical code", () => {
    expect(normalizeFrameworkCode("lgpd")).toBe("BR-LGPD");
    expect(normalizeFrameworkCode("hipaa")).toBe("HI-2013");
    expect(normalizeFrameworkCode("soc-2")).toBe("soc2");
  });

  it("preserves the registry's own casing for mixed-case codes", () => {
    expect(normalizeFrameworkCode("eu-gdpr")).toBe("EU-GDPR");
    expect(normalizeFrameworkCode("br-lgpd")).toBe("BR-LGPD");
  });

  it("collapses whitespace to hyphens for codes it does not know", () => {
    expect(normalizeFrameworkCode("  NEW FRAMEWORK  ")).toBe("NEW-FRAMEWORK");
  });

  it("leaves an unknown code otherwise untouched rather than uppercasing it", () => {
    expect(normalizeFrameworkCode("cis_v8")).toBe("cis_v8");
  });
});
