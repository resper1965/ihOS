-- ============================================================================
-- Migration 009: Habilitar Replicação Supabase Realtime
-- ihOS — Intelligent Hardened Operating System
-- ============================================================================

begin;

-- Garante que a publicação 'supabase_realtime' existe no banco de dados
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Adiciona as tabelas reativas à publicação realtime
alter publication supabase_realtime add table public.agent_notifications;
alter publication supabase_realtime add table public.evidence_evaluations;
alter publication supabase_realtime add table public.intelligence_snapshots;

commit;
