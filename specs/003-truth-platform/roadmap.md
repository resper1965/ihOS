# Roadmap de Finalização — ihOS

> Sequência de ondas para levar a aplicação ao estado "pronta para o
> propósito": postura real do nCommand Lite indexada → interpolável por
> qualquer framework → consultável por versão × canal (UI, chat, MCP) →
> respondendo assessments de clientes como fonte única da verdade.
> Detalhe técnico de cada fase: `plan.md`. Tarefas: `tasks.md`.
> Versão 1.0 — 2026-07-04.

## Decisões de produto registradas

1. **F6-lite antecipado**: o servidor MCP read-only (`get_posture`,
   `list_gaps`, `get_threat_posture`) entra na Onda 1 — só lê dados já
   persistidos; `answer_question` chega com a F3 (Onda 2).
2. **Gaps em respostas a clientes**: default **neutro** (não expõe POA&M/
   prazos); exposição de status de remediação é opt-in por assessment (F4).

## Ondas (cada uma = 1–2 PRs, mergeável e útil sozinha)

| Onda | Conteúdo | Tarefas | Aceite |
|---|---|---|---|
| **1a** | Triagem `UNCLASSIFIED` (banner + editor inline de tipo) + este roadmap | T106 | zero documentos sem tipo após triagem humana |
| **1b** | Context Bar global (versão × canal, persistida); canal obrigatório em chat/questionário; "todos os canais" só em visões agregadas | T201–T204 | mesma pergunta em canais distintos cita documentos do canal certo |
| **1c** | **F6-lite**: MCP `/api/mcp` read-only (postura/gaps/threat) + token de serviço + auditoria | T601 (parcial), T602 | agente externo lê postura com contexto obrigatório |
| **2** | Respostas fundamentadas na postura: pergunta→controles SCF, veredito→citações→gap declarado, prompt fail-closed, aviso de staleness | T301–T304 | pergunta sobre controle avaliado responde do veredito, não de re-RAG |
| **3** | Assessments de clientes: entidade+RLS, inbox, wizard, revisão HITL por teclado, export XLSX + PDF de proveniência | T401–T404 | assessment sobrevive a reload; trilha recebido→…→arquivado completa |
| **4** | Memória de respostas (`verified_answers` com canal/versão/fingerprint/validade, invalidação, migração dos chunks legados, teste anti-eco) + MCP `answer_question` | T501–T504, T601 (resto) | Q&A aprovado só responde no mesmo canal/versão; corpus muda ⇒ invalida |
| **5** | Acabamento: chips de proveniência unificados; painéis "o que fazer agora" restantes; seed form + seletor de versão anterior; tipos Supabase regenerados; hit-rate em store; auditoria de contraste; suíte E2E dos 4 fluxos críticos no CI | T701–T703 + specs/001-002 legado (T040 resto, T041, T042) | qualquer tela responde "onde estou / o que é / o que faço" em <5s |

## Portão de release (ações do operador — fora do código)

1. **Rotacionar a `SUPABASE_SECRET_KEY`** exposta durante o desenvolvimento.
2. Envs de produção: `STANDARD_GRC_API_URL` terminando em `/api/v1`;
   `STANDARD_GRC_TENANT_ID` setada; `GRC_LOCAL_FALLBACK_ENABLED` **não** setada.
3. Rodar `docs/RUNBOOK_analysis_flow_validation.md` em staging (T043).
4. Triagem humana dos documentos `UNCLASSIFIED` (Onda 1a habilita).

## Riscos monitorados

- **Escopo da Onda 3** crescer → fatiar: entidade persistida primeiro, PDF de
  proveniência depois.
- **Qualidade do mapeamento pergunta→controle** (Onda 2) → threshold
  conservador; mapeamento fraco ⇒ `needs_review`, nunca resposta confiante.
- **Câmara de eco** (Onda 4) → teste de regressão automatizado: Camada 2
  jamais lê Camada 3.
