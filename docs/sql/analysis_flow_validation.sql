-- ============================================================================
-- Analysis Flow — one-shot validation + migration for the Supabase SQL Editor
-- Paste this whole file into Supabase → SQL Editor and Run.
-- It is idempotent and additive (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS). It never drops or rewrites existing data. Run on STAGING first.
-- ============================================================================

-- ── SECTION 1: PRE-FLIGHT DIAGNOSTIC (read-only) ────────────────────────────
-- What state is the schema in before we change anything?

select 'control_evaluation_cache table' as object,
       to_regclass('public.control_evaluation_cache') is not null as exists;

select 'product_versions.previous_version_id' as object,
       exists (select 1 from information_schema.columns
               where table_name='product_versions' and column_name='previous_version_id') as exists
union all
select 'threat_models.baseline_model_id',
       exists (select 1 from information_schema.columns
               where table_name='threat_models' and column_name='baseline_model_id')
union all
select 'threat_models.source',
       exists (select 1 from information_schema.columns
               where table_name='threat_models' and column_name='source')
union all
select 'product_version_deltas.extraction_confidence',
       exists (select 1 from information_schema.columns
               where table_name='product_version_deltas' and column_name='extraction_confidence')
union all
select 'product_version_deltas.needs_review',
       exists (select 1 from information_schema.columns
               where table_name='product_version_deltas' and column_name='needs_review');

-- Sanity: confirm the tables the app writes actually exist (drift check).
select t as table_name, to_regclass('public.'||t) is not null as exists
from unnest(array['assessments','compliance_assessments','evidence_evaluations',
                  'threat_models','product_versions','product_version_deltas',
                  'compliance_documents','scf_framework_mappings']) as t;


-- ── SECTION 2: APPLY MIGRATIONS (DDL, additive) ─────────────────────────────
-- Mirrors supabase/migrations/20260702_control_evaluation_cache.sql
--       and supabase/migrations/20260702_version_baseline_lineage.sql

-- set_updated_at() must already exist (migration 004). Guard just in case.
create or replace function public.set_updated_at()
returns trigger language plpgsql security definer as $$
begin new.updated_at = now(); return new; end; $$;

-- 2a. control_evaluation_cache -----------------------------------------------
create table if not exists public.control_evaluation_cache (
    id                  uuid primary key default gen_random_uuid(),
    control_code        varchar not null,
    mode                varchar not null check (mode in ('quick','deep')),
    product_version_id  uuid references public.product_versions(id) on delete cascade,
    sales_channel       varchar,
    scope_key           varchar not null,
    corpus_fingerprint  varchar not null,
    evaluation          jsonb not null,
    evaluated_at        timestamptz not null default now(),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (control_code, mode, scope_key)
);
create index if not exists idx_control_eval_cache_scope   on public.control_evaluation_cache (mode, scope_key);
create index if not exists idx_control_eval_cache_version on public.control_evaluation_cache (product_version_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_control_evaluation_cache_updated_at') then
    create trigger trg_control_evaluation_cache_updated_at
      before update on public.control_evaluation_cache
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.control_evaluation_cache enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='control_evaluation_cache' and policyname='control_evaluation_cache_select_authenticated') then
    create policy control_evaluation_cache_select_authenticated on public.control_evaluation_cache
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='control_evaluation_cache' and policyname='control_evaluation_cache_service_write') then
    create policy control_evaluation_cache_service_write on public.control_evaluation_cache
      for all using (auth.role() = 'service_role');
  end if;
end $$;

-- 2b. version baseline lineage ------------------------------------------------
alter table public.product_versions
    add column if not exists previous_version_id uuid references public.product_versions(id) on delete set null;
create index if not exists idx_product_versions_previous on public.product_versions (previous_version_id);

alter table public.threat_models
    add column if not exists baseline_model_id text references public.threat_models(id) on delete set null,
    add column if not exists source text not null default 'generated';
-- add the CHECK only if it isn't there yet
do $$ begin
  if not exists (select 1 from information_schema.constraint_column_usage
                 where table_name='threat_models' and column_name='source'
                 and constraint_name='threat_models_source_check') then
    alter table public.threat_models
      add constraint threat_models_source_check check (source in ('generated','inherited','manual_seed'));
  end if;
end $$;
create index if not exists idx_threat_models_baseline on public.threat_models (baseline_model_id);

alter table public.product_version_deltas
    add column if not exists extraction_confidence numeric(3,2)
        check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
    add column if not exists needs_review boolean not null default false,
    add column if not exists source_document_id bigint references public.compliance_documents(id) on delete set null;


-- ── SECTION 3: POST-MIGRATION VERIFICATION ──────────────────────────────────
select 'control_evaluation_cache' as object, to_regclass('public.control_evaluation_cache') is not null as ok
union all
select 'product_versions.previous_version_id',
       exists (select 1 from information_schema.columns where table_name='product_versions' and column_name='previous_version_id')
union all
select 'threat_models.source',
       exists (select 1 from information_schema.columns where table_name='threat_models' and column_name='source')
union all
select 'product_version_deltas.needs_review',
       exists (select 1 from information_schema.columns where table_name='product_version_deltas' and column_name='needs_review');

-- Current versions (to pick previous_version_id links for lineage testing):
select id, version_code, status, previous_version_id from public.product_versions order by created_at;
