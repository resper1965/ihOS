<div align="center">

# 🛡️ ihOS — Ionic Health OS

**Ionic Compliance Intelligence Platform**

Plataforma multi-framework de GRC com inteligência artificial agentic para compliance automatizado.

[![CI/CD](https://github.com/resper1965/ihOS/actions/workflows/ci.yml/badge.svg)](https://github.com/resper1965/ihOS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Security Policy](https://img.shields.io/badge/Security-Policy-red.svg)](./SECURITY.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

</div>

---

## 📋 Sobre o Projeto

O **ihOS** é uma plataforma de Compliance Intelligence que responde a qualquer framework de compliance (ISO 27001, SOC 2, HIPAA, LGPD, GDPR, TX-RAMP, entre outros) consumindo o **Standard GRC Engine API** — com 1.468 controles SCF, 231 frameworks e 10 endpoints de IA.

### Principais Funcionalidades

- 🤖 **Chat Agentic** — Assistente de compliance com ReAct loops via Vercel AI SDK
- 📊 **Assessments Automatizados** — Avaliação de conformidade por framework
- 📄 **Relatórios Inteligentes** — Geração automática de relatórios de gap analysis
- 🔐 **RBAC** — Controle de acesso por roles: `admin`, `ionic_user`, `client_user`
- 🧠 **RAG** — Retrieval-Augmented Generation com pgvector para documentos normativos
- 🔄 **Progressive Agentic** — De chatbot a agente autônomo em estágios progressivos

---

## 🛠️ Tech Stack

| Camada          | Tecnologia                                      |
| --------------- | ------------------------------------------------ |
| **Framework**   | Next.js 16 (App Router)                          |
| **Linguagem**   | TypeScript 5.x (strict mode)                     |
| **Estilização** | Tailwind CSS 4                                   |
| **Auth & DB**   | Supabase (Auth, PostgreSQL, pgvector, Storage)   |
| **AI/LLM**      | Vercel AI SDK, OpenAI GPT-4o                     |
| **GRC Engine**  | Standard GRC Engine API (SCF 1.468 controles)    |
| **Testes**      | Vitest (unit), Playwright (E2E)                  |
| **CI/CD**       | GitHub Actions                                   |
| **Deploy**      | Vercel                                           |
| **Linting**     | ESLint 9, Prettier                               |

---

## 🚀 Getting Started

### Pré-requisitos

- **Node.js** >= 20.x
- **npm** >= 10.x (ou pnpm/yarn)
- **Conta Supabase** com projeto configurado
- **Chave OpenAI** (API key)
- **Acesso ao Standard GRC Engine API**

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/resper1965/ihOS.git
cd ihOS

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env.local

# 4. Preencha as variáveis em .env.local (veja seção abaixo)

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

### Variáveis de Ambiente

Copie `.env.example` para `.env.local` e configure:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-openai-key

# Standard GRC Engine
# NOTE: the base URL MUST include the /api/v1 path segment — the client sends
# paths without it, so a missing segment 404s every call.
STANDARD_GRC_API_URL=https://standard-api.bekaa.eu/api/v1
STANDARD_GRC_API_KEY=standard_live_your-grc-api-key   # prefix: standard_live_ (or standard_test_)
STANDARD_GRC_TENANT_ID=org_your-org-id                # REQUIRED (x-standard-tenant-id) for data-scoped endpoints

# Standard GRC Engine — local resiliency fallback (OPT-IN, default OFF).
# When the authoritative GRC API is unreachable/denies scope, ihOS by default
# surfaces a GAP/ERROR rather than estimating (Constitution Principle VIII).
# Set to "true" ONLY to accept degraded, non-authoritative estimated results
# (each flagged is_estimated=true and marked needs_review). Keep unset in prod.
GRC_LOCAL_FALLBACK_ENABLED=false

# Vercel AI
VERCEL_AI_GATEWAY_URL=https://gateway.ai.vercel.com/v1

# DefectDojo (optional) — analytical posture axis ("observed moment").
# When set, the daily cron /api/cron/defectdojo-sync pulls active findings,
# maps them onto SCF controls via scf_framework_mappings, and feeds the
# runtime_control_signals table (observed posture: violated/degraded/clean,
# shown ALONGSIDE the documental verdict, never replacing it).
DEFECTDOJO_URL=https://defectdojo.example.com
DEFECTDOJO_API_KEY=your-dd-api-token
# Fallback product when defectdojo_product_links has no rows. Prefer linking
# products to product versions via the defectdojo_product_links table.
DEFECTDOJO_PRODUCT_ID=1

# MCP posture surface (optional) — read-only JSON-RPC endpoint at /api/mcp
# for external agents (get_posture, list_gaps, get_threat_posture).
# Disabled (503) until a service token of at least 32 chars is set.
# Every call is audited in mcp_audit_log with the token's SHA-256 fingerprint.
MCP_SERVICE_TOKEN=generate-a-random-token-of-32-plus-chars
```

### Scripts Disponíveis

```bash
npm run dev        # Servidor de desenvolvimento
npm run build      # Build de produção
npm run start      # Servidor de produção
npm run lint       # Linting com ESLint
npm run typecheck  # Verificação de tipos
npm run test       # Testes unitários (Vitest)
npm run test:e2e   # Testes E2E (Playwright)
```

---

## 🏗️ Arquitetura

O ihOS segue a documentação de arquitetura **arc42**. Veja a documentação completa em [`docs/architecture/`](./docs/architecture/).

### Estrutura do Projeto

```
ihOS/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Rotas de autenticação
│   │   ├── (dashboard)/        # Rotas do dashboard (13 módulos)
│   │   │   ├── assessments/    # Assessment Engine
│   │   │   ├── chat/           # Agentic Chat
│   │   │   ├── compliance/     # Compliance Intelligence + SCRMS + Mappings
│   │   │   ├── documents/      # Document Management + Clarity Gate
│   │   │   ├── goals/          # Remediation Goals & Tasks
│   │   │   ├── knowledge-base/ # RAG Health Dashboard
│   │   │   ├── reports/        # Report Generation
│   │   │   ├── settings/       # Settings + Product Versions
│   │   │   ├── threat-modeling/ # STRIDE + FMEA Analysis
│   │   │   └── admin/          # User Administration
│   │   └── api/                # 12 API Route Groups
│   ├── lib/                    # Lógica de negócio
│   │   ├── agents/tools/       # Ferramentas do agente AI (14 tools)
│   │   ├── assessment/         # Assessment engine + framework-registry + persistence
│   │   ├── chat/               # Chat, RAG search, embeddings
│   │   ├── standard-api/       # Client do Standard GRC Engine API
│   │   ├── ihos-engine/        # ihOS Engine client
│   │   ├── supabase/           # DB clients + types (generated + custom)
│   │   ├── data/               # Server-side data fetchers
│   │   └── context/            # React context providers
│   ├── hooks/
│   │   └── queries/            # React Query hooks (TanStack)
│   └── components/             # 40+ Componentes React
│       ├── assessments/        # RunAssessmentModal, EvidenceTable
│       ├── chat/               # ChatPanel, ConversationList, AgentStatus
│       ├── dashboard/          # 14 dashboard widgets
│       ├── documents/          # UploadWizard, ClarityReport
│       ├── onboarding/         # OnboardingGate, OnboardingWizard
│       ├── risk/               # STRIDE, FMEA, RiskMatrix, ReviewPanel
│       └── ui/                 # Button, Badge, Progress, Card, Dialog
├── supabase/migrations/        # 34 migrações do banco de dados
├── tests/                      # Testes
│   ├── unit/assessment/        # Testes unitários (framework-registry, persistence, engine)
│   ├── e2e/                    # Testes E2E (Playwright)
│   └── setup.ts                # Test setup
├── docs/architecture/          # Documentação arc42 + ADRs
└── .specify/memory/            # Spec Kit artifacts (constitution, spec, plan, tasks, checklist)
```

### Architecture Decision Records (ADRs)

Decisões arquiteturais são registradas em [`docs/architecture/adrs/`](./docs/architecture/adrs/). Consulte o [template](./docs/architecture/adrs/template.md) para criar novos ADRs.

---

## 🤝 Contribuindo

Leia o [Guia de Contribuição](./CONTRIBUTING.md) para entender nosso processo de desenvolvimento, padrões de código e workflow de PRs.

---

## 🔒 Segurança

Para reportar vulnerabilidades de segurança, **NÃO abra uma issue pública**. Siga nossa [Política de Segurança](./SECURITY.md) para divulgação responsável.

---

## 📄 Licença

Este projeto está licenciado sob a [Licença MIT](./LICENSE).

Copyright © 2026 [Ionic Health](https://ionichealth.com). Todos os direitos reservados.
