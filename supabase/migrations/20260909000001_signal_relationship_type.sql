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
