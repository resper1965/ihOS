-- Correcao da identidade do nist_800_53, 2026-09-09.
--
-- O que estava errado, e por que passou: em 2026-09-08 o nist_800_53 foi curado
-- para 'general-nist-800-53-r5-2-high' na crenca de que as seis linhas NIST do
-- catalogo eram alternativas de abrangencia crescente, e que "High Baseline"
-- seria a mais ampla. Nao sao alternativas cumulativas.
--
-- Medido em 2026-09-09 contra a versao 826a1f05, os tres recortes de baseline
-- sao PERFEITAMENTE DISJUNTOS -- intersecao zero entre quaisquer dois -- e a
-- uniao dos tres da exatamente 370 requisitos, que e o tamanho real da baseline
-- High do NIST SP 800-53B:
--
--   low   149 requisitos   controles base      (CM-08, PL-02, SA-05, ...)
--   mod   138 requisitos   o que Moderate ACRESCENTA
--   high   83 requisitos   o que High ACRESCENTA   (CM-08(02), CP-06(02), ...)
--   ----------------------------------------------------------------
--   uniao 370 requisitos = a baseline High de fato
--
-- O vendor publica DELTAS sob nomes que se leem como conjuntos completos. Com
-- 'high', uma vulnerabilidade do DefectDojo que cite SI-10 ou IA-5 -- controles
-- base -- resolve para nada, porque 'high' so contem enhancements. O eixo NIST
-- continuaria morto, agora com uma linha de curadoria dando aparencia de
-- resolvido. E a projecao documental teria denominador 83.
--
-- A escolha aqui e o catalogo R5 inteiro: 810 requisitos, superconjunto de
-- todos os recortes. Toda vulnerabilidade cai em algum lugar, e o denominador
-- e explicavel -- "medimos contra todo o 800-53 R5". Mais dificil de pontuar
-- bem, e essa e a troca deliberada.
--
-- ISTO E UM INTERINO, e o registro diz isso de proposito. A resposta correta e
-- uma identidade apontar para varios slugs (low + mod + high), o que
-- framework_identity_curation -- uma linha, um slug -- nao sabe expressar. Esse
-- e o segundo caso em 24h: o primeiro foi o Anexo A da ISO 27001, ja registrado
-- como risco na secao 7 de docs/superpowers/specs/2026-09-08-one-spine-design.md.
-- Dois casos independentes dizem que o modelo de curadoria e estreito demais.

UPDATE public.framework_identity_curation
   SET vendor_framework_code   = 'general-nist-800-53-r5-2',
       confidence              = 'probable',
       decided_by              = 'resper@ionic.health',
       decided_against_version = '826a1f05-f065-4feb-9f44-ced8019a6701',
       rationale               = 'Corrige a decisao de 2026-09-08, que escolheu a baseline High acreditando ser a mais ampla. Medido em 2026-09-09: os recortes low/mod/high sao disjuntos (intersecao zero) e somam 370, o tamanho real da baseline High do 800-53B -- ou seja, o vendor publica deltas, nao conjuntos cumulativos, e high contem apenas enhancements. Com high, uma vulnerabilidade citando um controle base como SI-10 resolveria para nada. Escolhido o catalogo R5 inteiro (810 requisitos) como superconjunto: cobertura correta para a postura observada e denominador explicavel para a projecao. Confianca probable, nao exact, porque o slug nomeia o catalogo e nao a baseline contra a qual a Ionic se declara -- essas sao perguntas diferentes, e junta-las foi o erro original. Definitivo quando a curadoria souber apontar para varios slugs.'
 WHERE local_code = 'nist_800_53';

-- Verificacao. Espere 1117 mapeamentos sobre 810 requisitos distintos.
SELECT c.local_code,
       c.vendor_framework_code,
       c.confidence,
       (SELECT count(*)
          FROM public.scf_control_mappings m
         WHERE m.framework_code = c.vendor_framework_code
           AND m.scf_version_id = '826a1f05-f065-4feb-9f44-ced8019a6701') AS mapeamentos,
       (SELECT count(DISTINCT m.requirement_code)
          FROM public.scf_control_mappings m
         WHERE m.framework_code = c.vendor_framework_code
           AND m.scf_version_id = '826a1f05-f065-4feb-9f44-ced8019a6701') AS requisitos
  FROM public.framework_identity_curation c
 WHERE c.local_code = 'nist_800_53';
