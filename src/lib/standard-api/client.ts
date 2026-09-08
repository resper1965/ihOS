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
import { logger } from "@/lib/logger";
import type { paths } from "./generated/schema";

// Response shapes taken from the vendor's published spec rather than
// hand-maintained. See docs/superpowers/plans/2026-08-26-generated-api-types.md
// for why: finding A9 was a control_id (uuid) / control_code (code) mismatch
// that these types make a compile error.
type Json200<P extends keyof paths, M extends keyof paths[P]> =
  paths[P][M] extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never;

export type ScfControlsResponse = Json200<'/api/v1/scf/versions/{scfVersionId}/controls', 'get'>;
export type ScfControl = NonNullable<ScfControlsResponse['data']>[number];

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

    // NOTE: do not log the payload — request bodies carry free-text evidence,
    // contract, and incident content that must not leak into production logs.
    console.log('[GRC API Client] POST', url);

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
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

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
      // 401/403 are hard auth errors — never degrade to local (B3).
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
      throw new StandardApiClientError(
        `Request to ${endpoint} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        "TIMEOUT",
        408,
      );
    }

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
  return await get<{ scf_version_id: string; version_label: string }>("/scf/versions/latest");
}

/**
 * Fetch controls for a specific SCF version.
 *
 * `get()` already unwraps the `{ data, trace_id }` envelope, so the real API's
 * paginated list arrives here as a bare array. Normalize to `{ data, total }`
 * regardless of shape — matching getScfFrameworks — so the engine's
 * `batch.data` never silently sees `undefined`.
 */
export async function getScfControls(
  versionId: string,
  page: number = 1,
  perPage: number = 100
): Promise<{ data: ScfControl[]; total?: number }> {
  const cappedPerPage = Math.min(perPage, 100);
  const endpoint = `/scf/versions/${versionId}/controls?page=${page}&per_page=${cappedPerPage}`;
  const result = await get<any>(endpoint);
  return normalizeControlsResponse(result);
}

/**
 * Normalize the SCF controls list into `{ data, total }` regardless of the
 * response shape after the `{ data, trace_id }` envelope has been unwrapped
 * (bare array, `{ data }`, `{ items }`, or `{ controls }`). The real API
 * returns `{ data, pagination }` per the vendor's spec. Exported for tests.
 */
export function normalizeControlsResponse(result: any): { data: ScfControl[]; total?: number } {
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

