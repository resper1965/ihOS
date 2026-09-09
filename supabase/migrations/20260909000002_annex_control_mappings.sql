-- Migration 20260909000002: the Annex A crosswalk, as an asset rather than a
-- leftover.
--
-- ISO Annex A does not exist in the vendor's catalogue. Measured 2026-09-09:
-- general-iso-27001-2022 holds 148 requirement codes and every one is a
-- management clause (4.1 through 10.2); the STRM bundle carries no A.x.y code
-- in any of its 183 focal documents. The vendor does not publish it and there
-- is nothing to import from.
--
-- So the mapping in scf_framework_mappings -- 2,689 rows over 125 Annex A ids,
-- reaching 407 SCF controls -- is Ionic's own. This table gives it what the
-- legacy one cannot hold: which edition an id belongs to, where the row came
-- from, how the control relates to the requirement, and who decided.
--
-- The legacy table is NOT dropped here and its nine consumers are NOT
-- repointed. That is a separate project.

CREATE TABLE IF NOT EXISTS public.annex_control_mappings (
  edition           text NOT NULL
    CHECK (edition IN ('iso27001:2022', 'iso27701:2019')),
  annex_code        text NOT NULL,
  control_code      text NOT NULL,

  -- NULL means the relationship is unrecorded, which is the honest state for
  -- every imported row: the legacy table holds three codes and nothing else.
  -- Distinct from 'no_relation', which is a positive claim of non-relation.
  relationship_type text NULL
    CHECK (relationship_type IS NULL
           OR relationship_type IN ('equal', 'subset', 'intersects', 'superset', 'no_relation')),

  provenance        text NOT NULL,
  confidence        text NOT NULL
    CHECK (confidence IN ('exact', 'probable', 'rejected')),

  decided_by        text NULL,
  decided_at        timestamptz NULL,
  rationale         text NULL,
  imported_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (edition, annex_code, control_code)
);

-- Edition is in the key, not inferred at read time, because the two vocabularies
-- overlap in shape: A.7.5 is an ISO 27001:2022 physical control and A.7.5.3 is
-- an ISO 27701 PII control. A key on the code alone would collide them.

-- An exact mapping is a human decision. Storing one with no signature is how a
-- guess acquires authority, so it is unstorable.
ALTER TABLE public.annex_control_mappings
  DROP CONSTRAINT IF EXISTS annex_control_mappings_exact_is_signed;
ALTER TABLE public.annex_control_mappings
  ADD CONSTRAINT annex_control_mappings_exact_is_signed CHECK (
    confidence <> 'exact'
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND rationale IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS annex_control_mappings_control_idx
  ON public.annex_control_mappings (control_code);
CREATE INDEX IF NOT EXISTS annex_control_mappings_confidence_idx
  ON public.annex_control_mappings (confidence);

COMMENT ON TABLE public.annex_control_mappings IS
  'ISO Annex A control to SCF control, owned by Ionic. The vendor publishes no '
  'Annex A crosswalk -- measured 2026-09-09, its ISO 27001 mapping is management '
  'clauses only and its STRM bundle carries no A.x.y code -- so this has no '
  'upstream and is not a stopgap. Rows imported from the legacy '
  'scf_framework_mappings carry provenance undocumented_pre_2026-06-05 and '
  'confidence probable; only a person turns one exact.';

COMMENT ON COLUMN public.annex_control_mappings.provenance IS
  'Where the row came from. undocumented_pre_2026-06-05 means the legacy import '
  'of that date, whose own source is not recorded anywhere and could not be '
  'recovered. It is a true statement, not a placeholder.';

ALTER TABLE public.annex_control_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annex_control_mappings_read ON public.annex_control_mappings;
CREATE POLICY annex_control_mappings_read ON public.annex_control_mappings
  FOR SELECT TO authenticated USING (true);
