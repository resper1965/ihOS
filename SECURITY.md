# 🔒 Política de Segurança — ihOS

## Versões Suportadas

| Versão | Suporte          |
| ------ | ---------------- |
| 0.x.x  | ✅ Suporte ativo |

À medida que o projeto evoluir, esta tabela será atualizada com o ciclo de suporte de cada release.

---

## Reportando uma Vulnerabilidade

A Ionic Health leva a segurança do ihOS a sério. Agradecemos a divulgação responsável de vulnerabilidades.

### ⚠️ NÃO abra issues públicas para vulnerabilidades de segurança

Se você descobrir uma vulnerabilidade de segurança, por favor siga o processo abaixo:

### 1. Contato

Envie um e-mail para **[security@ionichealth.com](mailto:security@ionichealth.com)** com as seguintes informações:

- **Tipo de vulnerabilidade** (ex: XSS, SQL Injection, IDOR, etc.)
- **Componente afetado** (ex: API de chat, autenticação, etc.)
- **Passos para reproduzir** o problema
- **Impacto potencial** da exploração
- **Sugestão de correção** (se aplicável)
- **Severidade estimada** (Crítica, Alta, Média, Baixa)

### 2. Processo de Resposta

| Etapa                      | SLA              |
| -------------------------- | ---------------- |
| Confirmação de recebimento | Até 48 horas     |
| Triagem e avaliação        | Até 5 dias úteis |
| Correção implementada      | Depende da severidade |
| Notificação ao reporter    | Após deploy da correção |

### 3. Severidade e Prioridade

| Severidade  | Descrição                                          | SLA de Correção |
| ----------- | -------------------------------------------------- | --------------- |
| **Crítica** | Acesso não autorizado a dados, RCE, bypass de auth | 24-72 horas     |
| **Alta**    | Escalação de privilégios, vazamento de dados PII   | 1 semana        |
| **Média**   | XSS stored, CSRF, information disclosure           | 2 semanas       |
| **Baixa**   | XSS reflected, headers ausentes, best practices    | Próxima release |

### 4. O Que Esperamos

- **Divulgação responsável** — Dê-nos tempo razoável para corrigir antes de divulgar publicamente
- **Boa fé** — Não acesse, modifique ou destrua dados de outros usuários
- **Escopo** — Teste apenas em ambientes de desenvolvimento/staging, nunca em produção

### 5. O Que Oferecemos

- **Reconhecimento público** no `SECURITY.md` (Hall of Fame) se desejar
- **Comunicação transparente** sobre o status da correção
- **Compromisso de não ação legal** contra pesquisadores que seguirem esta política

---

## Práticas de Segurança do Projeto

O ihOS segue as melhores práticas de SSDLC:

- ✅ Análise estática de segurança (SAST) no CI/CD
- ✅ Verificação de dependências (`npm audit`)
- ✅ Detecção de secrets no código (TruffleHog)
- ✅ Code review obrigatório para todas as PRs
- ✅ CODEOWNERS para arquivos sensíveis
- ✅ Environment variables nunca commitadas
- ✅ RBAC com princípio de menor privilégio
- ✅ Input validation e sanitização em todas as APIs

---

## Hall of Fame 🏆

Agradecemos aos pesquisadores de segurança que contribuíram para tornar o ihOS mais seguro:

_Nenhuma submissão até o momento. Seja o primeiro!_

---

## Riscos aceitos

Vulnerabilidades conhecidas que a Ionic decidiu conviver, com a razão e a
mitigação. Um risco aceito sem mitigação guardada vira risco esquecido, então
cada entrada aponta o teste que impede a mitigação de sumir sozinha.

### `xlsx` (SheetJS) — ReDoS e prototype pollution

**Decidido em 2026-09-09.** Duas advisories abertas: ReDoS
([GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9),
corrigida em 0.20.2) e prototype pollution (corrigida em 0.19.3). O projeto usa
`xlsx@0.18.5`.

**Não há correção no npm.** O SheetJS deixou o registro depois da 0.18.5; a
linha corrigida existe apenas no CDN do fornecedor. Instalar de lá tira a
dependência do registro npm, da cobertura do `npm audit` e da procedência que
ele oferece — uma troca de cadeia de suprimento que o projeto optou por não
fazer.

**Exposição.** *Corrigida em 2026-09-10: a descrição anterior subestimava o
alcance.* Ela dizia que três das quatro utilizações apenas escreviam planilha e
que só uma lia arquivo de terceiro. Medido no código, `XLSX.read` é chamado em
**três** lugares, e **dois** deles recebem arquivo enviado pelo chamador:

| onde | o que faz | entrada |
|---|---|---|
| `POST /api/chat/parse-questionnaire` (via `src/lib/chat/parser.ts`) | lê | questionário enviado por um cliente |
| `POST /api/chat/download-filled` | lê e reescreve | planilha original em base64, **no corpo da requisição** |
| `scripts/import-soa.ts` | lê | arquivo do nosso próprio bucket, rodado por operador |
| exportação de threat model, de relatório e de questionário | só escrevem | nenhuma |

O `download-filled` é o que faltava: ele decodifica `originalFileBase64` do
corpo e passa direto para `XLSX.read`. É entrada controlada pelo chamador, como
a outra rota — a diferença é que ninguém tinha notado.

**Mitigação.** As duas rotas exigem sessão autenticada e devolvem 401 sem ela
(`parse-questionnaire/route.ts`, `download-filled/route.ts:17-22`). O cenário
residual continua sendo um usuário já autenticado enviando arquivo malicioso —
não um anônimo. O `import-soa.ts` não é rota: roda por operador, sobre arquivo
que já está no nosso bucket.

**Guarda.** `tests/api/questionnaire.test.ts`, dois casos:
*"returns 401 when unauthenticated"* e
*"refuses an unauthenticated caller before parsing the uploaded workbook"*. O
segundo foi escrito em 2026-09-10, junto com esta correção — até então a trava
do `download-filled` não era guardada por nada, que é exatamente o
"risco aceito cuja mitigação não é guardada" contra o qual esta seção adverte.
Ambos foram verificados por mutação: removendo o gate, a suíte quebra.

**Revisão.** Reavaliar se o SheetJS voltar ao npm, se surgir advisory explorável
sem autenticação, ou se a rota deixar de ser autenticada.

---

## Contato

📧 **security@ionichealth.com**

Para questões não relacionadas a segurança, abra uma [issue](https://github.com/resper1965/ihOS/issues).
