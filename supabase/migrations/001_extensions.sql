-- ============================================================================
-- Migration 001: Extensions
-- ihOS — Intelligent Hardened Operating System
-- 
-- Enables required PostgreSQL extensions for the ihOS platform:
--   • uuid-ossp  — UUID generation functions (gen_random_uuid, uuid_generate_v4)
--   • vector     — pgvector extension for embedding storage & similarity search
--
-- IMPORTANT: These must be created before any tables that reference
-- UUID or VECTOR data types.
-- ============================================================================

-- Enable UUID generation functions
-- Used by: profiles, conversations, messages, compliance_assessments, poam_items
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Enable pgvector for embedding storage and similarity search
-- Used by: document_chunks.embedding, scf_controls.embedding
-- Requires: Supabase project with pgvector enabled (default on new projects)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
