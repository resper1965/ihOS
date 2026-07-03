// TypeScript interfaces for the Standard GRC Engine API
// Base URL: STANDARD_GRC_API_URL (e.g. https://api.standardgrc.com/v1)

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface StandardApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Marker attached to any result produced by the local resiliency fallback
// instead of the authoritative Standard GRC Engine API. Consumers MUST treat
// `is_estimated: true` as non-authoritative (never cache/persist it as the
// current truth, and surface it for review).
export interface EstimatedResultMarker {
  is_estimated?: boolean;
  estimation_note?: string;
}

export interface StandardApiResponse<T> {
  success: boolean;
  data: T;
  error?: StandardApiError;
}

// ---------------------------------------------------------------------------
// 1. Compliance Score
// ---------------------------------------------------------------------------

export interface ComplianceScoreRequest {
  framework_code?: string; // legacy / cron compat
  regulation_id?: string; // real API
  scf_controls_implemented?: string[]; // real API
  tenant_id?: string;
}

export interface ComplianceScoreData extends EstimatedResultMarker {
  framework_code?: string;
  regulation_id?: string;
  score?: number; // real API
  overall_score?: number; // legacy compat
  scf_controls_implemented_count?: number;
  total_required_controls?: number;
  missing_controls?: any[];
  control_scores?: Array<{
    control_id: string;
    control_name: string;
    score: number;
    status: string;
  }>;
  assessed_at?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// 2. Cross-Coverage
// ---------------------------------------------------------------------------

export interface CrossCoverageRequest {
  source_framework: string;
  target_framework: string;
  scf_controls_implemented?: string[]; // real API
  tenant_id?: string;
}

export interface CrossCoverageData extends EstimatedResultMarker {
  source_framework: string;
  target_framework: string;
  overlap_percentage?: number; // real API
  coverage_percentage?: number; // legacy compat
  mapped_controls: Array<{
    source_control_id: string;
    target_control_ids: string[];
    coverage_status?: "full" | "partial" | "none";
    relationship?: string;
  }>;
  gaps: Array<{
    target_control_id: string;
    target_control_name?: string;
    gap_description?: string;
  }>;
  interpretation?: string;
}

// ---------------------------------------------------------------------------
// 3. ROI Path
// ---------------------------------------------------------------------------

export interface RoiPathRequest {
  target_frameworks?: string[]; // legacy
  target_framework?: string; // real API
  scf_controls_implemented?: string[]; // real API
  top_n?: number; // real API
  current_score?: number;
  budget_constraint?: number;
  tenant_id?: string;
}

export interface RoiPathData extends EstimatedResultMarker {
  target_framework?: string;
  top_n_requested?: number;
  total_missing?: number;
  roi_path?: Array<{
    control_id: string;
    roi_score: number;
    mitigations_count?: number;
    key_mitigations?: string[];
  }>;
  summary?: string;
  recommended_path?: Array<{
    step: number;
    action: string;
    controls_covered: string[];
    estimated_effort_hours: number;
    impact_score: number;
    frameworks_benefited: string[];
  }>;
  total_estimated_hours?: number;
  projected_final_score?: number;
}

// ---------------------------------------------------------------------------
// 4. Blast Radius
// ---------------------------------------------------------------------------

export interface BlastRadiusRequest {
  control_id: string;
  framework_code?: string;
  tenant_id?: string;
}

export interface BlastRadiusData extends EstimatedResultMarker {
  control_id: string;
  affected_frameworks?: Array<{
    framework_code: string;
    affected_controls: string[];
    risk_level?: "critical" | "high" | "medium" | "low";
  }>;
  total_affected_controls?: number;
  risk_summary?: string;
  linked_entities?: {
    risks?: any[];
    regulations?: any[];
    frameworks?: any[];
  };
}

// ---------------------------------------------------------------------------
// 5. Evaluate Evidence
// ---------------------------------------------------------------------------

export interface EvaluateEvidenceRequest {
  controlRequirement: string;
  evidenceDescription: string;
  control_id?: string;
  tenant_id?: string;
}

export interface EvaluateEvidenceData extends EstimatedResultMarker {
  is_compliant: boolean;
  confidence_score: number; // 0-100
  missing_elements: string[];
  auditor_notes: string;
}

// ---------------------------------------------------------------------------
// 6. Translate Risk
// ---------------------------------------------------------------------------

export interface TranslateRiskRequest {
  risk_description: string;
  source_framework: string;
  target_audience: "executive" | "technical" | "auditor" | "board";
  tenant_id?: string;
}

export interface TranslateRiskData {
  translated_risk: string;
  business_impact: string;
  likelihood: "very_high" | "high" | "medium" | "low" | "very_low";
  financial_impact_range?: {
    min: number;
    max: number;
    currency: string;
  };
  recommended_actions: string[];
}

// ---------------------------------------------------------------------------
// 7. Triage Incident
// ---------------------------------------------------------------------------

export interface TriageIncidentRequest {
  incident_description: string;
  affected_systems?: string[];
  detected_at?: string;
  tenant_id?: string;
}

export interface TriageIncidentData {
  severity: "critical" | "high" | "medium" | "low" | "informational";
  category: string;
  affected_controls: Array<{
    control_id: string;
    framework_code: string;
    impact: string;
  }>;
  immediate_actions: string[];
  notification_requirements: Array<{
    regulation: string;
    deadline_hours: number;
    authority: string;
  }>;
  containment_steps: string[];
}

// ---------------------------------------------------------------------------
// 8. Scan Vendor Contract
// ---------------------------------------------------------------------------

export interface ScanVendorContractRequest {
  contract_text: string;
  vendor_name: string;
  frameworks?: string[];
  tenant_id?: string;
}

export interface ScanVendorContractData {
  vendor_name: string;
  overall_risk: "critical" | "high" | "medium" | "low";
  clause_analysis: Array<{
    clause_reference: string;
    clause_text: string;
    risk_level: "high" | "medium" | "low" | "compliant";
    finding: string;
    recommendation: string;
  }>;
  missing_clauses: Array<{
    requirement: string;
    framework_reference: string;
    priority: "required" | "recommended";
  }>;
  compliance_gaps: string[];
}

// ---------------------------------------------------------------------------
// 9. Council (Multi-Agent Advisory)
// ---------------------------------------------------------------------------

export interface CouncilRequest {
  question: string;
  context?: string;
  frameworks?: string[];
  tenant_id?: string;
}

export interface CouncilData {
  consensus: string;
  confidence: number; // 0–100
  perspectives: Array<{
    agent_role: string;
    opinion: string;
    supporting_evidence: string[];
    confidence: number;
  }>;
  dissenting_views?: Array<{
    agent_role: string;
    concern: string;
  }>;
  recommended_actions: string[];
}

// ---------------------------------------------------------------------------
// Configuration type
// ---------------------------------------------------------------------------

export interface StandardApiConfig {
  baseUrl: string;
  apiKey: string;
  tenantId?: string;
  timeoutMs?: number;
}
