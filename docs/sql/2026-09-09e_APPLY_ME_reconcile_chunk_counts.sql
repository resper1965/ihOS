-- Reconciliacao de total_chunks, 2026-09-09.
--
-- O QUE ESTAVA ERRADO
--
-- Medido em 2026-09-09: 22 documentos registram total_chunks maior que zero e
-- nao tem nenhuma linha em document_chunks. Sao 834 chunks anunciados e
-- inexistentes, todos em arquivos .xlsx. A tabela document_chunks tem 4.082
-- linhas no total, entao o caminho de escrita funciona -- ele simplesmente nao
-- rodou para esses.
--
-- A causa, em tres camadas, todas corrigidas em codigo no mesmo commit:
--
--   1. extractText nao tinha ramo para xlsx e nao recusava formato
--      desconhecido: caia em file.text(), que num zip devolve mojibake.
--      Medido no documento 507: 45.276 caracteres, 38% imprimiveis, comecando
--      com PK\x03\x04 e [Content_Types].xml. Nao lancava, entao todo chamador
--      acreditava ter recebido um documento.
--   2. bulk-reindex-internal.ts declarava todo nao-PDF como text/plain, entao
--      resolveFileType -- a guarda que teria devolvido null para uma planilha
--      -- respondia 'txt'.
--   3. O mesmo script apagava os chunks ANTES de produzir os novos, engolia
--      qualquer erro no catch, seguia o laco, e nunca escrevia total_chunks.
--      A contagem ficava a da ultima ingestao boa.
--
-- Nenhuma tela revelava, porque a contagem exibida vem do registro do
-- documento, nao dos chunks.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Corrige as linhas existentes para dizerem a verdade. So isso: nao apaga
-- documento, nao apaga chunk, nao re-indexa nada. Um documento cujo
-- total_chunks passa a ser zero volta a aparecer corretamente como
-- nao-indexado -- inclusive em /api/compliance/kb-health, que conta documentos
-- com total_chunks = 0.
--
-- SEGURO DE REPETIR: recalcula a partir do que existe, entao rodar duas vezes
-- da o mesmo resultado.

-- Antes: quais linhas mentem, e por quanto.
SELECT d.id,
       d.file_format,
       d.total_chunks                                     AS anunciados,
       (SELECT count(*) FROM public.document_chunks c
         WHERE c.document_id = d.id)                      AS reais,
       d.title
  FROM public.compliance_documents d
 WHERE d.total_chunks IS DISTINCT FROM
       (SELECT count(*) FROM public.document_chunks c WHERE c.document_id = d.id)
 ORDER BY d.total_chunks DESC;

-- A correcao.
UPDATE public.compliance_documents d
   SET total_chunks = (
         SELECT count(*) FROM public.document_chunks c WHERE c.document_id = d.id
       )
 WHERE d.total_chunks IS DISTINCT FROM (
         SELECT count(*) FROM public.document_chunks c WHERE c.document_id = d.id
       );

-- Verificacao: espere zero linhas.
SELECT d.id, d.title, d.total_chunks AS anunciados,
       (SELECT count(*) FROM public.document_chunks c WHERE c.document_id = d.id) AS reais
  FROM public.compliance_documents d
 WHERE d.total_chunks IS DISTINCT FROM
       (SELECT count(*) FROM public.document_chunks c WHERE c.document_id = d.id);
