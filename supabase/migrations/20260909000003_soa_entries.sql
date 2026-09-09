-- Migration 20260909000003: the Statement of Applicability, as rows.
--
-- The SoA is the most authoritative artefact the ISMS produces and nothing read
-- it. It was chunked into prose for retrieval, and even that failed silently:
-- measured 2026-09-09, 22 xlsx documents record 834 chunks between them and hold
-- none. So the declared axis of the product's posture has been invisible to
-- every assessment ever run.
--
-- One row per control: whether it applies, and the justification a person wrote.
-- Composed with annex_control_mappings, these produce posture at SCF level with
-- no retrieval at all.

CREATE TABLE IF NOT EXISTS public.soa_entries (
  document_id   bigint  NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  annex_code    text    NOT NULL,

  annex_group   text    NOT NULL,
  title         text    NOT NULL,
  description   text    NULL,

  applicable    boolean NOT NULL,
  justification text    NOT NULL,
  notes         text    NULL,

  standard      text    NOT NULL,
  annex         text    NOT NULL,

  source_sheet  text    NOT NULL,
  source_row    integer NOT NULL,
  -- The sha256 of the file this row was read from. The guard in
  -- src/lib/soa/source.ts compares it against the file in storage, so a SoA
  -- edited in place fails the next import loudly instead of importing over
  -- itself. Same value on every row of one import; denormalised on purpose so
  -- the guard needs no second table.
  source_sha256 text    NOT NULL,
  imported_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (document_id, annex_code)
);

-- document_id is in the key on purpose. A Statement of Applicability is a dated
-- declaration; the previous one is evidence of what was declared then. A new SoA
-- imports alongside rather than over.

-- applicable is a boolean because there is no third state, and justification is
-- NOT NULL because a declaration without a reason is not one. Measured in the
-- source: 142 of 142 rows carry both, so neither constraint costs anything today
-- and both prevent a silent gap later.

ALTER TABLE public.soa_entries
  DROP CONSTRAINT IF EXISTS soa_entries_standard_annex_valid_pair;
ALTER TABLE public.soa_entries
  ADD CONSTRAINT soa_entries_standard_annex_valid_pair CHECK (
    (standard, annex) IN (
      ('iso27001:2022', 'A'),
      ('iso27701:2019', 'A'),
      ('iso27701:2019', 'B')
    )
  );

CREATE INDEX IF NOT EXISTS soa_entries_applicable_idx
  ON public.soa_entries (document_id, applicable);
CREATE INDEX IF NOT EXISTS soa_entries_standard_idx
  ON public.soa_entries (standard, annex);

COMMENT ON TABLE public.soa_entries IS
  'One row per control the Ionic ISMS declares, from the Statement of '
  'Applicability: whether it applies and why. The declared axis of posture, '
  'read together with the practised axis (evidence documents) and the observed '
  'axis (runtime_control_signals). Never derived -- every row is a person''s '
  'written decision, traceable to a sheet and a row number.';

COMMENT ON COLUMN public.soa_entries.annex_code IS
  'The control identifier as the SoA writes it: A.5.1 for ISO 27001:2022 Annex '
  'A, A.7.2.1 for ISO 27701 Annex A, B.8.2.1 for ISO 27701 Annex B. Joins to '
  'annex_control_mappings.annex_code for the A ones; the crosswalk holds no B '
  'codes, which is a known and reported gap.';

ALTER TABLE public.soa_entries ENABLE ROW LEVEL SECURITY;

-- Scoped the way its parent document is scoped (005_rls_policies.sql,
-- section 5, DOCUMENT_CHUNKS): a soa_entries row has no visibility of its
-- own, it inherits compliance_documents' visibility for its document_id, the
-- same way document_chunks inherits it for the document it belongs to.
-- Before this, soa_entries_read granted every authenticated user (including
-- client_user) unconditional SELECT -- broader than compliance_documents
-- itself, where docs_select_client restricts a client_user to ISMS_CORE and
-- their own B2B_<org> overlay. That gap let a client_user who cannot read
-- document 392 read all 142 of its rows, justification text included.
DROP POLICY IF EXISTS soa_entries_read ON public.soa_entries;

CREATE POLICY soa_entries_select_internal ON public.soa_entries
  FOR SELECT
  USING (public.get_user_role() IN ('admin', 'ionic_user'));

CREATE POLICY soa_entries_select_client ON public.soa_entries
  FOR SELECT
  USING (
    public.get_user_role() = 'client_user'
    AND EXISTS (
      SELECT 1 FROM public.compliance_documents d
      WHERE d.id = document_id
        AND (
            d.category = 'ISMS_CORE'
            OR d.category::text = 'B2B_' || public.get_user_client_org()
        )
    )
  );
