# ihOS — Manual de Operação

> Guia operacional por módulo: **para que serve, quando usar, o que cada ação
> faz e o que você deve fazer em seguida**. Escrito a partir do código real
> (fluxos de análise verificados em profundidade; demais módulos em nível de
> visão geral). Última revisão: 2026-07-03.

---

## O modelo mental em 3 frases

1. **Documentos são a fonte da verdade.** Tudo que o ihOS afirma sobre
   conformidade vem do corpus RAG (`Documents`) + do catálogo SCF da Standard
   API. Sem documento indexado, não há avaliação — há *gap*.
2. **Avaliações são persistidas e reutilizadas.** Rodar a mesma análise duas
   vezes sem mudar documentação **não** reconsome API: o resultado anterior é
   reaproveitado (cache por fingerprint). Só reavalia quando a documentação
   muda ou quando você força.
3. **O sistema nunca inventa.** Se a Standard API/motor GRC estiver
   indisponível, você recebe um **erro explícito** (`GRC_ENGINE_UNAVAILABLE`,
   `[EVALUATION_ERROR]`), nunca um número fabricado. Resultado estimado (modo
   degradado, opt-in) vem sempre marcado `[ESTIMATED]` + `needs_review`.

---

## Fluxo principal (a ordem certa de operar)

```
1. Documents  →  2. Assessments  →  3. Gaps/POA&M  →  4. Goals  →  5. Reports
                     ↘ Threat Modeling (por versão de produto)
```

**Regra de ouro:** antes de qualquer análise, garanta que os documentos da
versão estão publicados e indexados. Análise sem corpus = gap generalizado.

---

## 1. Documents (Gestão de Documentos)

**Para que serve:** alimentar a fonte da verdade. Upload → Clarity Gate
(validação de qualidade por IA) → chunking → embeddings → índice RAG.

**O que você deve fazer:**
1. `Upload Document` → escolha a **categoria** correta:
   - `ISMS_CORE` = políticas/normas (fase "ISMS Policy" das avaliações);
   - `OPERATIONAL` = evidências de execução (fase "Operational Evidence");
   - `B2B_GEHC` / `B2B_DIRECT` = overlays contratuais por canal.
1b. Escolha o **tipo do documento** (POLICY, PROCEDURE, CONTRACT,
   CLOUD_ARCH_ORG, SAD, SRS_SDS, TEST_REPORT, EVIDENCE_RECORD): é ele que determina qual
   análise consome o documento — o checklist do threat modeling detecta
   SAD/SRS pelo **tipo**, não mais pelo nome do arquivo. Documentos antigos
   ficam `UNCLASSIFIED` até serem triados.
2. Se o documento é de uma **versão de produto** (SAD/SRS/SDS), associe a
   versão no passo "Application Scope". Isso alimenta a extração de **deltas**
   (features novas) que dirige o Threat Modeling.
3. Se o Clarity Gate reprovar (422): o documento tem baixa qualidade para RAG.
   Ou corrija o arquivo, ou use `forceIndex` **ciente** de que a busca pode
   retornar lixo.

**Efeito colateral importante:** todo upload/reindex de documento **invalida o
cache de avaliações** do escopo correspondente — a próxima análise reavalia de
verdade. É assim que "atualizei a documentação" vira "o score reflete a
mudança".

---

## 2. Assessments (Avaliação de Conformidade)

**Para que serve:** medir a postura frente a frameworks (ISO 27001, HIPAA,
SOC 2, …) cruzando os controles SCF com o corpus documental.

**Ao clicar `Run Assessment`, o que cada opção significa:**

| Opção | O que faz | Quando usar |
|---|---|---|
| **Quick Scan** | Similaridade semântica apenas (sem LLM). Rápido (~2 min). Status máximo: `partial`. | Triagem diária, verificação após upload |
| **Deep Scan** | Duas fases por controle (política ISMS + evidência operacional) com veredito da Standard API. | Preparação de auditoria, baseline oficial |
| **Sales Channel** | Inclui overlays contratuais do canal (GEHC/Direct) na busca de evidências | Quando a auditoria é do canal específico |
| **Force re-evaluation** | Ignora o cache persistido e reconsulta RAG + Standard API para **todos** os controles | Suspeita de resultado obsoleto; após mudança externa que o sistema não vê |

**Como ler o resultado:**
- `conforming` (verde) = política E evidência encontradas;
- `partial` (âmbar) = só política; `informal` (azul) = só evidência;
- `gap` (vermelho) = nada encontrado → vira item de remediação;
- `[EVALUATION_ERROR]` = a API externa falhou **naquele controle** — não é
  não-conformidade; re-rode ou investigue a API;
- `[ESTIMATED]` + `needs_review` = resultado do modo degradado (só existe se
  `GRC_LOCAL_FALLBACK_ENABLED=true`); trate como rascunho, não como veredito;
- `X reused from cache / Y freshly evaluated` = quanto a execução economizou
  de API. Segunda execução sem mudança de docs ⇒ ~100% cache.

**Depois do assessment:** abra a aba **Gaps** → para cada gap relevante, crie
**Goal** (remediação) ou item de **POA&M**. Esse é o "próximo passo" natural.

---

## 3. Threat Modeling (STRIDE + FMEA por versão)

**Para que serve:** avaliar a adequação de segurança **por versão do produto**,
variando a partir das **diferenças** (features novas extraídas dos documentos
da versão).

**Pré-requisitos (o modal mostra o checklist):** SAD e SRS/SDS da versão
publicados e associados a ela. Sem eles o modelo sai genérico — e a resposta
avisa em `limitations`.

**Como o reuso funciona:** o sistema calcula um *fingerprint* dos deltas
acumulados da versão. Se nada mudou desde a última análise para o mesmo
conjunto de frameworks, ele **devolve a análise persistida** (`cached: true`)
sem chamar o motor — o modal mostra "Analysis Reused". Para forçar: checkbox
"Force re-analysis" no passo de confirmação (ou `force_reevaluate: true` na API).

**Linhagem entre versões:**
1. Em Settings → Versions (ou via SQL, enquanto não há seletor), defina
   `previous_version_id` da versão nova apontando para a anterior.
2. **Aprove** o threat model da versão anterior (`status = approved`).
3. Gere o modelo da versão nova → threats vêm rotulados `inherited` (já
   existiam na baseline) vs `is_new` (novos desta versão). Revise os novos.

**Sem histórico ainda?** Importe uma análise existente como baseline:
`POST /api/threat-modeling/seed` (admin/ionic_user) com o JSON do modelo —
fica `source: 'manual_seed'`, não chama o motor, não inventa nada.

**Se der `502 GRC_ENGINE_UNAVAILABLE`:** o motor externo está fora — o gap é
para ser resolvido lá (ihos-api/Standard). O ihOS não vai fabricar ameaças.

---

## 4. Gaps → Goals → POA&M (Remediação)

**Para que serve:** transformar achado em trabalho rastreável.
- **Gap** (saída do assessment) → mostra fase faltante e ação recomendada.
- **Goal** = projeto de remediação com tarefas e % de progresso.
- **POA&M** = registro formal exigido por auditores
  (`open → in_progress → closed / risk_accepted`; `risk_accepted` expira e
  exige re-análise).

**O que fazer:** após cada Deep Scan, triagem dos gaps: crie Goal para o que
será corrigido; POA&M com `risk_accepted` + prazo para o que for aceito.

## 5. Reports

Gera PDF/Excel por framework a partir do último assessment — é o artefato de
submissão, não um screenshot do dashboard. Rode **depois** de um Deep Scan.

## 6. Compliance Intelligence (dashboard executivo)

Scorecard em tempo real, cobertura de evidências, tabela de gaps e trilha ROI
("quais controles implementar primeiro para maximizar cobertura"). Consome os
snapshots gerados pelos assessments — sem assessment recente, está desatualizado.

## 7. Demais módulos (visão geral)

| Módulo | Função | Ação típica |
|---|---|---|
| **Chat** | Perguntas ad-hoc com RAG + agentes (ReAct); auto-resposta de questionários (XLSX/CSV/PDF) | Dúvida pontual; preencher questionário de cliente |
| **GRC Mapping** | Navegar mapeamentos SCF ↔ 231 frameworks; sync com a Standard API | "A.8.1 da ISO cobre o quê no SOC 2?" |
| **SCRMS (MSR)** | Baselines MCR/DSR com escopo PPTDF por versão | Gestão de requisitos mínimos de segurança |
| **Knowledge Base** | Saúde do corpus RAG (docs, chunks, cobertura) | Verificar antes de auditoria |
| **Settings → Versions** | Catálogo de versões do produto; `previous_version_id` (baseline de threat) | Criar versão nova antes de subir docs dela |
| **Admin → Users** | Aprovação de cadastros + RBAC (admin / ionic_user / client_user) | Aprovar novos usuários |

---

## 8. Variáveis de ambiente que mudam comportamento (operador)

| Variável | Efeito | Recomendação |
|---|---|---|
| `STANDARD_GRC_API_URL` | Base da Standard API — **precisa terminar em `/api/v1`** | `https://standard-api.bekaa.eu/api/v1` |
| `STANDARD_GRC_TENANT_ID` | `org_xxxxx`; obrigatório p/ `evaluate-evidence` e `council` | Sempre setar |
| `GRC_LOCAL_FALLBACK_ENABLED` | **Opt-in** do modo degradado (estimativas locais marcadas) | **Unset em produção** (fail-closed) |
| `CRON_SECRET` | Protege endpoints de cron | Obrigatório em produção |

Validação completa de ambiente + banco: `docs/RUNBOOK_analysis_flow_validation.md`.

---

## 9. Erros que você pode ver e o que significam

| Mensagem | Significado | O que fazer |
|---|---|---|
| `GRC_ENGINE_UNAVAILABLE` (502) | Motor de threat externo fora | Verificar ihos-api; nada a "corrigir" no ihOS |
| `[EVALUATION_ERROR]` num controle | Standard API falhou naquele controle após retries | Re-rodar; se persistir, checar credenciais/status da API |
| `TENANT_CONTEXT_REQUIRED` (400) | `STANDARD_GRC_TENANT_ID` ausente | Configurar a env |
| `[ESTIMATED]` em auditor_notes | Resultado do fallback local (degradado) | Revisar manualmente; considerar desligar o fallback |
| Clarity Gate 422 | Documento reprovado na validação de qualidade | Melhorar o documento ou `forceIndex` consciente |
| `cached: true` (threat) | Nada mudou na versão desde a última análise | Normal — use `force_reevaluate` se precisar regerar |
