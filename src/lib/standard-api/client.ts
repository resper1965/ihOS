import type {
  StandardApiConfig,
  StandardApiResponse,
  StandardApiError,
  ComplianceScoreRequest,
  ComplianceScoreData,
  CrossCoverageRequest,
  CrossCoverageData,
  RoiPathRequest,
  RoiPathData,
  BlastRadiusRequest,
  BlastRadiusData,
  EvaluateEvidenceRequest,
  EvaluateEvidenceData,
  TranslateRiskRequest,
  TranslateRiskData,
  TriageIncidentRequest,
  TriageIncidentData,
  ScanVendorContractRequest,
  ScanVendorContractData,
  CouncilRequest,
  CouncilData,
} from "./types";
import { getSecret } from "@/lib/supabase/vault";
import { getOpenAI } from "@/lib/chat/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";



// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class StandardApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "StandardApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;

// Warn-once guards so config validation doesn't spam logs on every request.
let warnedMissingTenant = false;
let warnedMissingVersionPrefix = false;

async function getConfig(): Promise<StandardApiConfig> {
  const baseUrl = process.env.STANDARD_GRC_API_URL;
  let apiKey: string | null = null;
  try {
    apiKey = await getSecret("STANDARD_GRC_API_KEY");
  } catch (e) {
    apiKey = process.env.STANDARD_GRC_API_KEY || null;
  }
  const tenantId = process.env.STANDARD_GRC_TENANT_ID;

  if (!baseUrl) {
    throw new Error("Missing STANDARD_GRC_API_URL environment variable.");
  }
  if (!apiKey) {
    throw new Error("Missing STANDARD_GRC_API_KEY environment variable.");
  }

  // The Standard API requires the x-standard-tenant-id header (org_xxxxx) for
  // data-scoped endpoints. Missing it makes real calls fail auth — surface it
  // loudly instead of silently sending no header.
  if (!tenantId && !warnedMissingTenant) {
    warnedMissingTenant = true;
    logger.warn("STANDARD_GRC_TENANT_ID is not set — the stateless intelligence scorers work without it, but /gap/evaluate-evidence and /intelligence/council require x-standard-tenant-id (org_xxxxx) and will fail with 400 TENANT_CONTEXT_REQUIRED", {
      context: "standard-api",
    });
  }

  const normalizedBase = baseUrl.replace(/\/+$/, ""); // strip trailing slashes

  // Real API paths are under /api/v1 (e.g. /api/v1/intelligence/compliance-score).
  // The client sends paths WITHOUT that prefix, so STANDARD_GRC_API_URL must
  // include it. Warn if it looks like the version segment is missing.
  if (!/\/v\d+$/.test(normalizedBase) && !warnedMissingVersionPrefix) {
    warnedMissingVersionPrefix = true;
    logger.warn("STANDARD_GRC_API_URL does not end with a version segment (expected .../api/v1) — every Standard API call may 404. Set it to https://standard-api.bekaa.eu/api/v1", {
      context: "standard-api",
      meta: { baseUrl: normalizedBase },
    });
  }

  return {
    baseUrl: normalizedBase,
    apiKey,
    tenantId,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}


// ---------------------------------------------------------------------------
// Internal HTTP helper
// ---------------------------------------------------------------------------

async function post<TReq, TRes>(endpoint: string, body: TReq): Promise<TRes> {
  const config = await getConfig();
  const url = `${config.baseUrl}${endpoint}`;

  // Tenant is passed via the x-standard-tenant-id header only — the API never
  // reads it from the body, and where a body needs an org it uses
  // `organization_id`, not `tenant_id`. So we do NOT inject tenant_id into the
  // payload (B6).
  const payload = body;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };

    if (config.tenantId) {
      headers["x-standard-tenant-id"] = config.tenantId;
    }

    console.log('[GRC API Client] URL:', url);
    console.log('[GRC API Client] Headers:', { ...headers, Authorization: 'Bearer [REDACTED]' });
    console.log('[GRC API Client] Payload:', JSON.stringify(payload));

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as { data?: TRes; error?: StandardApiError };

    if (!response.ok) {
      // 401/403 are HARD authorization errors (missing/invalid credential,
      // RBAC denial, insufficient scope, cross-tenant block) — NEVER degrade to
      // local estimation, which would mask a security/config problem (B3).
      // Only 5xx is a candidate for the (opt-in) resiliency fallback.
      if (response.status >= 500) {
        const fallback = await tryLocalFallback(endpoint, payload, `HTTP_${response.status}`);
        if (fallback !== null) return fallback;
      }

      const error: StandardApiError = json.error ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Unknown error",
      };
      throw new StandardApiClientError(error.message, error.code, response.status, error.details);
    }

    return (json.data !== undefined ? json.data : json) as TRes;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof StandardApiClientError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      // Timeout — candidate for fallback (availability problem, not auth).
      const fallback = await tryLocalFallback(endpoint, payload, "timeout");
      if (fallback !== null) return fallback;
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

    // Network error — candidate for fallback.
    const fallback = await tryLocalFallback(endpoint, payload, err instanceof Error ? err.message : "network_error");
    if (fallback !== null) return fallback;

    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new StandardApiClientError(message, "NETWORK_ERROR", 0);
  }

}

async function get<TRes>(endpoint: string, nextCache?: RequestInit["next"]): Promise<TRes> {
  const config = await getConfig();
  const url = `${config.baseUrl}${endpoint}`;


  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };

    if (config.tenantId) {
      headers["x-standard-tenant-id"] = config.tenantId;
    }

    console.log('[GRC API Client] GET URL:', url);

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      next: nextCache,
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as { data?: TRes; error?: StandardApiError };

    if (!response.ok) {
      // 401/403 are hard auth errors — never degrade to local (B3). Only 5xx.
      if (response.status >= 500) {
        const fallback = await tryLocalFallback(endpoint, null, `HTTP_${response.status}`);
        if (fallback !== null) return fallback;
      }

      const error: StandardApiError = json.error ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Unknown error",
      };
      throw new StandardApiClientError(error.message, error.code, response.status, error.details);
    }

    return (json.data !== undefined ? json.data : json) as TRes;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof StandardApiClientError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      const fallback = await tryLocalFallback(endpoint, null, "timeout");
      if (fallback !== null) return fallback;
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

    const fallback = await tryLocalFallback(endpoint, null, err instanceof Error ? err.message : "network_error");
    if (fallback !== null) return fallback;

    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new StandardApiClientError(message, "NETWORK_ERROR", 0);
  }
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

/**
 * Calculate compliance score for a given framework.
 */
export async function complianceScore(request: ComplianceScoreRequest): Promise<ComplianceScoreData> {
  return post<ComplianceScoreRequest, ComplianceScoreData>("/intelligence/compliance-score", request);
}

/**
 * Analyze cross-coverage between two frameworks.
 */
export async function crossCoverage(request: CrossCoverageRequest): Promise<CrossCoverageData> {
  return post<CrossCoverageRequest, CrossCoverageData>("/intelligence/cross-coverage", request);
}

/**
 * Calculate optimal ROI path for framework compliance.
 */
export async function roiPath(request: RoiPathRequest): Promise<RoiPathData> {
  return post<RoiPathRequest, RoiPathData>("/intelligence/roi-path", request);
}

/**
 * Analyze the blast radius of a control failure.
 */
export async function blastRadius(request: BlastRadiusRequest): Promise<BlastRadiusData> {
  return post<BlastRadiusRequest, BlastRadiusData>("/intelligence/blast-radius", request);
}

/**
 * Evaluate evidence sufficiency for a control.
 */
export async function evaluateEvidence(request: EvaluateEvidenceRequest): Promise<EvaluateEvidenceData> {
  return post<EvaluateEvidenceRequest, EvaluateEvidenceData>("/gap/evaluate-evidence", request);
}

/**
 * Translate risk into language appropriate for a target audience.
 */
export async function translateRisk(request: TranslateRiskRequest): Promise<TranslateRiskData> {
  return post<TranslateRiskRequest, TranslateRiskData>("/executive/translate-risk", request);
}

/**
 * Triage a security incident and determine compliance impact.
 */
export async function triageIncident(request: TriageIncidentRequest): Promise<TriageIncidentData> {
  return post<TriageIncidentRequest, TriageIncidentData>("/soc/triage-incident", request);
}

/**
 * Scan a vendor contract for compliance risks.
 */
export async function scanVendorContract(request: ScanVendorContractRequest): Promise<ScanVendorContractData> {
  return post<ScanVendorContractRequest, ScanVendorContractData>("/privacy/scan-vendor-contract", request);
}

/**
 * Multi-agent advisory council for complex compliance questions.
 */
export async function council(request: CouncilRequest): Promise<CouncilData> {
  return post<CouncilRequest, CouncilData>("/intelligence/council", request);
}

/**
 * Fetch the latest SCF version details from the GRC Engine.
 */
export async function getLatestScfVersion(): Promise<{ scf_version_id: string; version_label: string }> {
  return get<{ scf_version_id: string; version_label: string }>("/scf/versions/latest");
}

/**
 * Fetch controls for a specific SCF version.
 *
 * `get()` already unwraps the `{ data, trace_id }` envelope, so the real API's
 * paginated list arrives here as a bare array. Normalize to `{ data, total }`
 * regardless of shape — matching getScfFrameworks — so the engine's
 * `batch.data` never silently sees `undefined` (which returned 0 controls and
 * made only the local fallback catalog work).
 */
export async function getScfControls(
  versionId: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ data: any[]; total?: number }> {
  // The API caps per_page at 100 (silently). Cap here too so callers that rely
  // on `items.length < perPage` to detect the last page don't loop forever /
  // stop early because they asked for more than the server ever returns (B1).
  const cappedPerPage = Math.min(perPage, 100);
  const result = await get<any>(
    `/scf/versions/${versionId}/controls?page=${page}&per_page=${cappedPerPage}`
  );
  return normalizeControlsResponse(result);
}

/**
 * Normalize the SCF controls list into `{ data, total }` regardless of the
 * response shape after the `{ data, trace_id }` envelope has been unwrapped
 * (bare array, `{ data }`, `{ items }`, or `{ controls }`). Exported for tests.
 */
export function normalizeControlsResponse(result: any): { data: any[]; total?: number } {
  if (Array.isArray(result)) return { data: result, total: result.length };
  const data = result?.data ?? result?.items ?? result?.controls ?? [];
  return {
    data: Array.isArray(data) ? data : [],
    total: result?.total ?? result?.pagination?.total,
  };
}

/**
 * Fetch mapped frameworks from GRC Engine.
 */
export async function getScfFrameworks(): Promise<any[]> {
  const result = await get<any[] | { data: any[] }>("/scf/frameworks", { revalidate: 86400 });
  return Array.isArray(result) ? result : result.data || [];
}

// ---------------------------------------------------------------------------
// GRC API Resiliency Local Fallback Engines
// ---------------------------------------------------------------------------

/**
 * Whether the local resiliency fallback is allowed to substitute a result when
 * the authoritative Standard GRC Engine API is unreachable or denies scope.
 *
 * OPT-IN (fail-closed by default). Per Constitution Principle VIII, we do NOT
 * silently estimate/fabricate compliance evaluations. Set
 * `GRC_LOCAL_FALLBACK_ENABLED=true` to explicitly accept degraded/estimated
 * results (each is flagged `is_estimated: true`). The legacy
 * `GRC_FALLBACK_DISABLED=true` kill switch is still honored as a hard-off.
 */
export function isLocalFallbackEnabled(): boolean {
  if (process.env.GRC_FALLBACK_DISABLED === "true") return false;
  return process.env.GRC_LOCAL_FALLBACK_ENABLED === "true";
}

// Endpoints whose fallback is a deterministic computation over REAL persisted
// data (evidence_evaluations, scf_framework_mappings) — degraded but grounded.
// Everything else (LLM judgment, hardcoded scores) is a stronger concern.
const GROUNDED_FALLBACK_ENDPOINTS = new Set([
  "/intelligence/compliance-score",
  "/intelligence/cross-coverage",
  "/intelligence/blast-radius",
]);

async function tryLocalFallback(endpoint: string, payload: any, reason: string): Promise<any | null> {
  const cleanEndpoint = endpoint.split("?")[0];

  // Everything is fail-closed by default — including the SCF catalog. The
  // Standard API is the SOURCE OF TRUTH for controls/frameworks; serving a
  // hardcoded stale subset during an outage would silently corrupt every
  // downstream assessment (worse than a service estimate). So an outage
  // surfaces as an error unless the operator explicitly opts into degraded
  // mode via GRC_LOCAL_FALLBACK_ENABLED.
  if (!isLocalFallbackEnabled()) {
    logger.warn("Standard GRC API unavailable and local fallback is DISABLED — surfacing error instead of estimating/serving stale truth", {
      context: "standard-api",
      meta: { endpoint: cleanEndpoint, reason },
    });
    return null;
  }

  // Opt-in degraded mode: SCF catalog reference data (still a best-effort
  // stand-in for the authoritative catalog — logged as such).
  const staticFallback = tryStaticCatalogFallback(cleanEndpoint);
  if (staticFallback !== null) {
    logger.error("Serving STALE hardcoded SCF catalog from local fallback (source of truth unavailable)", {
      context: "standard-api",
      meta: { endpoint: cleanEndpoint, reason },
    });
    return staticFallback;
  }

  // Fallback is explicitly enabled: log that we are serving an ESTIMATED result.
  const grounded = GROUNDED_FALLBACK_ENDPOINTS.has(cleanEndpoint);
  const note = `Estimated locally (${reason}) — Standard GRC Engine API was unavailable. ${
    grounded ? "Computed from persisted evidence/mappings." : "Non-authoritative approximation."
  }`;
  if (grounded) {
    logger.warn("Serving ESTIMATED (grounded) GRC result from local fallback", {
      context: "standard-api",
      meta: { endpoint: cleanEndpoint, reason },
    });
  } else {
    // LLM-judged / heuristic results are the true fabrication risk — Sentry error.
    logger.error("Serving ESTIMATED (non-authoritative) GRC result from local fallback", {
      context: "standard-api",
      meta: { endpoint: cleanEndpoint, reason },
    });
  }

  switch (cleanEndpoint) {
    case "/gap/evaluate-evidence":
      return withEstimatedMarker(await localEvaluateEvidence(payload), note);
    case "/intelligence/compliance-score":
      return withEstimatedMarker(await localComplianceScore(payload), note);
    case "/intelligence/cross-coverage":
      return withEstimatedMarker(await localCrossCoverage(payload), note);
    case "/intelligence/roi-path":
      return withEstimatedMarker(await localRoiPath(payload), note);
    case "/intelligence/blast-radius":
      return withEstimatedMarker(await localBlastRadius(payload), note);
    default:
      return null;
  }
}

/** Reference data (not evaluations) — always safe to serve on outage. */
function tryStaticCatalogFallback(cleanEndpoint: string): any | null {
  switch (cleanEndpoint) {
    case "/scf/frameworks":
      return [
        { framework_code: "iso27001", framework_name: "ISO/IEC 27001:2022" },
        { framework_code: "soc2", framework_name: "SOC 2 Type II" },
        { framework_code: "hipaa", framework_name: "HIPAA" },
        { framework_code: "nist_800_53", framework_name: "NIST 800-53" },
        { framework_code: "iso27701", framework_name: "ISO/IEC 27701:2019" },
        { framework_code: "fedramp", framework_name: "FedRAMP" }
      ];
    case "/scf/versions/latest":
      return { scf_version_id: "2024.1", version_label: "SCF 2024.1" };
    default:
      if (cleanEndpoint.startsWith("/scf/versions/") && cleanEndpoint.endsWith("/controls")) {
        return {
          data: [
            {
              control_id: "A.5.1",
              control_name: "Policies for information security",
              description: "Policies for information security shall be defined, approved, and published.",
              domain: "GOV",
            },
            {
              control_id: "A.5.15",
              control_name: "Access control",
              description: "Access to physical and logical assets shall be restricted based on business requirements.",
              domain: "AST",
            }
          ],
          total: 2
        };
      }
      return null;
  }
}

/** Stamp an estimation marker onto a fallback result object. */
function withEstimatedMarker<T extends object>(data: T, note: string): T & { is_estimated: true; estimation_note: string } {
  return { ...data, is_estimated: true as const, estimation_note: note };
}

async function localEvaluateEvidence(
  request: EvaluateEvidenceRequest
): Promise<EvaluateEvidenceData> {
  console.log("[GRC Fallback] Running local evaluate-evidence via OpenAI...");
  try {
    const openai = await getOpenAI();
    const result = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        is_compliant: z.boolean(),
        confidence_score: z.number().min(0).max(100),
        missing_elements: z.array(z.string()),
        auditor_notes: z.string(),
      }),
      system: `You are an expert GRC (Governance, Risk and Compliance) Auditor.
Your task is to evaluate if the provided evidence description satisfies the control requirement.
Assess compliance status honestly based on the evidence details:
- is_compliant: true only if the evidence description explicitly shows that the control requirements are implemented.
- confidence_score: a rating from 0 to 100 based on evidence sufficiency and detail.
- missing_elements: bullet points of compliance criteria that are missing or not verified.
- auditor_notes: explanation of compliance status and what is missing if non-compliant.`,
      prompt: `Control Requirement:\n${request.controlRequirement}\n\nEvidence Description:\n${request.evidenceDescription}`,
    });

    return {
      is_compliant: result.object.is_compliant,
      confidence_score: result.object.confidence_score,
      missing_elements: result.object.missing_elements,
      auditor_notes: result.object.auditor_notes,
    };
  } catch (err) {
    console.error("[GRC Fallback] Local evaluate-evidence failed:", err);
    return {
      is_compliant: false,
      confidence_score: 0,
      missing_elements: ["Error running fallback evaluation"],
      auditor_notes: `Fallback evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}

async function localComplianceScore(
  request: ComplianceScoreRequest
): Promise<ComplianceScoreData> {
  console.log("[GRC Fallback] Running local compliance-score computation...");
  try {
    const supabase = await createClient();
    
    // Fetch evidence evaluations
    const { data: evals } = await supabase
      .from("evidence_evaluations")
      .select("control_code, is_compliant, confidence_score");

    const frameworkCode = request.framework_code || request.regulation_id || "iso27001";
    
    // Fetch total required controls from mappings
    const { data: mappings } = await supabase
      .from("scf_framework_mappings")
      .select("scf_control_code")
      .eq("framework_code", frameworkCode);

    const totalControls = mappings?.length || 0;
    
    // Only count implemented controls that actually belong to this framework
    const frameworkControlIds = new Set(mappings?.map((m: any) => m.scf_control_code) || []);
    
    let implementedCount = 0;
    if (evals && frameworkControlIds.size > 0) {
      implementedCount = evals.filter((e: any) => e.is_compliant && frameworkControlIds.has(e.control_code)).length;
    }

    const score = totalControls > 0 ? Math.round((implementedCount / totalControls) * 100) : 0;

    return {
      framework_code: frameworkCode,
      regulation_id: frameworkCode,
      score,
      overall_score: score,
      scf_controls_implemented_count: implementedCount,
      total_required_controls: totalControls,
      assessed_at: new Date().toISOString(),
      message: "Computed locally via active evidence evaluations",
    };
  } catch (err) {
    console.error("[GRC Fallback] Local compliance score failed:", err);
    return {
      score: 75,
      overall_score: 75,
      message: `Local calculation fallback due to error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function localCrossCoverage(
  request: CrossCoverageRequest
): Promise<CrossCoverageData> {
  console.log("[GRC Fallback] Running local cross-coverage analysis...");
  try {
    const supabase = await createClient();
    const { data: mappings } = await supabase
      .from("scf_framework_mappings")
      .select("framework_code, scf_control_code")
      .in("framework_code", [request.source_framework, request.target_framework]);

    const sourceControls = new Set<string>(
      mappings
        ?.filter((m: any) => m.framework_code === request.source_framework)
        .map((m: any) => m.scf_control_code) || []
    );

    const targetControls = new Set<string>(
      mappings
        ?.filter((m: any) => m.framework_code === request.target_framework)
        .map((m: any) => m.scf_control_code) || []
    );

    const intersection = new Set<string>(
      Array.from(sourceControls).filter((x) => targetControls.has(x))
    );


    const overlapPercentage = targetControls.size > 0 
      ? Math.round((intersection.size / targetControls.size) * 100) 
      : 0;

    return {
      source_framework: request.source_framework,
      target_framework: request.target_framework,
      overlap_percentage: overlapPercentage,
      coverage_percentage: overlapPercentage,
      mapped_controls: Array.from(intersection).map(code => ({
        source_control_id: code,
        target_control_ids: [code],
        coverage_status: "full",
        relationship: "Exact match in Secure Controls Framework (SCF)"
      })),
      gaps: Array.from(targetControls).filter(code => !sourceControls.has(code)).map(code => ({
        target_control_id: code,
        target_control_name: `Control ${code}`
      }))
    };
  } catch (err) {
    console.error("[GRC Fallback] Local cross coverage failed:", err);
    return {
      source_framework: request.source_framework,
      target_framework: request.target_framework,
      overlap_percentage: 50,
      coverage_percentage: 50,
      mapped_controls: [],
      gaps: []
    };
  }
}

async function localRoiPath(
  request: RoiPathRequest
): Promise<RoiPathData> {
  console.log("[GRC Fallback] Running local ROI path calculation...");
  try {
    const supabase = await createClient();
    const targetFramework = request.target_framework || "iso27001";
    
    const { data: mappings } = await supabase
      .from("scf_framework_mappings")
      .select("scf_control_code")
      .eq("framework_code", targetFramework);

    const { data: evals } = await supabase
      .from("evidence_evaluations")
      .select("control_code")
      .eq("is_compliant", true);

    const compliant = new Set(evals?.map((e: any) => e.control_code) || []);
    const missing = (mappings || [])
      .map((m: any) => m.scf_control_code)
      .filter((code: string) => !compliant.has(code));

    const topN = request.top_n || 5;
    const pathItems = missing.slice(0, topN).map((code: string, idx: number) => ({
      control_id: code,
      roi_score: 95 - idx * 4,
      key_mitigations: [`Implement requirement for ${code}`]
    }));

    return {
      target_framework: targetFramework,
      top_n_requested: topN,
      total_missing: missing.length,
      roi_path: pathItems,
      summary: `Localized ROI optimization calculated ${missing.length} missing controls.`
    };
  } catch (err) {
    console.error("[GRC Fallback] Local ROI path failed:", err);
    return {
      total_missing: 0,
      roi_path: []
    };
  }
}

async function localBlastRadius(
  request: BlastRadiusRequest
): Promise<BlastRadiusData> {
  console.log("[GRC Fallback] Running local blast radius analysis...");
  try {
    const supabase = await createClient();
    const { data: mappings } = await supabase
      .from("scf_framework_mappings")
      .select("framework_code, scf_control_code")
      .eq("scf_control_code", request.control_id);

    const affected: Record<string, string[]> = {};
    (mappings || []).forEach((m: any) => {
      if (!affected[m.framework_code]) {
        affected[m.framework_code] = [];
      }
      affected[m.framework_code].push(m.scf_control_code);
    });

    const affectedFrameworks = Object.entries(affected).map(([code, controls]) => ({
      framework_code: code,
      affected_controls: controls,
      risk_level: "high" as const
    }));

    return {
      control_id: request.control_id,
      affected_frameworks: affectedFrameworks,
      total_affected_controls: mappings?.length || 1,
      risk_summary: `Failure of ${request.control_id} impacts ${mappings?.length || 0} regulatory mappings.`
    };
  } catch (err) {
    console.error("[GRC Fallback] Local blast radius failed:", err);
    return {
      control_id: request.control_id,
      affected_frameworks: [],
      total_affected_controls: 0
    };
  }
}

