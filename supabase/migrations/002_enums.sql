-- ============================================================================
-- Migration 002: Custom Enum Types
-- ihOS — Intelligent Hardened Operating System
--
-- Defines domain-specific enumerations used across the schema:
--   • user_role          — RBAC roles for multi-tenant access control
--   • document_category  — Document classification for RLS filtering
--   • poam_status        — Workflow states for Plan of Action & Milestones
-- ============================================================================

-- User roles for Row-Level Security (RLS)
-- • admin        — Full platform access, manages all tenants
-- • ionic_user   — Internal Ionic Security user, sees all compliance data
-- • client_user  — External B2B client, sees only ISMS_CORE + their overlay
CREATE TYPE public.user_role AS ENUM ('admin', 'ionic_user', 'client_user');

COMMENT ON TYPE public.user_role IS
  'RBAC roles: admin (full access), ionic_user (internal staff), client_user (B2B tenant)';

-- Document categories for compliance document classification
-- • ISMS_CORE    — Core ISMS policies visible to ALL authenticated users
-- • B2B_GEHC     — GE Healthcare B2B overlay (RLS-isolated per client_org)
-- • OPERATIONAL  — Internal operational procedures, logs, terms
CREATE TYPE public.document_category AS ENUM ('ISMS_CORE', 'B2B_GEHC', 'OPERATIONAL');

COMMENT ON TYPE public.document_category IS
  'Document classification: ISMS_CORE (shared), B2B_GEHC (tenant-scoped), OPERATIONAL (internal ops)';

-- POAM (Plan of Action & Milestones) lifecycle states
-- • open              — Finding identified, no remediation started
-- • in_progress       — Remediation work underway
-- • closed            — Finding remediated and verified
-- • risk_accepted     — Risk formally accepted (requires expiration date)
CREATE TYPE public.poam_status AS ENUM ('open', 'in_progress', 'closed', 'risk_accepted');

COMMENT ON TYPE public.poam_status IS
  'POAM lifecycle: open → in_progress → closed | risk_accepted';
