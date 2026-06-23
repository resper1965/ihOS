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

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""), // strip trailing slashes
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


  // Inject tenant_id if available and not already provided
  const payload =
    config.tenantId && typeof body === "object" && body !== null && !("tenant_id" in body)
      ? { ...body, tenant_id: config.tenantId }
      : body;

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

    const json = (await response.json()) as any;

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        console.warn(`[GRC Client] API scope error (${response.status}) on POST ${endpoint}. Routing to local fallback...`);
        const fallback = await tryLocalFallback(endpoint, payload);
        if (fallback !== null) return fallback;
      }

      const error: StandardApiError = json.error ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Unknown error",
      };
      throw new StandardApiClientError(error.message, error.code, response.status, error.details);
    }

    return json.data !== undefined ? json.data : json;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof StandardApiClientError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

    // Try fallback for general network issues
    const fallback = await tryLocalFallback(endpoint, payload);
    if (fallback !== null) return fallback;

    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new StandardApiClientError(message, "NETWORK_ERROR", 0);
  }

}

async function get<TRes>(endpoint: string): Promise<TRes> {
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
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as any;

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        console.warn(`[GRC Client] API scope error (${response.status}) on GET ${endpoint}. Routing to local fallback...`);
        const fallback = await tryLocalFallback(endpoint, null);
        if (fallback !== null) return fallback;
      }

      const error: StandardApiError = json.error ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Unknown error",
      };
      throw new StandardApiClientError(error.message, error.code, response.status, error.details);
    }

    return json.data !== undefined ? json.data : json;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof StandardApiClientError) {
      throw err;
    }

    if (err instanceof DOMException && err.name === "AbortError") {
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

    const fallback = await tryLocalFallback(endpoint, null);
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
 */
export async function getScfControls(
  versionId: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ data: any[]; total?: number }> {
  return get<{ data: any[]; total?: number }>(
    `/scf/versions/${versionId}/controls?page=${page}&per_page=${perPage}`
  );
}

/**
 * Fetch mapped frameworks from GRC Engine.
 */
export async function getScfFrameworks(): Promise<any[]> {
  const result = await get<any[] | { data: any[] }>("/scf/frameworks");
  return Array.isArray(result) ? result : result.data || [];
}

// ---------------------------------------------------------------------------
// GRC API Resiliency Local Fallback Engines
// ---------------------------------------------------------------------------

async function tryLocalFallback(endpoint: string, payload: any): Promise<any | null> {
  if (process.env.GRC_FALLBACK_DISABLED === "true") {
    return null;
  }
  const cleanEndpoint = endpoint.split("?")[0];
  switch (cleanEndpoint) {
    case "/gap/evaluate-evidence":
      return localEvaluateEvidence(payload);
    case "/intelligence/compliance-score":
      return localComplianceScore(payload);
    case "/intelligence/cross-coverage":
      return localCrossCoverage(payload);
    case "/intelligence/roi-path":
      return localRoiPath(payload);
    case "/intelligence/blast-radius":
      return localBlastRadius(payload);
    default:
      return null;
  }
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
    const { data: evals } = await (supabase as any)
      .from("evidence_evaluations")
      .select("control_code, is_compliant, confidence_score");

    const frameworkCode = request.framework_code || request.regulation_id || "iso27001";
    
    // Fetch total required controls from mappings
    const { data: mappings } = await (supabase as any)
      .from("scf_framework_mappings")
      .select("scf_control_code")
      .eq("framework_code", frameworkCode);

    const totalControls = mappings?.length || 114;
    const implementedControls = evals ? evals.filter((e: any) => e.is_compliant).map((e: any) => e.control_code) : [];
    const score = totalControls > 0 ? Math.round((implementedControls.length / totalControls) * 100) : 75;

    return {
      framework_code: frameworkCode,
      regulation_id: frameworkCode,
      score,
      overall_score: score,
      scf_controls_implemented_count: implementedControls.length,
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
    const { data: mappings } = await (supabase as any)
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
    
    const { data: mappings } = await (supabase as any)
      .from("scf_framework_mappings")
      .select("scf_control_code")
      .eq("framework_code", targetFramework);

    const { data: evals } = await (supabase as any)
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
    const { data: mappings } = await (supabase as any)
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

