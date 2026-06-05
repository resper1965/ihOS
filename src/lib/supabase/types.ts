// Database types for ihOS Supabase schema
// Generated from docs/database/README.md — keep in sync with migrations

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "ionic_user" | "client_user";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type DocumentCategory = "ISMS_CORE" | "B2B_GEHC" | "OPERATIONAL";

export type PoamStatus = "open" | "in_progress" | "closed" | "risk_accepted";

export type ImplementationStatus = "implemented" | "partial" | "planned" | "not_applicable";

// ---------------------------------------------------------------------------
// Row types (what you get back from SELECT)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string; // UUID — FK to auth.users(id)
  role: UserRole;
  client_org: string | null;
  created_at: string | null; // TIMESTAMPTZ as ISO string
}

export interface Conversation {
  id: string; // UUID
  user_id: string; // UUID — FK to auth.users(id)
  title: string | null;
  created_at: string | null;
}

export interface Message {
  id: string; // UUID
  conversation_id: string; // UUID — FK to conversations(id)
  role: MessageRole;
  content: string | null;
  tool_calls: Record<string, unknown>[] | null; // JSONB
  created_at: string | null;
}

export interface ComplianceDocument {
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
  created_at: string | null;
  updated_at: string | null;
}

export interface DocumentChunk {
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

export interface NistControl {
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

export interface ScfControl {
  control_code: string; // VARCHAR PK — e.g. "DCH-01", "PRI-03"
  domain_code: string;
  control_name: string;
  description: string | null;
  embedding: string | null; // VECTOR(1536)
}

export interface ScfFrameworkMapping {
  id: number; // BIGINT auto-increment
  framework_code: string; // e.g. "ISO-27001", "SOC-2"
  target_control_id: string;
  scf_control_code: string; // FK to scf_controls(control_code)
  synced_at: string | null;
}

export interface ComplianceAssessment {
  id: string; // UUID
  framework_code: string;
  observation_start_date: string | null;
  observation_end_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PoamItem {
  id: string; // UUID
  assessment_id: string; // UUID — FK to compliance_assessments(id)
  control_code: string | null;
  status: PoamStatus | null; // default "open"
  risk_acceptance_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Insert types (what you pass to INSERT — omit server-generated fields)
// ---------------------------------------------------------------------------

export type ProfileInsert = Omit<Profile, "created_at"> & {
  created_at?: string | null;
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

export type ScfFrameworkMappingInsert = Omit<ScfFrameworkMapping, "id" | "synced_at"> & {
  id?: number;
  synced_at?: string | null;
};

export type ComplianceAssessmentInsert = Omit<ComplianceAssessment, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PoamItemInsert = Omit<PoamItem, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string | null;
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
export type ScfFrameworkMappingUpdate = Partial<Omit<ScfFrameworkMapping, "id">>;
export type ComplianceAssessmentUpdate = Partial<Omit<ComplianceAssessment, "id">>;
export type PoamItemUpdate = Partial<Omit<PoamItem, "id">>;

// ---------------------------------------------------------------------------
// Database interface — used as generic param for createClient<Database>
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      conversations: {
        Row: Conversation;
        Insert: ConversationInsert;
        Update: ConversationUpdate;
      };
      messages: {
        Row: Message;
        Insert: MessageInsert;
        Update: MessageUpdate;
      };
      compliance_documents: {
        Row: ComplianceDocument;
        Insert: ComplianceDocumentInsert;
        Update: ComplianceDocumentUpdate;
      };
      document_chunks: {
        Row: DocumentChunk;
        Insert: DocumentChunkInsert;
        Update: DocumentChunkUpdate;
      };
      nist_controls: {
        Row: NistControl;
        Insert: NistControlInsert;
        Update: NistControlUpdate;
      };
      scf_controls: {
        Row: ScfControl;
        Insert: ScfControlInsert;
        Update: ScfControlUpdate;
      };
      scf_framework_mappings: {
        Row: ScfFrameworkMapping;
        Insert: ScfFrameworkMappingInsert;
        Update: ScfFrameworkMappingUpdate;
      };
      compliance_assessments: {
        Row: ComplianceAssessment;
        Insert: ComplianceAssessmentInsert;
        Update: ComplianceAssessmentUpdate;
      };
      poam_items: {
        Row: PoamItem;
        Insert: PoamItemInsert;
        Update: PoamItemUpdate;
      };
    };
    Enums: {
      user_role: UserRole;
    };
  };
}
