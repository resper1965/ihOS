# Plano Mestre — ihOS como Fonte Única da Verdade de Postura de Segurança

> **Objetivo declarado (produto):** manter a realidade da postura de segurança do
> nCommand Lite indexada e pronta para ser *interpolada por qualquer standard ou
> framework*, apontando gaps quando existirem; responder perguntas — via UI,
> chat, MCP ou questionários de clientes — **segmentadas por versão do produto e
> por postura comercial** (venda direta: Ionic como controladora de dados;
> via GEHC: GEHC como controladora); e funcionar como **fonte única da verdade**
> para todo assessment recebido de cliente, com cada resposta aprovada
> realimentando a base de conhecimento com segurança.
>
> Versão 1.0 — 2026-07-04. Sucede e incorpora specs/001 e specs/002 (entregues).

---

## 1. Arquitetura conceitual (o modelo em camadas)

```
┌─────────────────────────────────────────────────────────────────┐
│  SUPERFÍCIES DE CONSULTA          UI · Chat · Questionários · MCP│
│  (toda consulta carrega DOIS eixos: versão × canal comercial)   │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA 3 — MEMÓRIA DE RESPOSTAS (verified_answers)             │
│  Q&As aprovados por humano, datados, com fingerprint da postura │
│  → acelera respostas; NUNCA alimenta avaliações                 │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA 2 — POSTURA INTERPOLADA (evaluations/threat models)     │
│  control_evaluation_cache · evidence_evaluations · threat_models│
│  = a "verdade avaliada" por controle SCF, por framework,        │
│    por versão, por canal — persistida, invalidada por corpus    │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA 1 — CORPUS DOCUMENTAL (fonte da verdade)                │
│  compliance_documents + chunks + embeddings                     │
│  eixos: category (ISMS/B2B_GEHC/B2B_DIRECT/OPERATIONAL)         │
│         × escopo (global | versão) × doc_type (F1)              │
├─────────────────────────────────────────────────────────────────┤
│  CATÁLOGO EXTERNO — Standard API (verdades: SCF 1.468 controles,│
│  231 frameworks; serviços: avaliação). ihOS nunca inventa.      │
└─────────────────────────────────────────────────────────────────┘
```

**Regras invioláveis** (já na Constituição, Princípio VIII — reafirmadas aqui):

1. Camada N responde só com o que a camada N−1 sustenta. Sem documento → gap
   declarado, nunca resposta inventada.
2. Toda resposta carrega **proveniência visível**: de qual camada veio, quando
   foi avaliada, com que confiança.
3. A Camada 3 é *cache humano-verificado com validade* — não é documento, não é
   verdade primária, e expira quando a postura subjacente muda.

---

## 2. Diagnóstico: estado atual × alvo

| Capacidade | Hoje | Alvo | Fase |
|---|---|---|---|
| Corpus com categoria × escopo | ✅ (4 categorias, global/versão) | + `doc_type` controlado | F1 |
| Postura interpolada persistida | ✅ (specs/001-002) | mantém | — |
| Assessment segmentado por canal | ✅ (overlay B2B no engine) | mantém | — |
| Chat segmentado por versão×canal | ⚠️ parcial (versão opcional, canal ausente) | obrigatório e visível | F2 |
| Questionário segmentado | ❌ `filter_categories: null` — canal ignorado | obrigatório | F2 |
| Resposta fundamentada na postura avaliada | ❌ re-consulta chunks crus | postura → citações → gap declarado | F3 |
| Assessment de cliente como entidade | ❌ efêmero (perde-se ao fechar a página) | persistido, auditável, exportável | F4 |
| Q&A aprovado → vetores | ⚠️ existe (`promote-qa`) mas sem canal/versão/validade | memória segura com invalidação | F5 |
| Superfície MCP | ❌ | servidor MCP de postura | F6 |
| Detecção de SAD/SRS | ❌ regex no filename | `doc_type` estruturado | F1 |

---

## 3. Fases de implementação

### F1 — Taxonomia documental (`doc_type`) — *fundação, ~1 PR*

A coluna `doc_type` já existe (NOT NULL) mas não é exposta nem consumida.

**Matriz alvo** (categoria × escopo × tipo — cada documento tem UM lugar):

| `doc_type` | Categoria típica | Escopo | Consumidor |
|---|---|---|---|
| `POLICY` | ISMS_CORE | Global | Assessment fase 1 (política) |
| `PROCEDURE` | OPERATIONAL | Global | Assessment fase 2 (evidência) |
| `CONTRACT` | B2B_GEHC / B2B_DIRECT | Global | Overlay de canal (DPAs, MSAs) |
| `CLOUD_ARCH_ORG` | OPERATIONAL | Global | Controles CLD/NET (landing zone, IAM) |
| `SAD` | OPERATIONAL | **Versão** | Threat modeling (deltas) + assessment |
| `SRS_SDS` | OPERATIONAL | **Versão** | Threat modeling (deltas) |
| `TEST_REPORT` | OPERATIONAL | **Versão** | Evidência da versão; futuro gate de release |

Entregas: CHECK constraint idempotente; campo no UploadWizard (com descrição de
cada tipo); checklist do threat modeling passa a checar `doc_type='SAD'` em vez
de regex de filename; backfill assistido dos documentos existentes (tela de
triagem "documentos sem tipo"). Regra de ouro na UI: **Global = "a organização
é segura?" · Versão = "esta release é segura?"**.

### F2 — Contexto obrigatório: versão × canal em toda consulta — *~1 PR*

O eixo que falta. Entregas:

- **Context Bar global** (ver §5): seletor persistente `Versão × Canal` no
  header do dashboard; default = versão ativa + "Todos os canais"; escolhas
  gravadas por usuário.
- Chat: toda conversa nasce com o contexto da Context Bar; trocar contexto
  no meio da conversa gera aviso visível ("as respostas abaixo desta linha
  usam outro contexto").
- Pipeline de questionário: canal e versão **obrigatórios no passo 1** do
  upload; `filter_categories` derivado do canal exatamente como o engine de
  assessments já faz (`ISMS_CORE`+`OPERATIONAL`+overlay do canal).
- `match_documents_hybrid` já aceita os filtros — é ligar o que existe.

### F3 — Respostas fundamentadas na postura (answering em camadas) — *~2 PRs*

Hoje `generate-answers` re-faz RAG cru e pede opinião ao LLM. Alvo:

1. **Mapear pergunta → controles SCF** (embedding da pergunta × catálogo de
   controles, top-N; a Standard API é o catálogo).
2. **Ler o veredito persistido** (`control_evaluation_cache` /
   `evidence_evaluations`) para os controles mapeados no escopo
   (versão × canal): conforming / partial / gap + confiança + data.
3. **Compor a resposta**: veredito primeiro, citações documentais como
   sustentação, memória de respostas (F5) como referência de fraseado.
4. **Gap responde como gap**: "não há evidência indexada para X;
   [item em remediação — POA&M #N / sem plano registrado]". Prompt atual
   ("best-effort answer noting the gap") é substituído — best-effort viola o
   Princípio VIII. *Decisão de produto pendente: expor status de POA&M ao
   cliente ou responder neutro (configurável por assessment, default neutro).*
5. Postura desatualizada (avaliação mais antiga que o corpus) → resposta
   marcada "postura possivelmente desatualizada — re-rode o assessment" e
   `needs_review: true`.

### F4 — Customer Assessments como entidade de primeira classe — *~2 PRs*

O pipeline atual (parse → answers → revisão HITL → download) vira o motor de um
**processo persistido e auditável**. Novo módulo "Client Assessments":

**Modelo de dados:**

```sql
customer_assessments (
  id uuid PK, client_name text NOT NULL,
  sales_channel text CHECK (B2B_GEHC|B2B_DIRECT) NOT NULL,
  product_version_id uuid FK NOT NULL,
  source_file text, file_format text,
  status text CHECK (received|answering|in_review|approved|exported|archived),
  question_count int, answered_count int, approved_count int,
  posture_fingerprint text,      -- corpus fingerprint no momento das respostas
  created_by uuid FK, reviewed_by uuid FK,
  due_date date, exported_at timestamptz, created_at, updated_at
)
customer_assessment_answers (
  id uuid PK, assessment_id uuid FK CASCADE,
  question_text text, question_context text, cell_coords text,
  draft_answer text, final_answer text,
  answer_source text CHECK (posture|document|verified_qa|manual),
  mapped_controls jsonb,          -- controles SCF que fundamentaram
  references jsonb,               -- chunks citados
  confidence int, review_status text CHECK (pending|approved|edited|rejected),
  needs_review boolean DEFAULT false, reviewed_by uuid, reviewed_at timestamptz
)
```

**Fluxo (estados):** `received → answering → in_review → approved → exported → archived`.
Export = XLSX preenchido (código existe em `download-filled`) + PDF de
proveniência (que controle/documento fundamentou cada resposta) — este PDF é a
evidência de auditoria de que a resposta veio da fonte da verdade.

### F5 — Memória de Respostas (a feature proposta) — *~1 PR*

**Parecer: aprovada com salvaguardas.** O `promote-qa` atual insere chunks
`VERIFIED_QA` sem canal, sem versão, sem validade — três defeitos que
transformariam o acelerador em fonte de contaminação. Redesenho:

```sql
verified_answers (
  id uuid PK,
  question_text text, answer_text text, embedding vector(1536),
  sales_channel text NOT NULL,          -- nunca vaza entre canais
  product_version_id uuid,              -- null = organizacional
  source_assessment_id uuid FK,         -- de onde veio (auditoria)
  posture_fingerprint text NOT NULL,    -- retrato da postura na aprovação
  mapped_controls jsonb,
  approved_by uuid FK, approved_at timestamptz,
  valid boolean DEFAULT true,           -- invalidação (ver regras)
  invalidated_reason text, expires_at timestamptz
)
```

**Salvaguardas (as três regras da camada 3):**

1. **Sem vazamento de canal:** busca em `verified_answers` sempre filtra
   `sales_channel` + versão. Q&A da GEHC jamais responde cliente direto.
2. **Invalidação por mudança de postura:** quando o corpus fingerprint do
   escopo muda (mesmo gatilho que invalida `control_evaluation_cache`), os
   `verified_answers` do escopo ficam `valid=false` até re-confirmação — a UI
   de revisão mostra "resposta anterior (possivelmente desatualizada)" como
   *sugestão*, nunca como resposta automática.
3. **Sem câmara de eco:** `verified_answers` NUNCA entra como evidência em
   avaliação de controles (Camada 2 não lê Camada 3) e no answering aparece
   como "referência de fraseado" ranqueada abaixo do veredito de postura.
   Migração: chunks `VERIFIED_QA` legados (document_id null) são migrados para
   a nova tabela e removidos de `document_chunks`.

### F6 — Superfície MCP — *~1 PR*

Servidor MCP (`/api/mcp`, transport HTTP) expondo a postura para qualquer
agente. Ferramentas (todas com `product_version` e `sales_channel`
obrigatórios — o contrato reforça a segmentação):

| Tool | Retorno |
|---|---|
| `get_posture(version, channel, framework)` | score, conformes/parciais/gaps, data da avaliação, staleness |
| `answer_question(question, version, channel)` | resposta em camadas (F3) com proveniência estruturada |
| `list_gaps(version, channel, framework?)` | gaps + status de remediação (POA&M) |
| `get_threat_posture(version)` | threat model vigente, herdados/novos, limitações |

Auth: token de serviço com escopo read-only; auditoria de cada chamada.
Respostas incluem `is_estimated`/`needs_review` quando aplicável — um agente
consumidor nunca recebe número sem qualificação.

### F7 (transversal) — Design System & UX "nota 10"

**Preservar o que existe** (é bom e é marca):

| Token | Valor | Uso |
|---|---|---|
| Fonte | **Lato** (var `--font-sans`, fallback system-ui) | tudo; pesos 400/600/700 |
| Primária | **#3DC2C2** (teal Ionic; hover #2ca5a5) | ações, foco, links, seleção |
| Success | #37962D | conforme, aprovado |
| Warning | #EAB308 | parcial, estimado, needs_review |
| Danger | #EF4444 | gap, rejeitado, erro |
| Info | #5D99FF | herdado, informativo |
| Superfícies | glass-cards (light `#f5f5f7`/branco; dark `#000`/`#121212`) | manter os dois temas |
| Cinza marca | #58595b | texto secundário de marca |

Nada de paleta nova: consistência é usabilidade. Reforçar contraste AA nos
tons âmbar sobre glass claro (auditar com o validador do dataviz kit).

**Seis princípios de usabilidade (aplicados a TODAS as telas, novas e atuais):**

1. **Contexto sempre visível.** Context Bar fixa no header:
   `[nCommand Lite v2.3.x ▾] × [Canal: GEHC ▾]` — pill com a cor primária.
   Nenhuma pergunta, análise ou resposta acontece sem contexto explícito.
   Trocar contexto re-colore a barra por 2s (feedback de mudança).
2. **Toda resposta tem proveniência.** Chips padronizados em qualquer resposta
   (chat, questionário, MCP-docs): `◆ Postura avaliada (12/06)` teal ·
   `▤ Documento: PSI-04 §2.1` cinza · `✓ Q&A verificado (05/06)` verde ·
   `⚠ Estimado — revisar` âmbar · `✗ Gap declarado` vermelho. O usuário sabe
   *de qual camada* veio cada frase, sempre.
3. **Toda tela termina com "o que fazer agora".** Padrão já iniciado no PR #3
   (painel pós-assessment) estendido a: pós-upload ("3 avaliações
   invalidadas — re-rode o assessment X"), pós-revisão de questionário
   ("12 aprovadas → exportar; 2 rejeitadas → gaps sugeridos"), dashboard
   ("postura da v2.3.x desatualizada há 21 dias").
4. **Revisão HITL veloz.** Tela de revisão do F4 com navegação por teclado
   (↑↓ navega, A aprova, E edita, R rejeita), barra de progresso
   "18/40 revisadas", filtro "só needs_review", diff visual quando editada
   (rascunho IA vs final).
5. **Confiança sempre quantificada e colorida.** ≥70 verde, 40–69 âmbar,
   <40 vermelho (regra já usada na evidence-table — vira padrão global).
6. **Estados vazios que ensinam.** Toda lista vazia diz o que fazer:
   "Nenhum assessment de cliente ainda. Faça upload do questionário (XLSX,
   CSV ou PDF) — as respostas serão geradas da postura avaliada da versão e
   canal selecionados."

**Telas novas (F4) — wireframe textual:**

- **Client Assessments (inbox):** tabela glass — Cliente · Canal (pill) ·
  Versão · Status (dot colorido) · Progresso (barra 18/40) · Due date ·
  Ação primária contextual ("Continuar revisão" / "Exportar").
  CTA primário topo-direita: `+ Novo Assessment`.
- **Detalhe do assessment:** header com Context pills (cliente/canal/versão/
  fingerprint da postura) + stepper de estados; corpo = tabela de Q&A
  (princípio 4); painel lateral da questão selecionada: resposta, chips de
  proveniência, controles SCF mapeados, editor. Rodapé fixo: "o que fazer
  agora" + botão de export (habilita quando 100% revisado).
- **Wizard de novo assessment (3 passos):** 1. Cliente + Canal + Versão
  (obrigatórios, com explicação do papel de privacidade de cada canal) →
  2. Upload + parse preview ("41 perguntas detectadas, coluna de resposta E") →
  3. Geração com progresso por lote e estimativa.

---

## 4. Sequenciamento, dependências e critérios de aceite

| Ordem | Fase | Depende de | Aceite (mensurável) |
|---|---|---|---|
| 1 | F1 doc_type | — | upload exige tipo; checklist de threat usa doc_type; 0 regex de filename |
| 2 | F2 contexto | F1 | 100% das consultas de chat/questionário levam versão+canal; teste: mesma pergunta em canais distintos cita documentos do canal certo |
| 3 | F3 postura | F2 | pergunta sobre controle avaliado responde do veredito (não re-RAG); gap responde "gap"; zero respostas sem proveniência |
| 4 | F4 entidade | F3 | assessment sobrevive a reload; export XLSX+PDF proveniência; trilha de auditoria completa |
| 5 | F5 memória | F4 | Q&A aprovado consultável só no mesmo canal/versão; mudança de corpus invalida; Camada 2 nunca lê Camada 3 (teste de regressão) |
| 6 | F6 MCP | F3 | agente externo obtém postura/gaps com contexto obrigatório; chamadas auditadas |
| — | F7 UX | contínuo | heurística: qualquer tela responde "onde estou, o que é isto, o que faço agora" em <5s |

**Riscos principais e mitigação:** câmara de eco (regra 3 da F5 + teste de
regressão automatizado); vazamento entre canais (filtro obrigatório + teste
RLS/unit por canal); staleness silencioso (invalidação por fingerprint em F5 e
aviso de postura desatualizada em F3); escopo de F4 crescer (fatiar: entidade
persistida primeiro, PDF de proveniência depois).

**Fora de escopo deste plano:** multi-produto (hoje nCommand Lite único),
resposta automática sem revisão humana (HITL é requisito), edição de
documentos no ihOS (fonte é o repositório documental).
