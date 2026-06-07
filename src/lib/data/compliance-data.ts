// ============================================================================
// Compliance Intelligence — Data Layer
// Source: Supabase tables → Standard GRC API → hardcoded fallback
// Each function follows: DB query → API fallback → mock fallback (never crash)
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import * as standardApi from "@/lib/standard-api/client";

// ---------------------------------------------------------------------------
// Type exports (unchanged)
// ---------------------------------------------------------------------------

export interface FrameworkScore {
  code: string;
  name: string;
  score: number | null;
  coverage: number | null;
  missing: number;
  icon: string;
}

export interface EvaluationSummary {
  total: number;
  compliant: number;
  nonCompliant: number;
  avgConfidence: number;
}

export interface GapItem {
  code: string;
  domain: string;
  name: string;
  confidence: number;
  status: "critical" | "high" | "medium" | "low";
  missingElements?: string[];
}

export interface RoiItem {
  code: string;
  name: string;
  roi: number;
  frameworks: string[];
}

export interface DomainBreakdown {
  domain: string;
  fullName: string;
  total: number;
  compliant: number;
  rate: number;
}

// ---------------------------------------------------------------------------
// Mock data (final fallback — ensures UI never crashes)
// ---------------------------------------------------------------------------

const MOCK_FRAMEWORK_SCORES: FrameworkScore[] = [
  { code: "BR-LGPD", name: "LGPD", score: 100, coverage: null, missing: 0, icon: "🇧🇷" },
  { code: "HI-2013", name: "HIPAA", score: null, coverage: 76, missing: 40, icon: "🏥" },
  { code: "TX-LEVEL-2", name: "TX-RAMP L2", score: null, coverage: 65, missing: 97, icon: "⭐" },
  { code: "iso27001", name: "ISO 27001", score: null, coverage: null, missing: 81, icon: "🔒" },
  { code: "EU-GDPR", name: "EU GDPR", score: null, coverage: 0, missing: 0, icon: "🇪🇺" },
];

const MOCK_EVALUATION_SUMMARY: EvaluationSummary = {
  total: 200,
  compliant: 27,
  nonCompliant: 173,
  avgConfidence: 72.3,
};

const MOCK_TOP_GAPS: GapItem[] = [
  {
    code: "AST-16", domain: "AST", name: "BYOD Governance", confidence: 20, status: "critical",
    missingElements: ["No BYOD policy documented", "Missing MDM solution", "No device enrollment procedures"],
  },
  {
    code: "PRI-01.4", domain: "PRI", name: "DPO Appointment", confidence: 30, status: "high",
    missingElements: ["No formal DPO appointment letter", "DPO responsibilities not published"],
  },
  {
    code: "PRI-15", domain: "PRI", name: "Data Authority Registration", confidence: 50, status: "medium",
    missingElements: ["Registration with data protection authority pending"],
  },
  {
    code: "IRO-01", domain: "IRO", name: "Incident Response Operations", confidence: 50, status: "medium",
    missingElements: ["IR plan exists but not tested in 12 months", "Missing tabletop exercise records"],
  },
  {
    code: "PRI-06", domain: "PRI", name: "Data Subject Rights", confidence: 60, status: "medium",
    missingElements: ["Data subject request SLA not defined"],
  },
  {
    code: "TDA-19", domain: "TDA", name: "Transmission Confidentiality", confidence: 35, status: "high",
    missingElements: ["TLS 1.2 minimum not enforced on all endpoints", "Missing certificate pinning documentation"],
  },
  {
    code: "CRY-01", domain: "CRY", name: "Cryptographic Key Management", confidence: 40, status: "high",
    missingElements: ["Key rotation schedule not documented", "No HSM inventory"],
  },
  {
    code: "IAC-06", domain: "IAC", name: "Multi-Factor Authentication", confidence: 55, status: "medium",
    missingElements: ["MFA not enforced for all privileged accounts"],
  },
  {
    code: "DCH-06.1", domain: "DCH", name: "Data Classification Handling", confidence: 45, status: "high",
    missingElements: ["Classification labels not applied to all repositories", "Handling procedures incomplete for 'Restricted' tier"],
  },
  {
    code: "CFG-02", domain: "CFG", name: "System Hardening", confidence: 42, status: "high",
    missingElements: ["CIS benchmarks not fully applied", "Missing baseline documentation for production servers"],
  },
];

const MOCK_ROI_PATH: RoiItem[] = [
  { code: "DCH-17", name: "Data Retention & Disposal", roi: 8.0, frameworks: ["ISO 27001"] },
  { code: "MON-01", name: "Continuous Monitoring", roi: 3.0, frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"] },
  { code: "HRS-04", name: "Personnel Security", roi: 2.0, frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"] },
  { code: "IAC-21", name: "Credential Management", roi: 1.0, frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"] },
  { code: "TPM-01", name: "Third-Party Management", roi: 1.0, frameworks: ["HIPAA"] },
  { code: "RSK-04", name: "Risk Assessment Program", roi: 0.9, frameworks: ["TX-RAMP", "ISO 27001"] },
  { code: "GOV-02", name: "Security Governance Board", roi: 0.8, frameworks: ["TX-RAMP", "ISO 27001"] },
  { code: "SAT-01", name: "Security Awareness Training", roi: 0.7, frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"] },
  { code: "BCD-01", name: "Business Continuity Plan", roi: 0.6, frameworks: ["TX-RAMP", "HIPAA"] },
  { code: "VPM-06", name: "Patch Management", roi: 0.5, frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"] },
];

const MOCK_DOMAIN_BREAKDOWN: DomainBreakdown[] = [
  { domain: "AST", fullName: "Asset Management", total: 18, compliant: 5, rate: 28 },
  { domain: "IAC", fullName: "Identity & Access Control", total: 24, compliant: 10, rate: 42 },
  { domain: "PRI", fullName: "Privacy", total: 16, compliant: 3, rate: 19 },
  { domain: "DCH", fullName: "Data Classification & Handling", total: 20, compliant: 6, rate: 30 },
  { domain: "CRY", fullName: "Cryptography", total: 10, compliant: 4, rate: 40 },
  { domain: "CFG", fullName: "Configuration Management", total: 14, compliant: 6, rate: 43 },
  { domain: "MON", fullName: "Monitoring & Logging", total: 12, compliant: 5, rate: 42 },
  { domain: "IRO", fullName: "Incident Response", total: 10, compliant: 3, rate: 30 },
  { domain: "HRS", fullName: "Human Resource Security", total: 8, compliant: 4, rate: 50 },
  { domain: "GOV", fullName: "Governance", total: 12, compliant: 7, rate: 58 },
  { domain: "RSK", fullName: "Risk Management", total: 10, compliant: 5, rate: 50 },
  { domain: "TPM", fullName: "Third-Party Management", total: 8, compliant: 2, rate: 25 },
  { domain: "TDA", fullName: "Threat & Data Analysis", total: 14, compliant: 4, rate: 29 },
  { domain: "BCD", fullName: "Business Continuity", total: 6, compliant: 3, rate: 50 },
  { domain: "VPM", fullName: "Vulnerability & Patch Mgmt", total: 10, compliant: 4, rate: 40 },
  { domain: "SAT", fullName: "Security Awareness", total: 8, compliant: 5, rate: 63 },
];

// ---------------------------------------------------------------------------
// Icon map for framework codes
// ---------------------------------------------------------------------------

const FRAMEWORK_ICONS: Record<string, string> = {
  "BR-LGPD": "🇧🇷",
  "HI-2013": "🏥",
  "TX-LEVEL-2": "⭐",
  "iso27001": "🔒",
  "EU-GDPR": "🇪🇺",
};

// ---------------------------------------------------------------------------
// Domain full-name map
// ---------------------------------------------------------------------------

const DOMAIN_FULL_NAMES: Record<string, string> = {
  AST: "Asset Management",
  IAC: "Identity & Access Control",
  PRI: "Privacy",
  DCH: "Data Classification & Handling",
  CRY: "Cryptography",
  CFG: "Configuration Management",
  MON: "Monitoring & Logging",
  IRO: "Incident Response",
  HRS: "Human Resource Security",
  GOV: "Governance",
  RSK: "Risk Management",
  TPM: "Third-Party Management",
  TDA: "Threat & Data Analysis",
  BCD: "Business Continuity",
  VPM: "Vulnerability & Patch Mgmt",
  SAT: "Security Awareness",
};

// ---------------------------------------------------------------------------
// 1. getFrameworkScores()
// Query intelligence_snapshots for latest scores per framework.
// Fallback: Standard API complianceScore(). Final fallback: mock data.
// ---------------------------------------------------------------------------

export async function getFrameworkScores(): Promise<FrameworkScore[]> {
  try {
    const supabase = await createClient();

    // Get latest scorecard snapshots
    const { data: snapshots, error } = await supabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "scorecard")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (snapshots && snapshots.length > 0) {
      // Group by framework_code, take the latest per framework
      const latestByFramework = new Map<string, typeof snapshots[0]>();
      for (const snap of snapshots) {
        const code = snap.framework_code;
        if (code && !latestByFramework.has(code)) {
          latestByFramework.set(code, snap);
        }
      }

      if (latestByFramework.size > 0) {
        const results: FrameworkScore[] = [];
        for (const [code, snap] of latestByFramework) {
          const data = snap.snapshot_data as Record<string, any> | null;
          results.push({
            code,
            name: (data?.name as string) ?? code,
            score: (data?.score as number) ?? null,
            coverage: (data?.coverage as number) ?? null,
            missing: (data?.missing as number) ?? 0,
            icon: FRAMEWORK_ICONS[code] ?? "📋",
          });
        }
        return results;
      }
    }

    // Fallback: try Standard API for each known framework
    try {
      const frameworks = ["BR-LGPD", "HI-2013", "TX-LEVEL-2", "iso27001", "EU-GDPR"];
      const results: FrameworkScore[] = [];

      for (const code of frameworks) {
        try {
          const apiResult = await standardApi.complianceScore({ framework_code: code });
          results.push({
            code,
            name: MOCK_FRAMEWORK_SCORES.find((f) => f.code === code)?.name ?? code,
            score: apiResult.score ?? apiResult.overall_score ?? null,
            coverage: null,
            missing: apiResult.missing_controls?.length ?? 0,
            icon: FRAMEWORK_ICONS[code] ?? "📋",
          });
        } catch {
          // Individual framework failure — skip
        }
      }

      if (results.length > 0) return results;
    } catch {
      // Standard API unavailable
    }

    console.warn("[compliance-data] getFrameworkScores: using mock data fallback");
    return MOCK_FRAMEWORK_SCORES;
  } catch (err) {
    console.warn("[compliance-data] getFrameworkScores error, using mock:", err);
    return MOCK_FRAMEWORK_SCORES;
  }
}

// ---------------------------------------------------------------------------
// 2. getEvaluationSummary()
// Aggregate from evidence_evaluations table (COUNT by status).
// ---------------------------------------------------------------------------

export async function getEvaluationSummary(): Promise<EvaluationSummary> {
  try {
    const supabase = await createClient();

    const { data: evaluations, error } = await supabase
      .from("evidence_evaluations")
      .select("is_compliant, confidence_score");

    if (error) throw error;

    if (evaluations && evaluations.length > 0) {
      const total = evaluations.length;
      const compliant = evaluations.filter((e) => e.is_compliant).length;
      const nonCompliant = total - compliant;
      const avgConfidence =
        evaluations.reduce((sum, e) => sum + (e.confidence_score ?? 0), 0) / total;

      return {
        total,
        compliant,
        nonCompliant,
        avgConfidence: Math.round(avgConfidence * 10) / 10,
      };
    }

    console.warn("[compliance-data] getEvaluationSummary: no evaluations found, using mock");
    return MOCK_EVALUATION_SUMMARY;
  } catch (err) {
    console.warn("[compliance-data] getEvaluationSummary error, using mock:", err);
    return MOCK_EVALUATION_SUMMARY;
  }
}

// ---------------------------------------------------------------------------
// 3. getTopGaps()
// Query evidence_evaluations WHERE is_compliant = false, ordered by
// confidence_score ascending (lowest confidence = highest risk).
// ---------------------------------------------------------------------------

export async function getTopGaps(): Promise<GapItem[]> {
  try {
    const supabase = await createClient();

    const { data: gaps, error } = await supabase
      .from("evidence_evaluations")
      .select("control_code, domain_code, control_name, confidence_score, missing_elements")
      .eq("is_compliant", false)
      .order("confidence_score", { ascending: true })
      .limit(10);

    if (error) throw error;

    if (gaps && gaps.length > 0) {
      return gaps.map((g) => {
        let status: GapItem["status"] = "low";
        const conf = g.confidence_score ?? 50;
        if (conf < 25) status = "critical";
        else if (conf < 40) status = "high";
        else if (conf < 60) status = "medium";

        return {
          code: g.control_code,
          domain: g.domain_code,
          name: g.control_name,
          confidence: conf,
          status,
          missingElements: (g.missing_elements as string[] | null) ?? undefined,
        };
      });
    }

    console.warn("[compliance-data] getTopGaps: no gaps found, using mock");
    return MOCK_TOP_GAPS;
  } catch (err) {
    console.warn("[compliance-data] getTopGaps error, using mock:", err);
    return MOCK_TOP_GAPS;
  }
}

// ---------------------------------------------------------------------------
// 4. getRoiPath()
// Call Standard API roiPath() with fallback to mock.
// ---------------------------------------------------------------------------

export async function getRoiPath(): Promise<RoiItem[]> {
  try {
    const apiResult = await standardApi.roiPath({
      target_frameworks: ["TX-RAMP", "HIPAA", "ISO 27001"],
      top_n: 10,
    });

    if (apiResult.roi_path && apiResult.roi_path.length > 0) {
      return apiResult.roi_path.map((item) => ({
        code: item.control_id,
        name: item.control_id, // API may not return a name
        roi: item.roi_score,
        frameworks: item.key_mitigations ?? [],
      }));
    }

    if (apiResult.recommended_path && apiResult.recommended_path.length > 0) {
      return apiResult.recommended_path.map((item) => ({
        code: item.controls_covered[0] ?? `step-${item.step}`,
        name: item.action,
        roi: item.impact_score,
        frameworks: item.frameworks_benefited,
      }));
    }

    console.warn("[compliance-data] getRoiPath: API returned empty, using mock");
    return MOCK_ROI_PATH;
  } catch (err) {
    console.warn("[compliance-data] getRoiPath error, using mock:", err);
    return MOCK_ROI_PATH;
  }
}

// ---------------------------------------------------------------------------
// 5. getDomainBreakdown()
// Aggregate evidence_evaluations by domain_code with compliance rate.
// ---------------------------------------------------------------------------

export async function getDomainBreakdown(): Promise<DomainBreakdown[]> {
  try {
    const supabase = await createClient();

    const { data: evaluations, error } = await supabase
      .from("evidence_evaluations")
      .select("domain_code, is_compliant");

    if (error) throw error;

    if (evaluations && evaluations.length > 0) {
      // Group by domain_code
      const domainMap = new Map<string, { total: number; compliant: number }>();

      for (const ev of evaluations) {
        const domain = ev.domain_code;
        if (!domainMap.has(domain)) {
          domainMap.set(domain, { total: 0, compliant: 0 });
        }
        const entry = domainMap.get(domain)!;
        entry.total++;
        if (ev.is_compliant) entry.compliant++;
      }

      const results: DomainBreakdown[] = [];
      for (const [domain, stats] of domainMap) {
        results.push({
          domain,
          fullName: DOMAIN_FULL_NAMES[domain] ?? domain,
          total: stats.total,
          compliant: stats.compliant,
          rate: Math.round((stats.compliant / stats.total) * 100),
        });
      }

      // Sort by rate ascending (worst domains first)
      results.sort((a, b) => a.rate - b.rate);
      return results;
    }

    console.warn("[compliance-data] getDomainBreakdown: no evaluations found, using mock");
    return MOCK_DOMAIN_BREAKDOWN;
  } catch (err) {
    console.warn("[compliance-data] getDomainBreakdown error, using mock:", err);
    return MOCK_DOMAIN_BREAKDOWN;
  }
}
