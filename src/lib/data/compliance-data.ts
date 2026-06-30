// ============================================================================
// Compliance Intelligence — Data Layer
// Source: Supabase tables → Standard GRC API → empty fallback
// Each function follows: DB query → API fallback → empty state (never crash)
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import * as standardApi from "@/lib/standard-api/client";
import { resolveFrameworkName, resolveFrameworkIcon } from "@/lib/assessment/framework-registry";
import { Redis } from "@upstash/redis";

// ── Redis Setup ─────────────────────────────────────────────────────────────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const CACHE_KEY_SCORES = "ihos:framework_scores";
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Type exports (unchanged)
// ---------------------------------------------------------------------------
// ... (keep interface FrameworkScore and others)
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
  default?: number; // compat placeholder
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
// calculateFrameworkScoresLocally()
// Computes framework compliance scores locally using database mappings
// ---------------------------------------------------------------------------

export async function calculateFrameworkScoresLocally(supabase: any): Promise<FrameworkScore[]> {
  try {
    // 1. Fetch all framework mappings in pages of 1000
    let mappings: any[] = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("scf_framework_mappings")
        .select("framework_code, target_control_id, scf_control_code")
        .range(page * pageSize, (page + 1) * pageSize - 1);
        
      if (error) {
        console.error(`[compliance-data] Error fetching mappings:`, error);
        break;
      }
      if (!data || data.length === 0) {
        break;
      }
      mappings = mappings.concat(data);
      if (data.length < pageSize) {
        break;
      }
      page++;
    }


    // 2. Fetch all evaluations
    const { data: evaluations, error: evalError } = await supabase
      .from("evidence_evaluations")
      .select("control_code, scf_control_code, is_compliant, confidence_score, evidence_sources");

    if (evalError) {
      console.error("[compliance-data] Error fetching evaluations:", evalError);
      return [];
    }

    const results: FrameworkScore[] = [];

    // Build evaluation lookup map keyed by scf_control_code (matches mappings)
    // Also index by control_code as fallback
    const evalMap = new Map<string, any>();
    if (evaluations) {
      for (const ev of evaluations) {
        // Primary key: scf_control_code (matches scf_framework_mappings)
        if (ev.scf_control_code) {
          // Keep the best evaluation per SCF control (prefer compliant)
          const existing = evalMap.get(ev.scf_control_code);
          if (!existing || (!existing.is_compliant && ev.is_compliant)) {
            evalMap.set(ev.scf_control_code, ev);
          }
        }
        // Secondary key: control_code (fallback for direct mapping)
        if (ev.control_code && !evalMap.has(ev.control_code)) {
          evalMap.set(ev.control_code, ev);
        }
      }
    }

    // Group mappings by framework_code
    const mappingsByFramework = new Map<string, any[]>();
    if (mappings) {
      for (const m of mappings) {
        const code = m.framework_code;
        if (!mappingsByFramework.has(code)) {
          mappingsByFramework.set(code, []);
        }
        mappingsByFramework.get(code)!.push(m);
      }
    }

    const dynamicFrameworks = Array.from(mappingsByFramework.keys());

    for (const code of dynamicFrameworks) {
      const fwMappings = mappingsByFramework.get(code) || [];
      const controlCodes = Array.from(new Set(fwMappings.map(m => m.scf_control_code)));
      const totalRequired = controlCodes.length;

      if (totalRequired === 0) {
        results.push({
          code,
          name: resolveFrameworkName(code),
          score: null,
          coverage: null,
          missing: 0,
          icon: FRAMEWORK_ICONS[code] ?? "📋",
          ismsScore: null,
          evidenceScore: null,
          conformingCount: null,
          partialCount: null,
          informalCount: null,
          gapCount: null,
        });
        continue;
      }

      // Filter evaluations that are mapped to this framework
      const fwEvals = controlCodes.map(c => evalMap.get(c)).filter(Boolean);
      const compliantCount = fwEvals.filter(e => e.is_compliant).length;
      
      // Calculate averages & phases
      let ismsCompliantCount = 0;
      let evidenceCompliantCount = 0;
      let conformingCount = 0;
      let partialCount = 0;
      let informalCount = 0;

      for (const ev of fwEvals) {
        let ismsOk = false;
        let evOk = false;
        let combinedStatus = "gap";

        if (ev.evidence_sources) {
          try {
            const sources = typeof ev.evidence_sources === "string"
              ? JSON.parse(ev.evidence_sources)
              : ev.evidence_sources;
            if (sources) {
              if (sources.combinedStatus) {
                combinedStatus = sources.combinedStatus;
                ismsOk = combinedStatus === "conforming" || combinedStatus === "partial";
                evOk = combinedStatus === "conforming" || combinedStatus === "informal";
              } else if (sources.ismsPhase && sources.evidencePhase) {
                ismsOk = (sources.ismsPhase.score ?? 0) >= 0.025;
                evOk = (sources.evidencePhase.score ?? 0) >= 0.025;
                if (ismsOk && evOk) combinedStatus = "conforming";
                else if (ismsOk) combinedStatus = "partial";
                else if (evOk) combinedStatus = "informal";
                else combinedStatus = "gap";
              }
            }
          } catch {
            // Ignore
          }
        }
        if (combinedStatus === "gap") {
          if (ev.is_compliant) {
            combinedStatus = "conforming";
            ismsOk = true;
            evOk = true;
          }
        }

        if (ismsOk) ismsCompliantCount++;
        if (evOk) evidenceCompliantCount++;
        
        if (combinedStatus === "conforming") conformingCount++;
        else if (combinedStatus === "partial") partialCount++;
        else if (combinedStatus === "informal") informalCount++;
      }

      const gapCount = totalRequired - conformingCount - partialCount - informalCount;

      // Weighted score: conforming=100%, partial=50%, informal=25%, gap=0%
      // This reflects maturity level rather than binary compliant/non-compliant
      const evaluatedControls = conformingCount + partialCount + informalCount;
      const weightedNumerator = (conformingCount * 1.0) + (partialCount * 0.5) + (informalCount * 0.25);
      const score = evaluatedControls > 0
        ? Math.round((weightedNumerator / totalRequired) * 100)
        : 0;
      const coverage = evaluatedControls > 0
        ? Math.round((evaluatedControls / totalRequired) * 100)
        : 0;
      const missing = totalRequired - evaluatedControls;

      const ismsScore = Math.round((ismsCompliantCount / totalRequired) * 100);
      const evidenceScore = Math.round((evidenceCompliantCount / totalRequired) * 100);

      results.push({
        code,
        name: resolveFrameworkName(code),
        score,
        coverage,
        missing,
        icon: resolveFrameworkIcon(code),
        ismsScore,
        evidenceScore,
        conformingCount,
        partialCount,
        informalCount,
        gapCount,
      });
    }

    return results;
  } catch (error) {
    console.error("[compliance-data] calculateFrameworkScoresLocally failed:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 1. getFrameworkScores()
// Query intelligence_snapshots for latest scores per framework.
// Fallback: local calculations from standard mappings.
// ---------------------------------------------------------------------------

export async function getFrameworkScores(): Promise<FrameworkScore[]> {
  // 1. Try serving from Redis cache first
  if (redis) {
    try {
      const cached = await redis.get<FrameworkScore[]>(CACHE_KEY_SCORES);
      if (cached && Array.isArray(cached)) {
        console.log("[compliance-data] Serving framework scores from Redis cache");
        return cached;
      }
    } catch (cacheErr) {
      console.warn("[compliance-data] Redis read error:", cacheErr);
    }
  }

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
          if (code === "all") continue; // skip overall aggregate for main dashboard list
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
        
        // Cache result in Redis
        if (redis) {
          try {
            await redis.set(CACHE_KEY_SCORES, results, { ex: CACHE_TTL_SECONDS });
          } catch (cacheErr) {
            console.warn("[compliance-data] Redis write error:", cacheErr);
          }
        }
        
        return results;
      }
    }

    // Fallback: calculate framework scores fully locally
    try {
      const localResults = await calculateFrameworkScoresLocally(supabase);
      if (localResults && localResults.length > 0) {
        // Cache fallback results in Redis
        if (redis) {
          try {
            await redis.set(CACHE_KEY_SCORES, localResults, { ex: CACHE_TTL_SECONDS });
          } catch (cacheErr) {
            console.warn("[compliance-data] Redis write error:", cacheErr);
          }
        }
        return localResults;
      }
    } catch (localErr) {
      console.warn("[compliance-data] Local calculation fallback failed:", localErr);
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
      target_frameworks: ["ISO 27701", "HIPAA", "ISO 27001"],
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
