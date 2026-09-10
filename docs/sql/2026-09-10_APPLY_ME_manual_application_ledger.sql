-- Um registro do que foi aplicado a mao, 2026-09-10.
--
-- O PROBLEMA
--
-- Existem 16 scripts em docs/sql/. Onze deles se chamam APPLY_ME, o que quer
-- dizer que alguem os roda no editor SQL do Supabase quando lembra. Nada
-- registra quais rodaram. As migracoes em supabase/migrations/ tem controle
-- proprio; estes nao tem nenhum.
--
-- O custo disso apareceu em 2026-09-10: para saber se a reconciliacao de
-- total_chunks tinha sido aplicada, foi preciso consultar o banco e comparar
-- contagem a contagem. Nao havia outro jeito. Multiplique por onze scripts e
-- por qualquer pessoa que chegue depois.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Cria a tabela do registro e a preenche com o estado MEDIDO hoje, nao com uma
-- lista de boas intencoes. Cada linha marcada 'applied' traz na coluna
-- `evidence` a consulta que confirmou, com o numero que ela devolveu.
--
-- Ausencia de linha significa DESCONHECIDO, nunca "nao aplicado". Um script sem
-- registro e um script sobre o qual ninguem verificou nada -- e essa e a
-- diferenca que este arquivo existe para preservar.
--
-- SEGURO DE REPETIR: CREATE TABLE IF NOT EXISTS mais ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS public.schema_manual_applications (
  script_name  text PRIMARY KEY,
  status       text NOT NULL CHECK (status IN ('applied', 'superseded', 'unknown')),
  applied_at   timestamptz,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  recorded_by  text NOT NULL,
  -- A medicao que sustenta o status. Um status sem evidencia e uma opiniao.
  evidence     text,
  notes        text
);

COMMENT ON TABLE public.schema_manual_applications IS
  'Quais scripts de docs/sql/ foram aplicados. Ausencia de linha = desconhecido, nao = nao aplicado.';

INSERT INTO public.schema_manual_applications
  (script_name, status, applied_at, recorded_by, evidence, notes)
VALUES
  ('2026-08-26_withdraw_fabricated_scorecards.sql', 'applied', NULL, 'resper@ionic.health',
   'scf_framework_mappings_quarantine tem 25.589 linhas, medido 2026-09-10 — exatamente o volume que o script move para quarentena.',
   'Data de aplicacao desconhecida; so o efeito foi verificado.'),

  ('2026-08-28_control_spine_apply.sql', 'applied', NULL, 'resper@ionic.health',
   'scf_control_mappings tem 146.367 linhas em duas versoes de catalogo, medido 2026-09-10.',
   NULL),

  ('2026-08-28d_APPLY_ME_framework_identities.sql', 'superseded', NULL, 'resper@ionic.health',
   'framework_identity_curation tem 8 linhas, todas em formato slug, medido 2026-09-10. Este script gravou o formato de frase.',
   'Substituido por 2026-09-08_APPLY_ME_recurate_identities.sql, que reexpressou as mesmas decisoes no vocabulario novo do fornecedor.'),

  ('2026-08-28e_APPLY_ME_iso27701_identity.sql', 'superseded', NULL, 'resper@ionic.health',
   'Mesma evidencia de 28d.', 'Substituido pela recuragem de 2026-09-08.'),

  ('2026-08-28f_APPLY_ME_txramp_identity.sql', 'superseded', NULL, 'resper@ionic.health',
   'Mesma evidencia de 28d.', 'Substituido pela recuragem de 2026-09-08.'),

  ('2026-09-08_APPLY_ME_recurate_identities.sql', 'applied', NULL, 'resper@ionic.health',
   'As 8 linhas de framework_identity_curation carregam os slugs deste script (general-iso-27001-2022, general-aicpa-tsc-2017, ...), lidas 2026-09-10.',
   'nist_800_53 foi corrigido depois para general-nist-800-53-r5-2; ver 2026-09-09_APPLY_ME_nist_baseline_correction.sql.'),

  ('2026-09-09c_APPLY_ME_annex_crosswalk.sql', 'applied', NULL, 'resper@ionic.health',
   'annex_control_mappings tem 2.228 linhas, medido 2026-09-10.', NULL),

  ('2026-09-09d_APPLY_ME_soa_entries.sql', 'applied', NULL, 'resper@ionic.health',
   'soa_entries tem 142 linhas, medido 2026-09-10 — os 142 controles que a SoA declara.', NULL),

  ('2026-09-09e_APPLY_ME_reconcile_chunk_counts.sql', 'applied', '2026-09-09'::timestamptz, 'resper@ionic.health',
   'Zero documentos com total_chunks divergente da contagem real, verificado 2026-09-09 sobre 198 documentos e 4.082 chunks.',
   'Unico com data conhecida: foi aplicado durante a sessao que o escreveu.'),

  -- Os que sobram nao foram verificados. Ficam explicitos como desconhecidos em
  -- vez de ausentes, porque uma lista incompleta que parece completa e pior que
  -- uma lista que diz onde termina.
  ('2026-08-26b_remove_zero_control_scorecards.sql', 'unknown', NULL, 'resper@ionic.health', NULL,
   'Nao verificado. O efeito e uma remocao, e nao restou consulta que distinga "removido" de "nunca existiu".'),
  ('2026-08-28b_APPLY_ME_mapping_key.sql', 'unknown', NULL, 'resper@ionic.health', NULL,
   'Nao verificado. Exige inspecionar a constraint de scf_framework_mappings.'),
  ('2026-08-28c_APPLY_ME_relationship_nullable.sql', 'unknown', NULL, 'resper@ionic.health', NULL,
   'Nao verificado. Exige inspecionar a nulabilidade da coluna.'),
  ('2026-09-09_APPLY_ME_CONSOLIDADO_lacuna_migracoes.sql', 'unknown', NULL, 'resper@ionic.health', NULL,
   'Nao verificado. Consolida varias migracoes; precisa de checagem item a item.'),
  ('2026-09-09_APPLY_ME_nist_baseline_correction.sql', 'applied', NULL, 'resper@ionic.health',
   'framework_identity_curation.nist_800_53 aponta para general-nist-800-53-r5-2 com confidence=probable, lido 2026-09-10.', NULL),
  ('2026-09-09_APPLY_ME_signal_relationship.sql', 'unknown', NULL, 'resper@ionic.health', NULL,
   'Nao verificado.')

ON CONFLICT (script_name) DO NOTHING;

-- Confira o resultado.
SELECT status, count(*) FROM public.schema_manual_applications GROUP BY status ORDER BY status;
SELECT script_name, status, evidence FROM public.schema_manual_applications ORDER BY script_name;
