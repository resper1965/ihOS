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

export interface StandardApiResponse<T> {
  success: boolean;
  data: T;
  error?: StandardApiError;
}

// ---------------------------------------------------------------------------
// 1. Compliance Score
// ---------------------------------------------------------------------------

export interface ComplianceScoreRequest {
  framework_code: string; // e.g. "ISO-27001", "SOC-2", "NIST-800-53"
  tenant_id?: string;
}

export interface ComplianceScoreData {
  framework_code: string;
  overall_score: number; // 0–100
  control_scores: Array<{
    control_id: string;
    control_name: string;
    score: number;
    status: string;
  }>;
  assessed_at: string;
}

// ---------------------------------------------------------------------------
// 2. Cross-Coverage
// ---------------------------------------------------------------------------

export interface CrossCoverageRequest {
  source_framework: string;
  target_framework: string;
  tenant_id?: string;
}

export interface CrossCoverageData {
  source_framework: string;
  target_framework: string;
  coverage_percentage: number;
  mapped_controls: Array<{
    source_control_id: string;
    target_control_ids: string[];
    coverage_status: "full" | "partial" | "none";
  }>;
  gaps: Array<{
    target_control_id: string;
    target_control_name: string;
    gap_description: string;
  }>;
}

// ---------------------------------------------------------------------------
// 3. ROI Path
// ---------------------------------------------------------------------------

export interface RoiPathRequest {
  target_frameworks: string[];
  current_score?: number;
  budget_constraint?: number;
  tenant_id?: string;
}

export interface RoiPathData {
  recommended_path: Array<{
    step: number;
    action: string;
    controls_covered: string[];
    estimated_effort_hours: number;
    impact_score: number;
    frameworks_benefited: string[];
  }>;
  total_estimated_hours: number;
  projected_final_score: number;
}

// ---------------------------------------------------------------------------
// 4. Blast Radius
// ---------------------------------------------------------------------------

export interface BlastRadiusRequest {
  control_id: string;
  framework_code: string;
  tenant_id?: string;
}

export interface BlastRadiusData {
  control_id: string;
  affected_frameworks: Array<{
    framework_code: string;
    affected_controls: string[];
    risk_level: "critical" | "high" | "medium" | "low";
  }>;
  total_affected_controls: number;
  risk_summary: string;
}

// ---------------------------------------------------------------------------
// 5. Evaluate Evidence
// ---------------------------------------------------------------------------

export interface EvaluateEvidenceRequest {
  control_id: string;
  evidence_text: string;
  framework_code: string;
  tenant_id?: string;
}

export interface EvaluateEvidenceData {
  control_id: string;
  evidence_score: number; // 0–100
  sufficiency: "sufficient" | "partial" | "insufficient";
  findings: Array<{
    category: string;
    description: string;
    severity: "high" | "medium" | "low";
  }>;
  recommendations: string[];
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
