// Database types for ihOS Supabase schema
// Generated from docs/database/README.md — keep in sync with migrations

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "ionic_user" | "client_user";

export type UserStatus = "pending" | "approved" | "rejected";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type DocumentCategory = "ISMS_CORE" | "B2B_GEHC" | "B2B_DIRECT" | "OPERATIONAL";

export type PoamStatus = "open" | "in_progress" | "closed" | "risk_accepted";

export type ImplementationStatus = "implemented" | "partial" | "planned" | "not_applicable";

export type SnapshotType = "scorecard" | "roi_path" | "domain_breakdown" | "full_report";

// ---------------------------------------------------------------------------
// Row types (what you get back from SELECT)
// ---------------------------------------------------------------------------

export type Profile = {
  id: string; // UUID — FK to auth.users(id)
  role: UserRole;
  status: UserStatus;
  client_org: string | null;
  created_at: string | null; // TIMESTAMPTZ as ISO string
  onboarding_completed: boolean; // Added Sprint 4 migration
  preferences: Record<string, unknown>; // JSONB — user preferences
}

export type Conversation = {
  id: string; // UUID
  user_id: string; // UUID — FK to auth.users(id)
  title: string | null;
  created_at: string | null;
}

export type Message = {
  id: string; // UUID
  conversation_id: string; // UUID — FK to conversations(id)
  role: MessageRole;
  content: string | null;
  tool_calls: any[] | null; // JSONB
  created_at: string | null;
}

export type ComplianceDocument = {
  id: number; // BIGINT auto-increment
  filename: string;
  filepath: string;
  doc_type: string;
  policy_number: string | null;
  title: string | null;
  language: string | null; // default "en"
  year: number | null;
  category: DocumentCategory | null;
  file_format: string | null;
  file_size_bytes: number | null;
  total_chunks: number | null; // default 0
  product_version_id: string | null; // UUID - FK to product_versions(id)
  version: string;
  status: 'draft' | 'published' | 'superseded' | 'expired';
  expires_at: string | null; // TIMESTAMPTZ as ISO string
  created_at: string | null;
  updated_at: string | null;
}

export type DocumentChunk = {
  id: number; // BIGINT auto-increment
  document_id: number | null; // FK to compliance_documents(id) ON DELETE CASCADE
  chunk_index: number;
  content: string;
  char_count: number | null;
  section_title: string | null;
  nist_families: string[] | null; // TEXT[]
  iso_controls: string[] | null; // TEXT[]
  content_en: string | null;
  embedding: string | null; // VECTOR(1536) — returned as string by Supabase
  scf_controls: string[] | null; // TEXT[]
  created_at: string | null;
}

export type NistControl = {
  id: number; // BIGINT auto-increment
  family: string; // e.g. "AC", "AU", "CM"
  control_id: string; // UNIQUE — e.g. "AC-1", "AU-2"
  control_name: string;
  implementation: string | null;
  auditor_evidence: string | null;
  iso_mapped_controls: string[] | null; // TEXT[]
  implementation_status: string | null; // default "implemented"
  embedding: string | null; // VECTOR(1536)
  created_at: string | null;
}

export type ScfControl = {
  control_code: string; // VARCHAR PK — e.g. "DCH-01", "PRI-03"
  domain_code: string;
  control_name: string;
  description: string | null;
  embedding: string | null; // VECTOR(1536)
}

export type EvidenceEvaluation = {
  id: string; // UUID
  control_code: string;
  domain_code: string;
  control_name: string;
  is_compliant: boolean;
  confidence_score: number;
  missing_elements: string[] | null; // JSONB
  auditor_notes: string | null;
  evidence_sources: any[] | null; // JSONB
  assessment_id: string | null; // UUID — FK to compliance_assessments(id)
  needs_review: boolean;
  evaluated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type IntelligenceSnapshot = {
  id: string; // UUID
  snapshot_type: SnapshotType;
  framework_code: string | null;
  snapshot_data: any; // JSONB
  metadata: any; // JSONB
  user_id: string | null; // UUID - FK to auth.users(id)
  created_at: string | null;
}

export type ProductVersion = {
  id: string; // UUID
  product_name: string;
  version_code: string;
  status: 'active' | 'deprecated' | 'supported';
  technical_specs: any; // JSONB
  created_at: string | null;
  updated_at: string | null;
}

export type ScfFrameworkMapping = {
  id: number; // BIGINT auto-increment
  framework_code: string; // e.g. "ISO-27001", "SOC-2"
  target_control_id: string;
  scf_control_code: string; // FK to scf_controls(control_code)
  synced_at: string | null;
}

export type ComplianceAssessment = {
  id: string; // UUID
  framework_code: string;
  product_version_id: string | null; // UUID - FK to product_versions(id)
  user_id: string | null; // UUID - FK to auth.users(id)
  status: 'draft' | 'in_progress' | 'completed' | null;
  observation_start_date: string | null;
  observation_end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Assessment run results (denormalized summary table)
export type Assessment = {
  id: string; // UUID
  name: string;
  status: 'running' | 'completed' | 'failed';
  mode: 'quick' | 'deep';
  sales_channel: string | null;
  product_version_id: string | null; // UUID
  frameworks: string[]; // TEXT[]
  started_at: string | null;
  completed_at: string | null;
  total_controls: number;
  compliant_controls: number;
  missing_controls: number;
  implemented_control_ids: string[]; // TEXT[]
  framework_scores: any[]; // JSONB[] - FrameworkScore objects
  created_by: string | null; // UUID
  created_at: string | null;
  updated_at: string | null;
}

export type PoamItem = {
  id: string; // UUID
  assessment_id: string; // UUID — FK to compliance_assessments(id)
  control_code: string | null;
  status: PoamStatus | null; // default "open"
  risk_acceptance_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type AgentGoal = {
  id: string; // UUID
  user_id: string; // UUID
  framework_code: string;
  title: string;
  description: string | null;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  created_at: string | null;
  updated_at: string | null;
}

export type AgentTask = {
  id: string; // UUID
  goal_id: string; // UUID
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed";
  deadline: string | null;
  assigned_agent: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type AgentNotification = {
  id: string; // UUID
  user_id: string; // UUID
  title: string;
  content: string;
  type: "poam_expiry" | "score_change" | "task_deadline";
  read: boolean;
  created_at: string | null;
}

export type AgentLearningCorrection = {
  id: string; // UUID
  user_id: string; // UUID
  conversation_id: string; // UUID
  message_id: string | null; // UUID
  user_correction: string;
  agent_misaligned_response: string;
  learned_context: string | null;
  created_at: string | null;
}

export type AgentAutonomyBoundary = {
  id: string; // UUID
  user_id: string; // UUID
  action_type: string;
  zone: "green" | "yellow" | "red";
  created_at: string | null;
}

export type AgentOrgState = {
  id: string; // UUID
  user_id: string; // UUID
  state_key: string;
  state_value: any; // JSONB
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Insert types (what you pass to INSERT — omit server-generated fields)
// ---------------------------------------------------------------------------

export type ProfileInsert = Omit<Profile, "created_at"> & {
  created_at?: string | null;
  onboarding_completed?: boolean;
  preferences?: Record<string, unknown>;
};


export type ConversationInsert = Omit<Conversation, "id" | "created_at"> & {
  id?: string;
  title?: string | null;
  created_at?: string | null;
};

export type MessageInsert = Omit<Message, "id" | "created_at"> & {
  id?: string;
  created_at?: string | null;
};

export type ComplianceDocumentInsert = Omit<ComplianceDocument, "id" | "created_at" | "updated_at"> & {
  id?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentChunkInsert = Omit<DocumentChunk, "id" | "created_at"> & {
  id?: number;
  created_at?: string | null;
};

export type NistControlInsert = Omit<NistControl, "id" | "created_at"> & {
  id?: number;
  created_at?: string | null;
};

export type ScfControlInsert = ScfControl;

export type EvidenceEvaluationInsert = Omit<EvidenceEvaluation, "id" | "created_at" | "updated_at" | "evaluated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  evaluated_at?: string | null;
};

export type IntelligenceSnapshotInsert = Omit<IntelligenceSnapshot, "id" | "created_at"> & {
  id?: string;
  created_at?: string | null;
};

export type ProductVersionInsert = Omit<ProductVersion, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ScfFrameworkMappingInsert = Omit<ScfFrameworkMapping, "id" | "synced_at"> & {
  id?: number;
  synced_at?: string | null;
};

export type ComplianceAssessmentInsert = Omit<ComplianceAssessment, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AssessmentInsert = Omit<Assessment, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PoamItemInsert = Omit<PoamItem, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AgentGoalInsert = Omit<AgentGoal, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AgentTaskInsert = Omit<AgentTask, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AgentNotificationInsert = Omit<AgentNotification, "id" | "created_at"> & {
  id?: string;
  created_at?: string | null;
};

export type AgentLearningCorrectionInsert = Omit<AgentLearningCorrection, "id" | "created_at"> & {
  id?: string;
  created_at?: string | null;
};

export type AgentAutonomyBoundaryInsert = Omit<AgentAutonomyBoundary, "id" | "created_at"> & {
  id?: string;
  created_at?: string | null;
};

export type AgentOrgStateInsert = Omit<AgentOrgState, "id" | "updated_at"> & {
  id?: string;
  updated_at?: string | null;
};

// ---------------------------------------------------------------------------
// Update types (all fields optional except PK)
// ---------------------------------------------------------------------------

export type ProfileUpdate = Partial<Omit<Profile, "id">>;
export type ConversationUpdate = Partial<Omit<Conversation, "id">>;
export type MessageUpdate = Partial<Omit<Message, "id">>;
export type ComplianceDocumentUpdate = Partial<Omit<ComplianceDocument, "id">>;
export type DocumentChunkUpdate = Partial<Omit<DocumentChunk, "id">>;
export type NistControlUpdate = Partial<Omit<NistControl, "id">>;
export type ScfControlUpdate = Partial<Omit<ScfControl, "control_code">>;
export type EvidenceEvaluationUpdate = Partial<Omit<EvidenceEvaluation, "id">>;
export type IntelligenceSnapshotUpdate = Partial<Omit<IntelligenceSnapshot, "id">>;
export type ProductVersionUpdate = Partial<Omit<ProductVersion, "id">>;
export type ScfFrameworkMappingUpdate = Partial<Omit<ScfFrameworkMapping, "id">>;
export type ComplianceAssessmentUpdate = Partial<Omit<ComplianceAssessment, "id">>;
export type AssessmentUpdate = Partial<Omit<Assessment, "id">>;
export type PoamItemUpdate = Partial<Omit<PoamItem, "id">>;
export type AgentGoalUpdate = Partial<Omit<AgentGoal, "id">>;
export type AgentTaskUpdate = Partial<Omit<AgentTask, "id">>;
export type AgentNotificationUpdate = Partial<Omit<AgentNotification, "id">>;
export type AgentLearningCorrectionUpdate = Partial<Omit<AgentLearningCorrection, "id">>;
export type AgentAutonomyBoundaryUpdate = Partial<Omit<AgentAutonomyBoundary, "id">>;
export type AgentOrgStateUpdate = Partial<Omit<AgentOrgState, "id">>;

// ---------------------------------------------------------------------------
// Database interface — used as generic param for createClient<Database>
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: ConversationInsert;
        Update: ConversationUpdate;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: MessageInsert;
        Update: MessageUpdate;
        Relationships: [];
      };
      compliance_documents: {
        Row: ComplianceDocument;
        Insert: ComplianceDocumentInsert;
        Update: ComplianceDocumentUpdate;
        Relationships: [];
      };
      document_chunks: {
        Row: DocumentChunk;
        Insert: DocumentChunkInsert;
        Update: DocumentChunkUpdate;
        Relationships: [];
      };
      nist_controls: {
        Row: NistControl;
        Insert: NistControlInsert;
        Update: NistControlUpdate;
        Relationships: [];
      };
      scf_controls: {
        Row: ScfControl;
        Insert: ScfControlInsert;
        Update: ScfControlUpdate;
        Relationships: [];
      };
      evidence_evaluations: {
        Row: EvidenceEvaluation;
        Insert: EvidenceEvaluationInsert;
        Update: EvidenceEvaluationUpdate;
        Relationships: [];
      };
      intelligence_snapshots: {
        Row: IntelligenceSnapshot;
        Insert: IntelligenceSnapshotInsert;
        Update: IntelligenceSnapshotUpdate;
        Relationships: [];
      };
      product_versions: {
        Row: ProductVersion;
        Insert: ProductVersionInsert;
        Update: ProductVersionUpdate;
        Relationships: [];
      };
      scf_framework_mappings: {
        Row: ScfFrameworkMapping;
        Insert: ScfFrameworkMappingInsert;
        Update: ScfFrameworkMappingUpdate;
        Relationships: [];
      };
      compliance_assessments: {
        Row: ComplianceAssessment;
        Insert: ComplianceAssessmentInsert;
        Update: ComplianceAssessmentUpdate;
        Relationships: [];
      };
      poam_items: {
        Row: PoamItem;
        Insert: PoamItemInsert;
        Update: PoamItemUpdate;
        Relationships: [];
      };
      agent_goals: {
        Row: AgentGoal;
        Insert: AgentGoalInsert;
        Update: AgentGoalUpdate;
        Relationships: [];
      };
      agent_tasks: {
        Row: AgentTask;
        Insert: AgentTaskInsert;
        Update: AgentTaskUpdate;
        Relationships: [];
      };
      agent_notifications: {
        Row: AgentNotification;
        Insert: AgentNotificationInsert;
        Update: AgentNotificationUpdate;
        Relationships: [];
      };
      agent_learning_corrections: {
        Row: AgentLearningCorrection;
        Insert: AgentLearningCorrectionInsert;
        Update: AgentLearningCorrectionUpdate;
        Relationships: [];
      };
      agent_autonomy_boundaries: {
        Row: AgentAutonomyBoundary;
        Insert: AgentAutonomyBoundaryInsert;
        Update: AgentAutonomyBoundaryUpdate;
        Relationships: [];
      };
      agent_org_state: {
        Row: AgentOrgState;
        Insert: AgentOrgStateInsert;
        Update: AgentOrgStateUpdate;
        Relationships: [];
      };
      assessments: {
        Row: Assessment;
        Insert: AssessmentInsert;
        Update: AssessmentUpdate;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      match_documents_hybrid: {
        Args: {
          query_text: string;
          query_embedding: number[];
          match_threshold?: number;
          match_count?: number;
          filter_framework?: string | null;
          filter_version_id?: string | null;
          filter_categories?: string[] | null;
        };
        Returns: {
          id: number;
          content: string;
          similarity: number;
          document_id: number;
          document_title: string;
          section_title: string;
          framework: string;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
    };
  };
}

