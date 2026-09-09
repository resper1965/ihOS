-- ============================================================================
-- ihOS -- lacuna de migracoes, consolidado para aplicacao unica  (2026-09-09)
-- ============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- A aplicacao de docs/sql/2026-09-09_APPLY_ME_signal_relationship.sql falhou com
--   ERROR 42P01: relation "public.runtime_control_signals" does not exist
--
-- A causa nao era aquela migracao. Verificado tabela a tabela contra o banco
-- uomdcazsriznqytvnsrv em 2026-09-09, SEIS migracoes de julho nunca chegaram
-- nele. As tres que bloqueiam alguma funcionalidade viva estao aqui, na ordem,
-- seguidas da migracao que falhou.
--
-- Consequencia que isto conserta: o eixo de postura observada -- DefectDojo
-- cruzado com controles SCF -- NUNCA existiu neste banco. defectdojo_findings
-- existe e recebe achados; a tabela de sinais nao existia, entao nada
-- aterrissava. O codigo ja sabia: engolia o erro e logava um aviso que ninguem
-- leu.
--
-- SEGURO DE REPETIR. Cada parte veio de um arquivo de migracao ja escrito para
-- ser idempotente: IF NOT EXISTS nas tabelas, colunas e indices, e blocos DO
-- consultando pg_constraint e pg_policies antes de criar constraint ou policy.
-- Nada foi reescrito aqui -- as partes sao os arquivos originais, concatenados
-- na ordem de dependencia, com estes cabecalhos acrescentados.
--
-- NAO INCLUIDAS, de proposito:
--   20260707000002_customer_assessments.sql
--   20260707000003_verified_answers.sql
--   20260707000005_channel_context.sql
-- Sao das ondas 3 e 4 do roadmap e nao bloqueiam nada hoje. A ordem numerica
-- delas continua correta se voce quiser fechar a lacuna inteira depois.
--
-- VERIFICACAO no fim do arquivo.
-- ============================================================================


-- ==========================================================================
-- PARTE 1 de 4 -- 20260706000001_document_control_provenance
--
-- Cria document_control_provenance: o registro duravel de qual trecho de qual
-- documento sustenta qual controle SCF. Estava ausente, e por isso a tabela
-- aparecia como 'vazia' -- ela nunca existiu.
-- ==========================================================================

-- ============================================================================
-- Migration: Document Control Provenance
-- ihOS — Intelligent Hardened Operating System
--
-- Creates the provenance chain: Document → Chunk → SCF Control
-- Enables auditability: "Where did this control come from?"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_control_provenance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         BIGINT NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
    chunk_id            BIGINT NOT NULL REFERENCES public.document_chunks(id) ON DELETE CASCADE,
    scf_control_code    VARCHAR NOT NULL,
    similarity          NUMERIC(4,3) NOT NULL,
    llm_status          VARCHAR NOT NULL DEFAULT 'pending',  -- 'implements' | 'mentions' | 'negates' | 'pending'
    extraction_method   VARCHAR NOT NULL DEFAULT 'semantic_match',  -- 'semantic_match' | 'llm_confirmed'
    evidence_snippet    TEXT,
    llm_justification   TEXT,
    product_version_id  UUID,
    extracted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chunk_id, scf_control_code)
);

CREATE INDEX IF NOT EXISTS idx_prov_document ON public.document_control_provenance(document_id);
CREATE INDEX IF NOT EXISTS idx_prov_control ON public.document_control_provenance(scf_control_code);
CREATE INDEX IF NOT EXISTS idx_prov_version ON public.document_control_provenance(product_version_id);
CREATE INDEX IF NOT EXISTS idx_prov_status ON public.document_control_provenance(llm_status);

COMMENT ON TABLE public.document_control_provenance IS
  'Provenance chain linking document chunks to SCF controls with similarity score, LLM confirmation status, and evidence snippets.';

-- ==========================================================================
-- PARTE 2 de 4 -- 20260707000001_runtime_control_signals
--
-- Cria runtime_control_signals e defectdojo_product_links, e acrescenta a coluna
-- mapped_scf_controls em defectdojo_findings. E o eixo de postura observada
-- inteiro. Sem ela o cron do DefectDojo grava achados e descarta os sinais em
-- silencio, logando 'runtime_control_signals upsert skipped'.
-- ==========================================================================

-- ============================================================================
-- Migration 20260707000001: runtime control signals (analytical posture axis).
--
-- Closes the DefectDojo dead-end: findings were synced into
-- defectdojo_findings but never consumed, and were mapped only to
-- ISO/SOC2/NIST codes — outside the SCF spine the rest of ihOS speaks.
--
-- This migration adds the ANALYTICAL posture axis alongside the existing
-- DOCUMENTAL axis (control_evaluation_cache / evidence evaluations):
--
--   1. defectdojo_findings gains mapped_scf_controls[] + product_version_id
--      so each finding lands on the same SCF spine as documents do.
--   2. runtime_control_signals — one row per (source, finding, SCF control):
--      the normalized "observed at runtime" evidence stream. The documental
--      verdict (conforming/partial/informal/gap) is NEVER overwritten by
--      these signals; consumers derive a separate observed status
--      (violated/degraded/clean) from them.
--   3. defectdojo_product_links — maps a DefectDojo product to an ihOS
--      product_version, replacing the single global DEFECTDOJO_PRODUCT_ID
--      env var (kept as fallback for a version-less link).
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

-- ── 1. SCF spine on defectdojo_findings ─────────────────────────────────────

ALTER TABLE public.defectdojo_findings
    ADD COLUMN IF NOT EXISTS mapped_scf_controls TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS product_version_id UUID NULL;

-- FK added NOT VALID (no full-table scan under SHARE ROW EXCLUSIVE) and
-- validated right after — validation takes a lighter lock and the column was
-- just created NULL everywhere, so it cannot fail.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'defectdojo_findings_product_version_id_fkey'
  ) THEN
    ALTER TABLE public.defectdojo_findings
        ADD CONSTRAINT defectdojo_findings_product_version_id_fkey
        FOREIGN KEY (product_version_id) REFERENCES public.product_versions(id)
        ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.defectdojo_findings
        VALIDATE CONSTRAINT defectdojo_findings_product_version_id_fkey;
  END IF;
END $$;

COMMENT ON COLUMN public.defectdojo_findings.mapped_scf_controls IS
  'SCF control codes resolved from the finding''s ISO/NIST mappings via scf_framework_mappings. Empty = unmapped (surfaced as a coverage gap, never guessed).';
COMMENT ON COLUMN public.defectdojo_findings.product_version_id IS
  'ihOS product version this finding belongs to, resolved via defectdojo_product_links. NULL = org-wide / unlinked product.';

CREATE INDEX IF NOT EXISTS idx_dd_findings_scf_controls
    ON public.defectdojo_findings USING GIN (mapped_scf_controls);
CREATE INDEX IF NOT EXISTS idx_dd_findings_version
    ON public.defectdojo_findings (product_version_id);

-- ── 2. Normalized runtime signal stream ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_control_signals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scf_control_code    VARCHAR     NOT NULL,
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    source              VARCHAR     NOT NULL DEFAULT 'defectdojo',
    source_ref          VARCHAR     NOT NULL,   -- e.g. DefectDojo finding id
    title               TEXT        NOT NULL,
    severity            VARCHAR     NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Info')),
    active              BOOLEAN     NOT NULL DEFAULT true,
    verified            BOOLEAN     NOT NULL DEFAULT false,
    risk_accepted       BOOLEAN     NOT NULL DEFAULT false,
    is_mitigated        BOOLEAN     NOT NULL DEFAULT false,
    observed_at         TIMESTAMPTZ NULL,       -- when the source first saw it
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, source_ref, scf_control_code)
);

COMMENT ON TABLE public.runtime_control_signals IS
  'Analytical ("observed moment") posture axis: normalized runtime evidence per SCF control, fed by DefectDojo (and future sources). Read together with the documental axis — never replaces it.';
COMMENT ON COLUMN public.runtime_control_signals.source_ref IS
  'Stable identifier of the signal in its source system (DefectDojo finding id). One finding can touch several SCF controls.';

CREATE INDEX IF NOT EXISTS idx_runtime_signals_control
    ON public.runtime_control_signals (scf_control_code) WHERE active;
CREATE INDEX IF NOT EXISTS idx_runtime_signals_version
    ON public.runtime_control_signals (product_version_id);
CREATE INDEX IF NOT EXISTS idx_runtime_signals_source
    ON public.runtime_control_signals (source, source_ref);

ALTER TABLE public.runtime_control_signals ENABLE ROW LEVEL SECURITY;

-- Reads are INTERNAL-ONLY: runtime signals carry finding titles/severities
-- across every product version — client_user must never see them. (The DROP
-- also cleans up the broader authenticated-read policy from earlier drafts.)
DROP POLICY IF EXISTS runtime_signals_select_authenticated ON public.runtime_control_signals;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'runtime_control_signals' AND policyname = 'runtime_signals_select_internal'
  ) THEN
    CREATE POLICY runtime_signals_select_internal ON public.runtime_control_signals
        FOR SELECT USING (
          auth.role() = 'service_role'
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user')
          )
        );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'runtime_control_signals' AND policyname = 'runtime_signals_service_write'
  ) THEN
    CREATE POLICY runtime_signals_service_write ON public.runtime_control_signals
        FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 3. DefectDojo product ↔ ihOS version link ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.defectdojo_product_links (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dd_product_id       INT         NOT NULL UNIQUE,
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    label               TEXT        NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.defectdojo_product_links IS
  'Which DefectDojo products the sync cron pulls, and which ihOS product version each one feeds. NULL product_version_id = org-wide signals. When empty, the cron falls back to the DEFECTDOJO_PRODUCT_ID env var.';

ALTER TABLE public.defectdojo_product_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'defectdojo_product_links' AND policyname = 'dd_product_links_select_authenticated'
  ) THEN
    CREATE POLICY dd_product_links_select_authenticated ON public.defectdojo_product_links
        FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'defectdojo_product_links' AND policyname = 'dd_product_links_admin_write'
  ) THEN
    CREATE POLICY dd_product_links_admin_write ON public.defectdojo_product_links
        FOR ALL USING (
          auth.role() = 'service_role'
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user')
          )
        );
  END IF;
END $$;

COMMIT;

-- ==========================================================================
-- PARTE 3 de 4 -- 20260707000004_mcp_audit_log
--
-- Cria mcp_audit_log. A rota /api/mcp audita cada chamada nela; sem a tabela a
-- auditoria do canal MCP nao existe.
-- ==========================================================================

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

-- ==========================================================================
-- PARTE 4 de 4 -- 2026-09-09_signal_relationship
--
-- A migracao que falhou hoje. Acrescenta relationship_type em
-- runtime_control_signals -- por isso depende da parte 2 acima.
-- ==========================================================================

-- Mirrors migration 20260909000001_signal_relationship_type
-- Migration 20260909000001: how an observed signal's control relates to the
-- requirement that produced it.
--
-- Until now every DefectDojo signal landed on an SCF control with no record of
-- HOW that control relates to the framework requirement the finding cited. The
-- old mapping table could not say — it held only a triple of codes — so an
-- exact match and a partial overlap looked identical on the dashboard.
--
-- NULL is a real value here, and common: the vendor's STRM bundle leaves
-- roughly a fifth of the crosswalk ungraded, and every row written before this
-- migration predates the column.
--
-- The CHECK explicitly excludes the no_relation value. The resolver drops those
-- rows: a signal attached to a control the crosswalk explicitly says is
-- unrelated is not a signal, it is noise with provenance.

ALTER TABLE public.runtime_control_signals
    ADD COLUMN IF NOT EXISTS relationship_type VARCHAR NULL;

ALTER TABLE public.runtime_control_signals
    DROP CONSTRAINT IF EXISTS runtime_control_signals_relationship_type_check;

ALTER TABLE public.runtime_control_signals
    ADD CONSTRAINT runtime_control_signals_relationship_type_check
    CHECK (relationship_type IS NULL
           OR relationship_type IN ('equal', 'subset', 'superset', 'intersects'));

COMMENT ON COLUMN public.runtime_control_signals.relationship_type IS
  'How the SCF control relates to the framework requirement the finding cited, '
  'from the vendor crosswalk. NULL means the vendor recorded no relationship — '
  'an absence, not a denial. Unrelated signals are dropped by the resolver.';


-- ============================================================================
-- VERIFICACAO -- rode e confira as quatro linhas
-- ============================================================================
SELECT 'document_control_provenance' AS tabela,
       to_regclass('public.document_control_provenance') IS NOT NULL AS existe
UNION ALL SELECT 'runtime_control_signals',
       to_regclass('public.runtime_control_signals') IS NOT NULL
UNION ALL SELECT 'defectdojo_product_links',
       to_regclass('public.defectdojo_product_links') IS NOT NULL
UNION ALL SELECT 'mcp_audit_log',
       to_regclass('public.mcp_audit_log') IS NOT NULL;

-- E a coluna que a migracao de hoje acrescenta:
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'runtime_control_signals'
   AND column_name  = 'relationship_type';
