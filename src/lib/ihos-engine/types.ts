// src/lib/ihos-engine/types.ts
// TypeScript types mirroring the ihos-api Pydantic models.

// Enums
export type StrideCategory = 'spoofing' | 'tampering' | 'repudiation' | 'information_disclosure' | 'denial_of_service' | 'elevation_of_privilege';
export type GapType = 'document_gap' | 'evidence_gap' | 'technical_gap' | 'traceability_gap' | 'clarity_gap' | 'fmea_gap' | 'control_comparison_gap';
export type ModelStatus = 'draft' | 'reviewed' | 'approved';
export type RiskCategory = 'security' | 'privacy' | 'operational' | 'compliance' | 'financial' | 'reputational';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// Request types
export interface GenerateRequest {
  product_version: string;
  target_frameworks?: string[];
  llm_model?: string;
  skip_grc_enrichment?: boolean;
}

export interface ReviewRequest {
  review_notes?: string[];
  updated_items?: Record<string, unknown>;
  status?: ModelStatus;
}

export interface FmeaCorrelateRequest {
  fmea_items: Record<string, unknown>[];
}

export interface SearchRequest {
  query: string;
  top_k?: number;
  channel_filter?: 'all' | 'gehc' | 'direct';
  product_version?: string;
}

export interface GapDetectRequest {
  product_version: string;
  target_frameworks?: string[];
}

export interface EvidenceEvaluateRequest {
  control_id: string;
  evidence_text: string;
  framework?: string;
}

// Response types
export interface ThreatModelMetadata {
  product_version: string;
  target_frameworks: string[];
  generated_at: string;
  llm_model: string;
}

export interface Threat {
  id: string;
  stride_category: StrideCategory;
  title: string;
  description: string;
  affected_component: string;
  risk_category: RiskCategory;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  mitigations: string[];
  evidence_references: string[];
  confidence: string;
  requires_review: boolean;
}

export interface Gap {
  id: string;
  gap_type: GapType;
  title: string;
  description: string;
  priority: Priority;
  affected_controls: string[];
  remediation_suggestion?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  related_gaps: string[];
  roi_score?: number;
}

export interface ThreatModel {
  metadata: ThreatModelMetadata;
  rag_context: Record<string, unknown>;
  threat_model: {
    threats: Threat[];
    fmea_correlations: Record<string, unknown>[];
  };
  standard_api_enrichment?: Record<string, unknown>;
  gaps: Gap[];
  recommendations: Recommendation[];
  limitations: string[];
  review?: Record<string, unknown>;
}

export interface SearchResult {
  chunk_id: string;
  content: string;
  content_en?: string;
  document_id: string;
  filename: string;
  section_title?: string;
  score: number;
  iso_controls?: string[];
  nist_families?: string[];
  scf_controls?: string[];
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export interface EngineError {
  error: string;
  detail?: string;
}
