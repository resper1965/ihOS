export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_autonomy_boundaries: {
        Row: {
          action_type: string
          created_at: string
          id: string
          user_id: string
          zone: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          user_id: string
          zone: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          user_id?: string
          zone?: string
        }
        Relationships: []
      }
      agent_goals: {
        Row: {
          created_at: string
          description: string | null
          framework_code: string
          id: string
          progress: number
          source_assessment_id: string | null
          source_control_code: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          framework_code: string
          id?: string
          progress?: number
          source_assessment_id?: string | null
          source_control_code?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          framework_code?: string
          id?: string
          progress?: number
          source_assessment_id?: string | null
          source_control_code?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_learning_corrections: {
        Row: {
          agent_misaligned_response: string
          conversation_id: string
          created_at: string
          id: string
          learned_context: string | null
          message_id: string | null
          user_correction: string
          user_id: string
        }
        Insert: {
          agent_misaligned_response: string
          conversation_id: string
          created_at?: string
          id?: string
          learned_context?: string | null
          message_id?: string | null
          user_correction: string
          user_id: string
        }
        Update: {
          agent_misaligned_response?: string
          conversation_id?: string
          created_at?: string
          id?: string
          learned_context?: string | null
          message_id?: string | null
          user_correction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_learning_corrections_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_learning_corrections_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_notifications: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          read: boolean
          severity: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          severity?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          severity?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_org_state: {
        Row: {
          id: string
          state_key: string
          state_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          state_key: string
          state_value: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          state_key?: string
          state_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          assigned_agent: string | null
          created_at: string
          deadline: string | null
          description: string | null
          goal_id: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_agent?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          goal_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_agent?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          goal_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "agent_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          completed_at: string | null
          compliant_controls: number | null
          created_at: string | null
          created_by: string | null
          framework_scores: Json | null
          frameworks: Json | null
          id: string
          implemented_control_ids: Json | null
          missing_controls: number | null
          mode: string
          name: string
          product_version_id: string | null
          sales_channel: string | null
          started_at: string | null
          status: string
          total_controls: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          compliant_controls?: number | null
          created_at?: string | null
          created_by?: string | null
          framework_scores?: Json | null
          frameworks?: Json | null
          id?: string
          implemented_control_ids?: Json | null
          missing_controls?: number | null
          mode?: string
          name: string
          product_version_id?: string | null
          sales_channel?: string | null
          started_at?: string | null
          status?: string
          total_controls?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          compliant_controls?: number | null
          created_at?: string | null
          created_by?: string | null
          framework_scores?: Json | null
          frameworks?: Json | null
          id?: string
          implemented_control_ids?: Json | null
          missing_controls?: number | null
          mode?: string
          name?: string
          product_version_id?: string | null
          sales_channel?: string | null
          started_at?: string | null
          status?: string
          total_controls?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_assessments: {
        Row: {
          created_at: string | null
          framework_code: string
          id: string
          observation_end_date: string | null
          observation_start_date: string | null
          product_version_id: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          framework_code: string
          id?: string
          observation_end_date?: string | null
          observation_start_date?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          framework_code?: string
          id?: string
          observation_end_date?: string | null
          observation_start_date?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_assessments_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_documents: {
        Row: {
          category: string | null
          created_at: string | null
          doc_type: string
          expires_at: string | null
          file_format: string | null
          file_size_bytes: number | null
          filename: string
          filepath: string
          id: number
          language: string | null
          policy_number: string | null
          product_version_id: string | null
          status: string
          title: string | null
          total_chunks: number | null
          updated_at: string | null
          version: string
          year: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          doc_type: string
          expires_at?: string | null
          file_format?: string | null
          file_size_bytes?: number | null
          filename: string
          filepath: string
          id?: number
          language?: string | null
          policy_number?: string | null
          product_version_id?: string | null
          status?: string
          title?: string | null
          total_chunks?: number | null
          updated_at?: string | null
          version?: string
          year?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          doc_type?: string
          expires_at?: string | null
          file_format?: string | null
          file_size_bytes?: number | null
          filename?: string
          filepath?: string
          id?: number
          language?: string | null
          policy_number?: string | null
          product_version_id?: string | null
          status?: string
          title?: string | null
          total_chunks?: number | null
          updated_at?: string | null
          version?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      defectdojo_findings: {
        Row: {
          active: boolean | null
          cvssv3: string | null
          cwe: number | null
          dd_created_at: string | null
          dd_finding_id: number
          description: string | null
          id: string
          is_mitigated: boolean | null
          mapped_iso_controls: string[] | null
          mapped_nist_controls: string[] | null
          mapped_soc_criteria: string[] | null
          mitigation: string | null
          risk_accepted: boolean | null
          severity: string
          sla_days_remaining: number | null
          synced_at: string | null
          title: string
          verified: boolean | null
        }
        Insert: {
          active?: boolean | null
          cvssv3?: string | null
          cwe?: number | null
          dd_created_at?: string | null
          dd_finding_id: number
          description?: string | null
          id?: string
          is_mitigated?: boolean | null
          mapped_iso_controls?: string[] | null
          mapped_nist_controls?: string[] | null
          mapped_soc_criteria?: string[] | null
          mitigation?: string | null
          risk_accepted?: boolean | null
          severity: string
          sla_days_remaining?: number | null
          synced_at?: string | null
          title: string
          verified?: boolean | null
        }
        Update: {
          active?: boolean | null
          cvssv3?: string | null
          cwe?: number | null
          dd_created_at?: string | null
          dd_finding_id?: number
          description?: string | null
          id?: string
          is_mitigated?: boolean | null
          mapped_iso_controls?: string[] | null
          mapped_nist_controls?: string[] | null
          mapped_soc_criteria?: string[] | null
          mitigation?: string | null
          risk_accepted?: boolean | null
          severity?: string
          sla_days_remaining?: number | null
          synced_at?: string | null
          title?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          char_count: number | null
          chunk_index: number
          content: string
          content_en: string | null
          content_tsvector: unknown
          contextual_text: string | null
          created_at: string | null
          document_id: number | null
          embedding: string | null
          id: number
          iso_controls: string[] | null
          nist_families: string[] | null
          scf_controls: string[] | null
          section_title: string | null
          tenant_id: string | null
        }
        Insert: {
          char_count?: number | null
          chunk_index: number
          content: string
          content_en?: string | null
          content_tsvector?: unknown
          contextual_text?: string | null
          created_at?: string | null
          document_id?: number | null
          embedding?: string | null
          id?: number
          iso_controls?: string[] | null
          nist_families?: string[] | null
          scf_controls?: string[] | null
          section_title?: string | null
          tenant_id?: string | null
        }
        Update: {
          char_count?: number | null
          chunk_index?: number
          content?: string
          content_en?: string | null
          content_tsvector?: unknown
          contextual_text?: string | null
          created_at?: string | null
          document_id?: number | null
          embedding?: string | null
          id?: number
          iso_controls?: string[] | null
          nist_families?: string[] | null
          scf_controls?: string[] | null
          section_title?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_evaluations: {
        Row: {
          auditor_notes: string | null
          chunk_id: number | null
          confidence_score: number | null
          control_code: string | null
          control_name: string | null
          control_requirement: string
          domain_code: string | null
          evaluated_at: string | null
          evidence_sources: Json | null
          evidence_text: string
          id: number
          is_compliant: boolean | null
          missing_elements: string[] | null
          needs_review: boolean
          scf_control_code: string
          tenant_id: string | null
          trace_id: string | null
        }
        Insert: {
          auditor_notes?: string | null
          chunk_id?: number | null
          confidence_score?: number | null
          control_code?: string | null
          control_name?: string | null
          control_requirement: string
          domain_code?: string | null
          evaluated_at?: string | null
          evidence_sources?: Json | null
          evidence_text: string
          id?: number
          is_compliant?: boolean | null
          missing_elements?: string[] | null
          needs_review?: boolean
          scf_control_code: string
          tenant_id?: string | null
          trace_id?: string | null
        }
        Update: {
          auditor_notes?: string | null
          chunk_id?: number | null
          confidence_score?: number | null
          control_code?: string | null
          control_name?: string | null
          control_requirement?: string
          domain_code?: string | null
          evaluated_at?: string | null
          evidence_sources?: Json | null
          evidence_text?: string
          id?: number
          is_compliant?: boolean | null
          missing_elements?: string[] | null
          needs_review?: boolean
          scf_control_code?: string
          tenant_id?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_evaluations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "document_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_evaluations_scf_control_code_fkey"
            columns: ["scf_control_code"]
            isOneToOne: false
            referencedRelation: "scf_controls"
            referencedColumns: ["control_code"]
          },
        ]
      }
      integration_connections: {
        Row: {
          composio_connection_id: string | null
          config: Json | null
          created_at: string | null
          id: string
          last_synced_at: string | null
          provider: string
          status: string | null
          sync_frequency: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          composio_connection_id?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          composio_connection_id?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      integration_sync_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          errors: Json | null
          id: number
          items_created: number | null
          items_processed: number | null
          items_updated: number | null
          provider: string
          sync_type: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          errors?: Json | null
          id?: number
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          provider: string
          sync_type: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          errors?: Json | null
          id?: number
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          provider?: string
          sync_type?: string
        }
        Relationships: []
      }
      intelligence_snapshots: {
        Row: {
          created_at: string | null
          framework_code: string
          id: number
          input_payload: Json
          metadata: Json | null
          result_payload: Json
          score: number | null
          snapshot_data: Json | null
          snapshot_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          framework_code: string
          id?: number
          input_payload: Json
          metadata?: Json | null
          result_payload: Json
          score?: number | null
          snapshot_data?: Json | null
          snapshot_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          framework_code?: string
          id?: number
          input_payload?: Json
          metadata?: Json | null
          result_payload?: Json
          score?: number | null
          snapshot_data?: Json | null
          snapshot_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      isms_baselines: {
        Row: {
          created_at: string
          description: string | null
          framework_code: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          framework_code: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          framework_code?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      isms_controls: {
        Row: {
          control_code: string
          created_at: string
          evidence_url: string | null
          id: string
          isms_id: string
          status: string
          updated_at: string
        }
        Insert: {
          control_code: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          isms_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          control_code?: string
          created_at?: string
          evidence_url?: string | null
          id?: string
          isms_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "isms_controls_control_code_fkey"
            columns: ["control_code"]
            isOneToOne: false
            referencedRelation: "scf_controls"
            referencedColumns: ["control_code"]
          },
          {
            foreignKeyName: "isms_controls_isms_id_fkey"
            columns: ["isms_id"]
            isOneToOne: false
            referencedRelation: "isms_baselines"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      msr_baselines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          isms_baseline_id: string | null
          name: string
          parent_baseline_id: string | null
          product_version_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          isms_baseline_id?: string | null
          name: string
          parent_baseline_id?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          isms_baseline_id?: string | null
          name?: string
          parent_baseline_id?: string | null
          product_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "msr_baselines_isms_baseline_id_fkey"
            columns: ["isms_baseline_id"]
            isOneToOne: false
            referencedRelation: "isms_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msr_baselines_parent_baseline_id_fkey"
            columns: ["parent_baseline_id"]
            isOneToOne: false
            referencedRelation: "msr_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msr_baselines_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      msr_controls: {
        Row: {
          baseline_id: string
          classification: string
          control_code: string
          created_at: string
          dsr_factors: Json | null
          dsr_score: number | null
          id: string
          pptdf_scope: string[] | null
          rejection_rationale: string | null
          status: string
          updated_at: string
        }
        Insert: {
          baseline_id: string
          classification: string
          control_code: string
          created_at?: string
          dsr_factors?: Json | null
          dsr_score?: number | null
          id?: string
          pptdf_scope?: string[] | null
          rejection_rationale?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          baseline_id?: string
          classification?: string
          control_code?: string
          created_at?: string
          dsr_factors?: Json | null
          dsr_score?: number | null
          id?: string
          pptdf_scope?: string[] | null
          rejection_rationale?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "msr_controls_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "msr_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msr_controls_control_code_fkey"
            columns: ["control_code"]
            isOneToOne: false
            referencedRelation: "scf_controls"
            referencedColumns: ["control_code"]
          },
        ]
      }
      nist_controls: {
        Row: {
          auditor_evidence: string | null
          control_id: string
          control_name: string
          created_at: string | null
          embedding: string | null
          family: string
          id: number
          implementation: string | null
          implementation_status: string | null
          iso_mapped_controls: string[] | null
        }
        Insert: {
          auditor_evidence?: string | null
          control_id: string
          control_name: string
          created_at?: string | null
          embedding?: string | null
          family: string
          id?: number
          implementation?: string | null
          implementation_status?: string | null
          iso_mapped_controls?: string[] | null
        }
        Update: {
          auditor_evidence?: string | null
          control_id?: string
          control_name?: string
          created_at?: string | null
          embedding?: string | null
          family?: string
          id?: number
          implementation?: string | null
          implementation_status?: string | null
          iso_mapped_controls?: string[] | null
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          channel_type: string
          config: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          severity_filter: string[] | null
          user_id: string
        }
        Insert: {
          channel_type: string
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          severity_filter?: string[] | null
          user_id: string
        }
        Update: {
          channel_type?: string
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          severity_filter?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      poam_items: {
        Row: {
          assessment_id: string
          control_code: string | null
          created_at: string | null
          id: string
          risk_acceptance_expires_at: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          assessment_id: string
          control_code?: string | null
          created_at?: string | null
          id?: string
          risk_acceptance_expires_at?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assessment_id?: string
          control_code?: string | null
          created_at?: string | null
          id?: string
          risk_acceptance_expires_at?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poam_items_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "compliance_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poam_items_control_code_fkey"
            columns: ["control_code"]
            isOneToOne: false
            referencedRelation: "scf_controls"
            referencedColumns: ["control_code"]
          },
        ]
      }
      product_version_deltas: {
        Row: {
          affected_components: string[]
          created_at: string
          description: string
          feature_slug: string
          id: string
          product_version_id: string
          risk_level: string
          updated_at: string
        }
        Insert: {
          affected_components?: string[]
          created_at?: string
          description: string
          feature_slug: string
          id?: string
          product_version_id: string
          risk_level: string
          updated_at?: string
        }
        Update: {
          affected_components?: string[]
          created_at?: string
          description?: string
          feature_slug?: string
          id?: string
          product_version_id?: string
          risk_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_version_deltas_product_version_id_fkey"
            columns: ["product_version_id"]
            isOneToOne: false
            referencedRelation: "product_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_versions: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          product_name: string
          status: string
          technical_specs: Json | null
          updated_at: string
          version_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          product_name?: string
          status?: string
          technical_specs?: Json | null
          updated_at?: string
          version_code: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          product_name?: string
          status?: string
          technical_specs?: Json | null
          updated_at?: string
          version_code?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          client_org: string | null
          created_at: string | null
          id: string
          onboarding_completed: boolean | null
          preferences: Json | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          client_org?: string | null
          created_at?: string | null
          id: string
          onboarding_completed?: boolean | null
          preferences?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          client_org?: string | null
          created_at?: string | null
          id?: string
          onboarding_completed?: boolean | null
          preferences?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      scf_controls: {
        Row: {
          control_code: string
          control_name: string
          description: string | null
          domain_code: string
          embedding: string | null
        }
        Insert: {
          control_code: string
          control_name: string
          description?: string | null
          domain_code: string
          embedding?: string | null
        }
        Update: {
          control_code?: string
          control_name?: string
          description?: string | null
          domain_code?: string
          embedding?: string | null
        }
        Relationships: []
      }
      scf_framework_mappings: {
        Row: {
          framework_code: string
          id: number
          scf_control_code: string
          synced_at: string | null
          target_control_id: string
        }
        Insert: {
          framework_code: string
          id?: number
          scf_control_code: string
          synced_at?: string | null
          target_control_id: string
        }
        Update: {
          framework_code?: string
          id?: number
          scf_control_code?: string
          synced_at?: string | null
          target_control_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scf_framework_mappings_scf_control_code_fkey"
            columns: ["scf_control_code"]
            isOneToOne: false
            referencedRelation: "scf_controls"
            referencedColumns: ["control_code"]
          },
        ]
      }
      threat_model_reports: {
        Row: {
          created_at: string
          frameworks: Json
          generated_by: string | null
          id: string
          product_version: string
          report_data: Json
          status: string
          threat_model_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          frameworks?: Json
          generated_by?: string | null
          id?: string
          product_version: string
          report_data: Json
          status?: string
          threat_model_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          frameworks?: Json
          generated_by?: string | null
          id?: string
          product_version?: string
          report_data?: Json
          status?: string
          threat_model_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      threat_models: {
        Row: {
          created_at: string | null
          id: string
          model_data: Json
          product_version: string
          reviewed_at: string | null
          status: string | null
          target_frameworks: string[] | null
        }
        Insert: {
          created_at?: string | null
          id: string
          model_data: Json
          product_version: string
          reviewed_at?: string | null
          status?: string | null
          target_frameworks?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          model_data?: Json
          product_version?: string
          reviewed_at?: string | null
          status?: string | null
          target_frameworks?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_client_org: { Args: never; Returns: string }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_user_client_org: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_vault_secret: { Args: { secret_name: string }; Returns: string }
      match_documents: {
        Args: {
          filter_framework?: string
          filter_version_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          content_en: string
          doc_category: string
          doc_filename: string
          doc_title: string
          doc_type: string
          document_id: number
          id: number
          iso_controls: string[]
          nist_families: string[]
          scf_controls: string[]
          section_title: string
          similarity: number
        }[]
      }
      match_documents_hybrid: {
        Args: {
          filter_categories?: string[]
          filter_framework?: string
          filter_version_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
          query_text: string
        }
        Returns: {
          chunk_index: number
          content: string
          content_en: string
          doc_category: string
          doc_filename: string
          doc_title: string
          doc_type: string
          document_id: number
          id: number
          iso_controls: string[]
          nist_families: string[]
          scf_controls: string[]
          section_title: string
          similarity: number
        }[]
      }
      match_scf_controls: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          control_code: string
          control_name: string
          description: string
          domain_code: string
          similarity: number
        }[]
      }
      search_compliance_docs: {
        Args: {
          filter_category?: string
          filter_language?: string
          filter_nist?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: number
          content: string
          content_en: string
          document_id: number
          filename: string
          iso_controls: string[]
          nist_families: string[]
          policy_number: string
          section_title: string
          similarity: number
        }[]
      }
      search_compliance_text: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          chunk_id: number
          content: string
          content_en: string
          document_id: number
          filename: string
          policy_number: string
          rank: number
        }[]
      }
      set_vault_secret: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
        }
        Returns: string
      }
    }
    Enums: {
      user_role: "admin" | "ionic_user" | "client_user"
      user_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      user_role: ["admin", "ionic_user", "client_user"],
      user_status: ["pending", "approved", "rejected"],
    },
  },
} as const
