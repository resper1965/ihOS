// src/lib/agents/types.ts
// Core types for the ihOS AI agent system

import type { ModelMessage } from 'ai';

// ---------------------------------------------------------------------------
// Agent Profile
// ---------------------------------------------------------------------------

/** Unique identifier for each agent persona */
export type AgentProfileId =
  | 'compliance'
  | 'privacy'
  | 'soc'
  | 'executive'
  | 'document';

/** Full agent profile with system prompt and metadata */
export interface AgentProfile {
  /** Unique profile identifier used for routing */
  id: AgentProfileId;
  /** Human-readable display name */
  name: string;
  /** Short description shown in the UI */
  description: string;
  /** Full system prompt injected into the LLM context */
  systemPrompt: string;
  /** Maximum ReAct loop steps before stopping */
  maxSteps: number;
}

// ---------------------------------------------------------------------------
// Intent Classification
// ---------------------------------------------------------------------------

/** Classification result from the intent router */
export interface IntentClassification {
  /** The resolved agent profile id */
  profileId: AgentProfileId;
  /** Confidence score 0-1 (1 = exact keyword match) */
  confidence: number;
  /** The keywords that triggered this classification */
  matchedKeywords: string[];
}

// ---------------------------------------------------------------------------
// Assembled Context
// ---------------------------------------------------------------------------

/** RAG chunk retrieved via pgvector similarity search */
export interface RAGChunk {
  /** Unique identifier of the document chunk */
  id: string;
  /** The text content of the chunk */
  content: string;
  /** Cosine similarity score (0-1) */
  similarity: number;
  /** Source metadata */
  metadata: {
    documentId: string;
    documentTitle: string;
    framework?: string;
    section?: string;
    pageNumber?: number;
  };
}

/** Fully assembled context ready for LLM invocation */
export interface AssembledContext {
  /** The selected agent profile */
  profile: AgentProfile;
  /** Final system prompt (profile prompt + RAG context) */
  systemPrompt: string;
  /** Conversation history (last N messages) */
  conversationHistory: ModelMessage[];
  /** RAG chunks injected into context */
  ragChunks: RAGChunk[];
  /** Tenant and org metadata */
  metadata: {
    conversationId: string;
    tenantId?: string;
    userId?: string;
    timestamp: string;
  };
}

// ---------------------------------------------------------------------------
// Tool Results
// ---------------------------------------------------------------------------

/** Generic wrapper for tool execution results */
export interface ToolResult<T = unknown> {
  /** Whether the tool executed successfully */
  success: boolean;
  /** The typed result payload */
  data?: T;
  /** Error message when success is false */
  error?: string;
  /** Source attribution for audit trail */
  source: 'standard-api' | 'supabase' | 'internal';
}

// ---------------------------------------------------------------------------
// Compliance-Domain Types (used by tools)
// ---------------------------------------------------------------------------

export interface ComplianceScore {
  framework: string;
  overallScore: number;
  controlsTotal: number;
  controlsMet: number;
  controlsPartial: number;
  controlsNotMet: number;
  lastAssessedAt: string;
}

export interface CrossCoverageResult {
  sourceFramework: string;
  targetFramework: string;
  overlappingControls: number;
  totalSourceControls: number;
  coveragePercentage: number;
  mappings: Array<{
    sourceControlId: string;
    targetControlIds: string[];
    relationship: 'exact' | 'partial' | 'related';
  }>;
}

export interface BlastRadiusResult {
  controlId: string;
  framework: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  affectedControls: Array<{
    controlId: string;
    framework: string;
    relationship: string;
  }>;
  affectedProcesses: string[];
  remediationPriority: number;
}

export interface FrameworkSummary {
  id: string;
  name: string;
  version: string;
  controlCount: number;
  category: string;
}

export interface AssessmentStatus {
  assessmentId: string;
  framework: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'expired';
  progress: number;
  controlsAssessed: number;
  controlsTotal: number;
  startedAt?: string;
  completedAt?: string;
  nextDeadline?: string;
}

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  conversationId: string;
  timestamp: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: ToolResult;
  agentProfileId: AgentProfileId;
  durationMs: number;
}
