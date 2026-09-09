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

**Exposição.** Das quatro utilizações de `xlsx` no código, três apenas
*escrevem* planilha (exportação de threat model, de relatório de conformidade e
de questionário preenchido) e não tocam entrada externa. A única que *lê*
arquivo de terceiro é `POST /api/chat/parse-questionnaire`, que recebe o
questionário enviado por um cliente.

**Mitigação.** Essa rota exige sessão autenticada e devolve 401 sem ela
(`src/app/api/chat/parse-questionnaire/route.ts`). O cenário residual é um
usuário já autenticado enviando um arquivo malicioso — não um anônimo.

**Guarda.** `tests/api/questionnaire.test.ts`, caso
*"returns 401 when unauthenticated"*. Se alguém remover o gate, a suíte quebra.

**Revisão.** Reavaliar se o SheetJS voltar ao npm, se surgir advisory explorável
sem autenticação, ou se a rota deixar de ser autenticada.

---

## Contato

📧 **security@ionichealth.com**

Para questões não relacionadas a segurança, abra uma [issue](https://github.com/resper1965/ihOS/issues).
