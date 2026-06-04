# 🤝 Guia de Contribuição — ihOS

Obrigado pelo interesse em contribuir com o ihOS! Este guia descreve nosso processo de desenvolvimento, padrões de código e workflow de colaboração.

---

## 📋 Índice

- [Código de Conduta](#código-de-conduta)
- [Como Contribuir](#como-contribuir)
- [Configuração do Ambiente](#configuração-do-ambiente)
- [Convenção de Branches](#convenção-de-branches)
- [Convenção de Commits](#convenção-de-commits)
- [Processo de Pull Request](#processo-de-pull-request)
- [Code Review Checklist](#code-review-checklist)
- [Considerações de Segurança](#considerações-de-segurança)
- [Padrões de Código](#padrões-de-código)

---

## Código de Conduta

Esperamos que todos os contribuidores mantenham um ambiente respeitoso e colaborativo. Comportamentos abusivos, discriminatórios ou assediantes não serão tolerados.

---

## Como Contribuir

### Reportar Bugs

1. Verifique se o bug já não foi reportado nas [issues](https://github.com/resper1965/ihOS/issues)
2. Use o template de **Bug Report** ao criar uma nova issue
3. Inclua passos detalhados para reproduzir o problema

### Sugerir Features

1. Verifique se a feature já não foi sugerida nas [issues](https://github.com/resper1965/ihOS/issues)
2. Use o template de **Feature Request** ao criar uma nova issue
3. Descreva claramente o problema que a feature resolve

### Corrigir Bugs ou Implementar Features

1. Comente na issue que deseja trabalhar nela
2. Aguarde a atribuição da issue a você
3. Siga o workflow descrito abaixo

---

## Configuração do Ambiente

```bash
# Clone o repositório
git clone https://github.com/resper1965/ihOS.git
cd ihOS

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais

# Inicie o servidor de desenvolvimento
npm run dev
```

---

## Convenção de Branches

Utilize o seguinte padrão de nomenclatura:

| Prefixo       | Uso                                    | Exemplo                            |
| ------------- | -------------------------------------- | ---------------------------------- |
| `feat/`       | Nova funcionalidade                     | `feat/chat-streaming`              |
| `fix/`        | Correção de bug                        | `fix/auth-redirect-loop`           |
| `security/`   | Correção de segurança                  | `security/sanitize-chat-input`     |
| `docs/`       | Documentação                           | `docs/api-endpoints`               |
| `refactor/`   | Refatoração sem mudança de comportamento | `refactor/agent-tools-structure`  |
| `test/`       | Adição ou correção de testes           | `test/assessment-api-coverage`     |
| `chore/`      | Tarefas de manutenção                  | `chore/update-dependencies`        |

### Regras

- Sempre crie branches a partir de `main` atualizado
- Use letras minúsculas e hífens (kebab-case)
- Mantenha os nomes curtos e descritivos

```bash
git checkout main
git pull origin main
git checkout -b feat/minha-feature
```

---

## Convenção de Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
<tipo>(<escopo>): <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos Permitidos

| Tipo         | Descrição                                       |
| ------------ | ----------------------------------------------- |
| `feat`       | Nova funcionalidade                              |
| `fix`        | Correção de bug                                 |
| `docs`       | Alteração na documentação                        |
| `style`      | Formatação (sem mudança de lógica)               |
| `refactor`   | Refatoração de código                            |
| `test`       | Adição ou correção de testes                     |
| `chore`      | Manutenção, dependências, CI/CD                  |
| `security`   | Correção de vulnerabilidade de segurança         |
| `perf`       | Melhoria de performance                          |

### Exemplos

```bash
feat(chat): adicionar streaming de respostas do agente
fix(auth): corrigir loop de redirect no login
security(api): sanitizar input do endpoint de assessments
docs(readme): atualizar instruções de instalação
test(agents): adicionar testes unitários para tool de controles
```

### Breaking Changes

Para mudanças que quebram compatibilidade, adicione `!` após o tipo:

```bash
feat(api)!: alterar formato de resposta do endpoint de relatórios
```

---

## Processo de Pull Request

### 1. Antes de Abrir o PR

- [ ] O código compila sem erros (`npm run build`)
- [ ] Lint passa sem warnings (`npm run lint`)
- [ ] TypeCheck passa (`npm run typecheck`)
- [ ] Testes existentes passam (`npm run test`)
- [ ] Novos testes foram adicionados (se aplicável)

### 2. Ao Abrir o PR

- Use o **template de PR** disponível
- Vincule a issue relacionada com `Closes #123`
- Preencha todas as seções do template
- Solicite review de pelo menos 1 pessoa

### 3. Após o Review

- Responda a todos os comentários
- Faça as correções solicitadas em novos commits
- Não force-push durante o review (para preservar histórico de discussão)
- Após aprovação, faça squash merge se necessário

---

## Code Review Checklist

Ao revisar PRs, verifique:

### Funcionalidade
- [ ] O código faz o que se propõe?
- [ ] Edge cases foram tratados?
- [ ] Não há regressões?

### Qualidade
- [ ] O código segue os padrões do projeto?
- [ ] Nomes de variáveis e funções são claros?
- [ ] Não há duplicação desnecessária?
- [ ] Complexidade está adequada?

### Segurança 🔒
- [ ] Inputs são validados e sanitizados?
- [ ] Não há secrets ou credenciais hardcoded?
- [ ] Autenticação e autorização estão corretas?
- [ ] Dados sensíveis estão protegidos?
- [ ] Queries SQL/ORM estão protegidas contra injection?

### Testes
- [ ] Testes unitários cobrem o código novo?
- [ ] Testes de integração para APIs?
- [ ] Cenários de erro são testados?

---

## Considerações de Segurança

> ⚠️ **Segurança é responsabilidade de todos os contribuidores.**

### Obrigatório

1. **NUNCA** commite secrets, API keys ou credenciais
2. **SEMPRE** valide e sanitize inputs do usuário
3. **SEMPRE** use parameterized queries (nunca concatene SQL)
4. **SEMPRE** verifique autorização em API routes
5. **SEMPRE** use HTTPS para chamadas externas

### Verificações Automáticas

O CI/CD verifica automaticamente:
- `npm audit` — vulnerabilidades em dependências
- Detecção de secrets no código
- Análise estática de segurança

### Reportar Vulnerabilidades

Se encontrar uma vulnerabilidade, **NÃO abra uma issue pública**. Siga nossa [Política de Segurança](./SECURITY.md).

---

## Padrões de Código

### TypeScript

- Strict mode habilitado
- Sem `any` — use tipos explícitos
- Prefira `interface` sobre `type` para objetos
- Use `const` assertions quando possível

### React / Next.js

- Server Components por padrão
- Client Components apenas quando necessário (`'use client'`)
- Coloque lógica de dados em Server Components
- Use o App Router patterns

### Testes

- Testes unitários com Vitest
- Nomenclatura: `*.test.ts` ou `*.test.tsx`
- AAA pattern: Arrange, Act, Assert
- Mocking apenas quando necessário

### CSS

- Tailwind CSS utility-first
- Evite CSS customizado quando possível
- Design tokens via variáveis Tailwind

---

## Dúvidas?

Abra uma [issue](https://github.com/resper1965/ihOS/issues) com o label `question` ou entre em contato com os maintainers.

Obrigado por contribuir com o ihOS! 🚀
