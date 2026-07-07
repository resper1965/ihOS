-- ============================================================================
-- Migration 20260707000004: MCP surface audit log
-- (specs/003-truth-platform F6-lite / Onda 1c — T602).
--
-- Every call an external agent makes through the read-only MCP surface
-- (/api/mcp) is recorded: which tool, with which arguments, authenticated by
-- which token (fingerprint only — never the token itself), and the outcome.
-- Append-only; service-role writes, internal users read.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
    id                BIGSERIAL   PRIMARY KEY,
    tool_name         TEXT        NOT NULL,
    arguments         JSONB       NOT NULL DEFAULT '{}',
    -- SHA-256 prefix of the presented service token (identification without
    -- storage of the secret).
    token_fingerprint TEXT        NULL,
    success           BOOLEAN     NOT NULL DEFAULT true,
    error_code        TEXT        NULL,
    duration_ms       INT         NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mcp_audit_log IS
  'Per-call audit trail of the read-only MCP posture surface (specs/003 F6). Tokens are stored as SHA-256 fingerprints only.';

CREATE INDEX IF NOT EXISTS idx_mcp_audit_created
    ON public.mcp_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_tool
    ON public.mcp_audit_log (tool_name, created_at);

ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_audit_log' AND policyname = 'mcp_audit_service_write') THEN
    CREATE POLICY mcp_audit_service_write ON public.mcp_audit_log
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mcp_audit_log' AND policyname = 'mcp_audit_internal_read') THEN
    CREATE POLICY mcp_audit_internal_read ON public.mcp_audit_log
      FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

COMMIT;
