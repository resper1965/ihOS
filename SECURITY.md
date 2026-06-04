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

## Contato

📧 **security@ionichealth.com**

Para questões não relacionadas a segurança, abra uma [issue](https://github.com/resper1965/ihOS/issues).
