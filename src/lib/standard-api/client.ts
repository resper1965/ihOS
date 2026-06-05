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

function getConfig(): StandardApiConfig {
  const baseUrl = process.env.STANDARD_GRC_API_URL;
  const apiKey = process.env.STANDARD_GRC_API_KEY;
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
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;

  // Inject tenant_id if available and not already provided
  const payload =
    config.tenantId && typeof body === "object" && body !== null && !("tenant_id" in body)
      ? { ...body, tenant_id: config.tenantId }
      : body;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const json = (await response.json()) as StandardApiResponse<TRes>;

    if (!response.ok || !json.success) {
      const error: StandardApiError = json.error ?? {
        code: `HTTP_${response.status}`,
        message: response.statusText || "Unknown error",
      };
      throw new StandardApiClientError(error.message, error.code, response.status, error.details);
    }

    return json.data;
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
  return post<ComplianceScoreRequest, ComplianceScoreData>("/compliance-score", request);
}

/**
 * Analyze cross-coverage between two frameworks.
 */
export async function crossCoverage(request: CrossCoverageRequest): Promise<CrossCoverageData> {
  return post<CrossCoverageRequest, CrossCoverageData>("/cross-coverage", request);
}

/**
 * Calculate optimal ROI path for framework compliance.
 */
export async function roiPath(request: RoiPathRequest): Promise<RoiPathData> {
  return post<RoiPathRequest, RoiPathData>("/roi-path", request);
}

/**
 * Analyze the blast radius of a control failure.
 */
export async function blastRadius(request: BlastRadiusRequest): Promise<BlastRadiusData> {
  return post<BlastRadiusRequest, BlastRadiusData>("/blast-radius", request);
}

/**
 * Evaluate evidence sufficiency for a control.
 */
export async function evaluateEvidence(request: EvaluateEvidenceRequest): Promise<EvaluateEvidenceData> {
  return post<EvaluateEvidenceRequest, EvaluateEvidenceData>("/evaluate-evidence", request);
}

/**
 * Translate risk into language appropriate for a target audience.
 */
export async function translateRisk(request: TranslateRiskRequest): Promise<TranslateRiskData> {
  return post<TranslateRiskRequest, TranslateRiskData>("/translate-risk", request);
}

/**
 * Triage a security incident and determine compliance impact.
 */
export async function triageIncident(request: TriageIncidentRequest): Promise<TriageIncidentData> {
  return post<TriageIncidentRequest, TriageIncidentData>("/triage-incident", request);
}

/**
 * Scan a vendor contract for compliance risks.
 */
export async function scanVendorContract(request: ScanVendorContractRequest): Promise<ScanVendorContractData> {
  return post<ScanVendorContractRequest, ScanVendorContractData>("/scan-vendor-contract", request);
}

/**
 * Multi-agent advisory council for complex compliance questions.
 */
export async function council(request: CouncilRequest): Promise<CouncilData> {
  return post<CouncilRequest, CouncilData>("/council", request);
}
