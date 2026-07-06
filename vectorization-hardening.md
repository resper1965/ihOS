# Hardening: Vetorização e Persistência de Controles

## Goal
Conectar os fios soltos do pipeline de ingestão. Os controles SCF devem ser extraídos e persistidos no momento do upload, com cadeia de proveniência rastreável. Documentos reapresentados destroem e recalculam toda a cadeia derivada.

## Tasks

- [ ] Task 1: **Criar `chunkComplianceDocument()` em `src/lib/chat/chunker.ts`** → Adicionar uma função exportada alternativa ao `chunkDocument()` que usa chunk size de 1200 chars, overlap de 400 chars, e separadores orientados a compliance (`/^\d+\.\d*\s/m`, `/^#{1,3}\s/m`, `/^(?:A\.\d+|PR\.|DE\.)/m`, `\n\n`, `\n`, `. `). O `chunkDocument()` original permanece intocado. Verify: `chunkComplianceDocument(textoISMS)` retorna chunks menores com `sectionTitle` capturando cláusulas numeradas.

- [ ] Task 2: **Criar `src/lib/chat/scf-tagger.ts`** → Nova função `tagChunksWithScf(adminClient, chunkRows[])` que, dado um array de chunks já com embeddings, chama a RPC `match_scf_controls` existente (em `006_functions.sql`, threshold 0.70, top 5) para cada chunk e popula `chunk.scf_controls[]`. Processar em batches de 10 com `Promise.all`. Verify: Passar um chunk com embedding de uma política de criptografia e receber `['CRY-01', 'CRY-03']` no array.

- [ ] Task 3: **Criar migration `20260706000001_document_control_provenance.sql`** → Nova tabela com FK para `compliance_documents`, `document_chunks`, colunas `scf_control_code`, `similarity`, `extraction_method`, `evidence_snippet`, `product_version_id`. Index em `document_id`, `scf_control_code` e `product_version_id`. UNIQUE constraint em `(chunk_id, scf_control_code)`. Verify: `\d document_control_provenance` no Supabase mostra a tabela com FK e indexes.

- [ ] Task 4: **Criar `src/lib/chat/control-provenance.ts`** → Nova função `persistControlProvenance(adminClient, documentId, productVersionId, taggedChunks[])` que, para cada chunk que recebeu `scf_controls[]` na Task 2, insere um registro em `document_control_provenance` com o `document_id`, `chunk_id`, `scf_control_code`, `similarity`, e `evidence_snippet` (primeiros 300 chars do chunk). Usa upsert. Verify: Após upload, `SELECT * FROM document_control_provenance WHERE document_id = X` retorna registros.

- [ ] Task 5: **Modificar `src/app/api/documents/upload/route.ts`** → Após insert chunks (linha 203), adicionar 3 passos: (1) buscar chunks recém-inseridos com seus IDs reais do banco, (2) chamar `tagChunksWithScf()` e fazer UPDATE nos chunks para popular `scf_controls`, (3) chamar `persistControlProvenance()`. Trocar `chunkDocument()` (linha 166) por `chunkComplianceDocument()`. Verify: Upload de doc ISMS → chunks com `scf_controls` populados → proveniência criada.

- [ ] Task 6: **Modificar `src/app/api/documents/[id]/reindex/route.ts`** → Antes de deletar old chunks (linha 110), deletar proveniências antigas e invalidar `control_evaluation_cache`. Após inserir novos chunks (linha 155), repetir os 3 passos da Task 5. Trocar `chunkDocument()` (linha 107) por `chunkComplianceDocument()`. Verify: Reindex → proveniências antigas somem → novas aparecem → cache invalidado.

- [ ] Task 7: **Atualizar `src/lib/assessment/corpus-fingerprint.ts`** → Incluir count de `document_control_provenance` no cálculo do SHA1 para invalidar avaliações quando proveniências mudam. Verify: Upload de novo doc muda o `corpus_fingerprint`.

- [ ] Task 8: **Verificação End-to-End** → Upload de PDF ISMS real: chunks ~1200 chars com `scf_controls[]` não-NULL, proveniência com ≥5 registros, reindex destroi e reconstrói tudo, cache invalidado. Verify: Queries SQL no Supabase.

## Done When
- [ ] Upload popula `scf_controls[]` nos chunks E cria `document_control_provenance`.
- [ ] Reindex destroi e reconstrói toda a cadeia (chunks + tags + proveniências + cache).
- [ ] Auditor rastreia qualquer controle SCF de volta ao chunk e documento originais.

## Notes
- A RPC `match_scf_controls` já existe em `006_functions.sql` com threshold 0.75 e top 5.
- As 1.468 embeddings de `scf_controls` já estão no banco. Zero custo de LLM para auto-tagging.
- O upgrade do embedding model fica como segunda fase (requer re-embeddar corpus + alterar coluna VECTOR).
- Tasks 5 e 6 compartilham lógica pós-insert — extrair para `postIngestPipeline()` para DRY.
