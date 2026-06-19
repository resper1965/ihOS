// ============================================================================
// Compliance Intelligence — Data Layer
// Source: Supabase tables → Standard GRC API → empty fallback
// Each function follows: DB query → API fallback → empty state (never crash)
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
  // 2-Phase addition:
  ismsScore?: number | null;
  evidenceScore?: number | null;
  conformingCount?: number | null;
  partialCount?: number | null;
  informalCount?: number | null;
  gapCount?: number | null;
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
  // 2-Phase addition:
  ismsCompliantCount: number;
  evidenceCompliantCount: number;
  ismsRate: number;
  evidenceRate: number;
}



// ---------------------------------------------------------------------------
// Icon map for framework codes
// ---------------------------------------------------------------------------

const FRAMEWORK_ICONS: Record<string, string> = {
  "BR-LGPD": "🇧🇷",
  "HI-2013": "🏥",
  "TX-LEVEL-2": "⭐",
  "iso27001": "🔒",
  "iso27701": "🛡️",
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
// Fallback: Standard API complianceScore(). Final fallback: empty array.
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
            // 2-Phase addition:
            ismsScore: (data?.isms_score as number) ?? null,
            evidenceScore: (data?.evidence_score as number) ?? null,
            conformingCount: (data?.conforming_count as number) ?? null,
            partialCount: (data?.partial_count as number) ?? null,
            informalCount: (data?.informal_count as number) ?? null,
            gapCount: (data?.gap_count as number) ?? null,
          });
        }
        return results;
      }
    }

    // Fallback: try Standard API for each known framework
    try {
      const frameworks = ["iso27001", "iso27701", "BR-LGPD", "HI-2013", "TX-LEVEL-2", "EU-GDPR"];
      const results: FrameworkScore[] = [];

      for (const code of frameworks) {
        try {
          const apiResult = await standardApi.complianceScore({ framework_code: code });
          results.push({
            code,
            name: code,
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

    console.warn("[compliance-data] getFrameworkScores: no data available");
    return [];
  } catch (err) {
    console.warn("[compliance-data] getFrameworkScores error:", err);
    return [];
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

    console.warn("[compliance-data] getEvaluationSummary: no evaluations found");
    return { total: 0, compliant: 0, nonCompliant: 0, avgConfidence: 0 };
  } catch (err) {
    console.warn("[compliance-data] getEvaluationSummary error:", err);
    return { total: 0, compliant: 0, nonCompliant: 0, avgConfidence: 0 };
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
      .select("control_code, domain_code, control_name, confidence_score, missing_elements, scf_control_code, control_requirement")
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
          code: g.control_code ?? g.scf_control_code ?? 'UNKNOWN',
          domain: g.domain_code ?? 'UNKNOWN',
          name: g.control_name ?? g.control_requirement ?? 'Unknown Control',
          confidence: conf,
          status,
          missingElements: (g.missing_elements as string[] | null) ?? undefined,
        };
      });
    }

    console.warn("[compliance-data] getTopGaps: no gaps found");
    return [];
  } catch (err) {
    console.warn("[compliance-data] getTopGaps error:", err);
    return [];
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

    console.warn("[compliance-data] getRoiPath: API returned empty");
    return [];
  } catch (err) {
    console.warn("[compliance-data] getRoiPath error:", err);
    return [];
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
      .select("domain_code, is_compliant, evidence_sources");

    if (error) throw error;

    if (evaluations && evaluations.length > 0) {
      // Group by domain_code
      const domainMap = new Map<string, { total: number; compliant: number; ismsCompliant: number; evidenceCompliant: number }>();

      for (const ev of evaluations) {
        const domain = ev.domain_code ?? 'UNKNOWN';
        if (!domainMap.has(domain)) {
          domainMap.set(domain, { total: 0, compliant: 0, ismsCompliant: 0, evidenceCompliant: 0 });
        }
        const entry = domainMap.get(domain)!;
        entry.total++;
        if (ev.is_compliant) entry.compliant++;

        // Resolve individual phases compliance from evidence_sources
        let ismsOk = ev.is_compliant;
        let evOk = ev.is_compliant;
        if (ev.evidence_sources) {
          try {
            const sources = typeof ev.evidence_sources === 'string'
              ? JSON.parse(ev.evidence_sources)
              : ev.evidence_sources;
            if (sources && sources.ismsPhase && sources.evidencePhase) {
              ismsOk = (sources.ismsPhase.score ?? 0) >= 0.025;
              evOk = (sources.evidencePhase.score ?? 0) >= 0.025;
            }
          } catch (e) {
            console.warn('[compliance-data] Failed to parse evidence_sources JSON:', e);
          }
        }

        if (ismsOk) entry.ismsCompliant++;
        if (evOk) entry.evidenceCompliant++;
      }

      const results: DomainBreakdown[] = [];
      for (const [domain, stats] of domainMap) {
        results.push({
          domain,
          fullName: DOMAIN_FULL_NAMES[domain] ?? domain,
          total: stats.total,
          compliant: stats.compliant,
          rate: Math.round((stats.compliant / stats.total) * 100),
          ismsCompliantCount: stats.ismsCompliant,
          evidenceCompliantCount: stats.evidenceCompliant,
          ismsRate: Math.round((stats.ismsCompliant / stats.total) * 100),
          evidenceRate: Math.round((stats.evidenceCompliant / stats.total) * 100),
        });
      }

      // Sort by rate ascending (worst domains first)
      results.sort((a, b) => a.rate - b.rate);
      return results;
    }

    console.warn("[compliance-data] getDomainBreakdown: no evaluations found");
    return [];
  } catch (err) {
    console.warn("[compliance-data] getDomainBreakdown error:", err);
    return [];
  }
}
