-- 20260820000001_posture_core.sql
-- Trustworthy posture: our own control inventory, the document->control
-- provenance chain, and role-separated evidence.
--
-- There is deliberately NO verdict column. The verdict is derived by
-- src/lib/posture/verdict.ts from the rows in control_evidence, so it can
-- never drift from the evidence that justifies it.

-- ── Our own controls, independent of any framework ──────────────────────────
create table if not exists public.control_inventory (
  id                   uuid primary key default gen_random_uuid(),
  scf_control_code     varchar not null,
  product_version_id   uuid references public.product_versions(id) on delete cascade,
  implementation_state text not null default 'planned'
    check (implementation_state in ('implemented', 'partial', 'planned', 'not_applicable')),
  statement            text,
  owner                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (scf_control_code, product_version_id)
);

comment on table public.control_inventory is
  'What Ionic implements, per product version. Framework-independent: frameworks are applied as masks over this, never baked into it.';

-- ── What a chunk is about, and how we know ──────────────────────────────────
create table if not exists public.evidence_provenance (
  id               bigserial primary key,
  document_id      bigint not null references public.compliance_documents(id) on delete cascade,
  chunk_id         bigint not null references public.document_chunks(id) on delete cascade,
  scf_control_code varchar not null,
  method           text not null check (method in ('vector', 'llm_confirmed')),
  score            numeric(5,4) not null check (score >= 0 and score <= 1),
  snippet          text not null,
  justification    text,
  created_at       timestamptz not null default now(),
  unique (chunk_id, scf_control_code)
);

comment on table public.evidence_provenance is
  'The audit trail: document -> chunk -> SCF control, with the method and justification that produced the claim. Authoritative for the posture module (src/lib/posture/*, src/scripts/backfill-posture.ts) only. The older, never-migrated public.document_control_provenance is untouched by this migration and remains authoritative for its own three readers: src/lib/chat/control-provenance.ts, src/lib/assessment/corpus-fingerprint.ts, src/scripts/test-hardened-vectorization.ts.';

-- ── What counts as evidence, and in which role ──────────────────────────────
create table if not exists public.control_evidence (
  id                 bigserial primary key,
  scf_control_code   varchar not null,
  product_version_id uuid references public.product_versions(id) on delete cascade,
  chunk_id           bigint not null references public.document_chunks(id) on delete cascade,
  document_id        bigint not null references public.compliance_documents(id) on delete cascade,
  role               text not null check (role in ('policy', 'operational')),
  score              numeric(5,4) not null check (score >= 0 and score <= 1),
  snippet            text not null,
  created_at         timestamptz not null default now(),
  unique (scf_control_code, product_version_id, chunk_id, role)
);

comment on table public.control_evidence is
  'Evidence accepted for a control, separated by role. The role is a function of the document type, so a policy can never be counted as operational evidence.';

-- A chunk may serve only one role for a given control and version. The unique
-- constraint above includes `role`, so on its own it permits both.
--
-- Two PARTIAL indexes, not one plain index: Postgres treats NULLs as distinct
-- in a unique index by default, and product_version_id is NULL for every row
-- the backfill writes — so a single index over the three columns would enforce
-- nothing at all in exactly the path that matters. Splitting on the null
-- predicate covers both cases without depending on PG15's NULLS NOT DISTINCT.
create unique index if not exists control_evidence_one_role_per_chunk_global
  on public.control_evidence (scf_control_code, chunk_id)
  where product_version_id is null;

create unique index if not exists control_evidence_one_role_per_chunk_versioned
  on public.control_evidence (scf_control_code, product_version_id, chunk_id)
  where product_version_id is not null;

create index if not exists control_inventory_version_idx
  on public.control_inventory (product_version_id);
create index if not exists evidence_provenance_control_idx
  on public.evidence_provenance (scf_control_code);
create index if not exists evidence_provenance_document_idx
  on public.evidence_provenance (document_id);
create index if not exists control_evidence_lookup_idx
  on public.control_evidence (scf_control_code, product_version_id, role);

-- ── Updated-at trigger, reusing the existing helper ─────────────────────────
drop trigger if exists set_control_inventory_updated_at on public.control_inventory;
create trigger set_control_inventory_updated_at
  before update on public.control_inventory
  for each row execute function public.set_updated_at();

-- ── RLS: internal roles read; only service_role writes ──────────────────────
alter table public.control_inventory   enable row level security;
alter table public.evidence_provenance enable row level security;
alter table public.control_evidence    enable row level security;

-- One EXECUTE per statement: PL/pgSQL's EXECUTE runs a single command, and
-- packing several into one string is unreliable.
do $$
declare t text;
begin
  foreach t in array array['control_inventory', 'evidence_provenance', 'control_evidence']
  loop
    execute format('drop policy if exists %1$s_select_internal on public.%1$s', t);
    execute format($f$
      create policy %1$s_select_internal on public.%1$s
        for select using (
          auth.role() = 'service_role'
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin', 'ionic_user')
          )
        )
    $f$, t);
    execute format('drop policy if exists %1$s_write_service on public.%1$s', t);
    execute format($f$
      create policy %1$s_write_service on public.%1$s
        for all using (auth.role() = 'service_role')
        with check (auth.role() = 'service_role')
    $f$, t);
  end loop;
end $$;

-- ── Grants: table ACL, same reason as 20260704000001 ────────────────────────
-- `supabase db reset` applies migrations as `supabase_admin`, whose default
-- privileges do not cover these three brand-new tables, so a local/CI reset
-- leaves anon/authenticated/service_role with no ACL on them at all —
-- "permission denied for table control_inventory" before RLS is even
-- consulted. Hosted `db push` runs as `postgres` and already owns these
-- grants via its default privileges, so this is a no-op there. RLS policies
-- above remain the actual access guard; these grants only clear the ACL
-- check that gates them. Mirrors 20260704000001_reconcile_table_grants.sql.
grant usage on schema public to anon, authenticated, service_role;

grant all on public.control_inventory   to anon, authenticated, service_role;
grant all on public.evidence_provenance to anon, authenticated, service_role;
grant all on public.control_evidence    to anon, authenticated, service_role;

grant all on sequence public.evidence_provenance_id_seq to anon, authenticated, service_role;
grant all on sequence public.control_evidence_id_seq    to anon, authenticated, service_role;
