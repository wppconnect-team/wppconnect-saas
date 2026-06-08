# WPPConnect Team

## _WPPConnect SaaS_

## Our online channels

[![Discord](https://img.shields.io/discord/844351092758413353?color=blueviolet&label=Discord&logo=discord&style=flat)](https://discord.gg/JU5JGGKGNG)
[![Telegram Group](https://img.shields.io/badge/Telegram-Group-32AFED?logo=telegram)](https://t.me/wppconnect)
[![WhatsApp Group](https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp)](https://chat.whatsapp.com/LJaQu5ZyNvnBPNAVRbX00K)
[![YouTube](https://img.shields.io/youtube/channel/subscribers/UCD7J9LG08PmGQrF5IS7Yv9A?label=YouTube)](https://www.youtube.com/c/wppconnect)

---

Plataforma **multi-tenant SaaS** para gerenciamento de sessões WhatsApp. Cada empresa tem um workspace isolado com sessões, contatos, webhooks, tokens e logs próprios. Times compartilham o mesmo workspace com controle de acesso por papel (admin / editor / viewer).

## Stack

| Camada   | Tecnologia                            |
|----------|---------------------------------------|
| Frontend | React 19 + Vite 8                     |
| Backend  | Elysia + Bun + TypeScript             |
| Database | PostgreSQL 16                         |
| Auth     | JWT via HttpOnly cookie + pgcrypto    |
| Email    | Nodemailer (SMTP configurável)        |
| Deploy   | Docker Compose + Nginx                |

## Funcionalidades

**Sessões & mensagens**
- Gerenciamento de sessões WhatsApp (conectar, desconectar, QR code, pairing code)
- Modal de configuração de sessão (nome, tag, telefone, webhook, proxy)
- Envio em massa para contatos e grupos via API WppConnect

**Workspace & multi-tenancy**
- Cada empresa cria seu próprio workspace isolado no cadastro
- Dados completamente separados por workspace (sessões, contatos, webhooks, logs, grupos)
- Convite de membros com senha temporária e troca obrigatória no primeiro acesso
- Papéis de acesso: **admin**, **editor**, **viewer**

**Planos & billing**
- Visão geral do plano com contadores de uso em tempo real (sessões, mensagens, membros)
- Modal de upgrade com seletor de ciclo mensal / anual
- Modal de gerenciamento de assinatura com edição de cartão e cancelamento

**Produtividade**
- Dashboard com métricas, gráfico de barras e seletor de período (24h / 7d / 30d)
- Logs em tempo real via SSE streaming
- Webhooks com proteção SSRF e monitoramento de taxa de entrega
- Tokens de API com SHA-256 e controle de escopos
- Contatos e grupos com busca, tags e filtros de status

**Autenticação**
- Login com rate limiting (5 tentativas por IP a cada 15 min)
- Redefinição de senha via e-mail com token de 30 minutos
- Turnstile (Cloudflare) configurável na tela de login
- Headers de segurança globais (CSP, HSTS, X-Frame-Options…)

---

## Primeiro acesso

Na primeira inicialização com o banco vazio, o backend **cria automaticamente** um workspace e um usuário admin temporário, exibindo as credenciais no log do container:

```
════════════════════════════════════════════════════════
  PRIMEIRO ACESSO — CREDENCIAIS TEMPORÁRIAS
════════════════════════════════════════════════════════
  Email : admin@localhost
  Senha : Xk7#mP2qTvRn9wBj
════════════════════════════════════════════════════════
  Troque a senha imediatamente após o primeiro login.
  Para personalizar o email: defina ADMIN_EMAIL no .env
════════════════════════════════════════════════════════
```

> A senha temporária é exibida **apenas no terminal** — nunca gravada em banco de dados ou logs da aplicação.

Para criar novos workspaces independentes, use o formulário **"Criar workspace"** na tela de login — cada cadastro gera um workspace próprio isolado.

---

## Desenvolvimento local

### Pré-requisitos

- [Bun](https://bun.sh) >= 1.1
- [Docker](https://www.docker.com) + Docker Compose

### 1. Banco de dados

```bash
docker compose up db -d
```

O Postgres inicializa com a migration `001_init.sql`. As migrations seguintes precisam ser aplicadas manualmente na primeira execução:

```bash
for f in backend/migrations/00{2..9}*.sql backend/migrations/01*.sql; do
  docker cp "$f" wppconnect-db:/tmp/
  docker exec wppconnect-db psql -U wppconnect -d wppconnect -f "/tmp/$(basename $f)"
done
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # ajuste as variáveis
bun install
bun run dev            # hot-reload em http://localhost:3000
```

Swagger disponível em `http://localhost:3000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

O proxy Vite redireciona `/api/*` → `http://localhost:3000` automaticamente.

---

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável               | Descrição                                                         | Obrigatório |
|------------------------|-------------------------------------------------------------------|-------------|
| `DATABASE_URL`         | String de conexão PostgreSQL                                      | ✓           |
| `JWT_SECRET`           | Chave para assinar tokens JWT (mínimo 32 caracteres)              | ✓           |
| `WPP_SECRET_KEY`       | Token secreto do servidor WppConnect                              | ✓           |
| `PORT`                 | Porta do servidor                                                 | padrão 3000 |
| `FRONTEND_URL`         | Origem permitida pelo CORS                                        | padrão `http://localhost:5173` |
| `NODE_ENV`             | `development` ou `production`                                     | —           |
| `ADMIN_EMAIL`          | E-mail do admin criado no primeiro boot                           | padrão `admin@localhost` |
| `WPP_SERVER`           | URL base do servidor WppConnect                                   | padrão `http://localhost:21465/api` |
| `TURNSTILE_SECRET_KEY` | Chave secreta do Cloudflare Turnstile (vazio = desativado)        | —           |
| `SMTP_HOST`            | Servidor SMTP para envio de e-mails                               | —           |
| `SMTP_PORT`            | Porta SMTP (587 = STARTTLS, 465 = SSL)                            | padrão 587  |
| `SMTP_USER`            | Usuário SMTP                                                      | —           |
| `SMTP_PASS`            | Senha SMTP                                                        | —           |
| `SMTP_FROM`            | Endereço remetente dos e-mails                                    | —           |

> **Sem SMTP configurado:** o link de redefinição de senha é exibido no log do container (`stdout`), visível via `docker logs wppconnect-api`.

### Frontend (`frontend/.env`)

| Variável                  | Descrição                                                     | Padrão                       |
|---------------------------|---------------------------------------------------------------|------------------------------|
| `VITE_WPP_SERVER`         | URL do servidor WppConnect para envio de mensagens            | `http://localhost:21465/api` |
| `VITE_WPP_SOCKET`         | URL WebSocket do servidor WppConnect                          | `http://localhost:21465`     |
| `VITE_TURNSTILE_SITE_KEY` | Site key do Cloudflare Turnstile (vazio = widget desativado)  | —                            |
| `VITE_DEMO_MODE`          | Habilita botões SSO simulados na tela de login                | —                            |

---

## Deploy com Docker

### Stack completa

```bash
# Na raiz do projeto
cp backend/.env.example backend/.env
# Edite backend/.env com JWT_SECRET, DB_PASSWORD e WPP_SECRET_KEY

docker compose up -d --build
```

O frontend fica disponível na porta `80`. O Nginx faz proxy de `/api/*` para o backend internamente.

### Containers

| Container            | Função                          |
|----------------------|---------------------------------|
| `wppconnect-frontend`| Nginx + React (build estático)  |
| `wppconnect-api`     | Bun + Elysia (API REST)         |
| `wppconnect-db`      | PostgreSQL 16                   |

Comandos úteis:

```bash
# Logs da API em tempo real
docker logs wppconnect-api -f

# Acessar o banco diretamente
docker exec -it wppconnect-db psql -U wppconnect -d wppconnect

# Aplicar uma migration manualmente
docker exec -i wppconnect-db psql -U wppconnect -d wppconnect < backend/migrations/011_password_reset.sql

# Rebuild apenas da API (após mudanças no backend)
docker compose build api && docker compose up -d api
```

### Variáveis obrigatórias em produção

- `JWT_SECRET` — string aleatória longa (mínimo 32 caracteres). O compose lança erro se não estiver definida.
- `WPP_SECRET_KEY` — token do servidor WppConnect. O compose lança erro se não estiver definida.
- `DB_PASSWORD` — senha do PostgreSQL (`secret` é apenas para desenvolvimento local).

---

## Migrations

As migrations são aplicadas automaticamente pelo Postgres no **primeiro boot** (volume `pg_data` vazio). Em volumes existentes, aplique manualmente:

| Arquivo                           | Descrição                                            |
|-----------------------------------|------------------------------------------------------|
| `001_init.sql`                    | Schema inicial + dados de demonstração               |
| `002_add_session_token.sql`       | Token WppConnect na tabela sessions                  |
| `003_add_webhook_proxy.sql`       | Suporte a proxy nos webhooks                         |
| `004_add_user_id.sql`             | Isolamento de dados por user_id                      |
| `005_user_preferences_qr_cache.sql` | Preferências de UI e cache do QR code              |
| `006_groups.sql`                  | Tabela de grupos WhatsApp                            |
| `007_members.sql`                 | Colunas role e member_status                         |
| `008_must_change_password.sql`    | Flag de troca obrigatória de senha                   |
| `009_plan_columns.sql`            | Colunas de plano e billing                           |
| `010_workspaces.sql`              | Tabela workspaces + migração para workspace_id       |
| `011_password_reset.sql`          | Colunas reset_token e reset_token_expires            |

---

## Estrutura do projeto

```
wppconnect/
├── docker-compose.yaml              # Stack completa (prod)
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Entrypoint Elysia
│   │   ├── db.ts                    # Conexão PostgreSQL (postgres.js)
│   │   ├── plugins/
│   │   │   ├── auth.ts              # JWT middleware — extrai userId e workspaceId
│   │   │   ├── security.ts          # Headers de segurança globais
│   │   │   └── rateLimit.ts         # Rate limiter em memória
│   │   ├── lib/
│   │   │   ├── log.ts               # insertLog — grava logs no banco
│   │   │   ├── mailer.ts            # Envio de e-mail via SMTP (Nodemailer)
│   │   │   └── setup.ts             # Auto-criação de workspace + admin no primeiro boot
│   │   └── routes/
│   │       ├── auth.ts              # Login, logout, register, me, forgot/reset password
│   │       ├── sessions.ts          # CRUD de sessões WhatsApp
│   │       ├── contacts.ts          # CRUD de contatos
│   │       ├── groups.ts            # CRUD de grupos
│   │       ├── webhooks.ts          # CRUD de webhooks (com proteção SSRF)
│   │       ├── tokens.ts            # CRUD de tokens de API
│   │       ├── members.ts           # Membros do workspace (convite, papéis, remoção)
│   │       ├── plan.ts              # Plano e billing do workspace
│   │       ├── logs.ts              # Consulta de logs + SSE /stream
│   │       └── dashboard.ts         # Métricas agregadas com filtro de período
│   ├── migrations/                  # SQLs sequenciais (001–011)
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx                  # Roteamento, auth, tema claro/escuro
    │   ├── pages/
    │   │   ├── LoginPage.jsx        # Login, cadastro de workspace, recuperação de senha
    │   │   ├── DashboardPage.jsx    # KPIs, gráfico de barras, exportação CSV
    │   │   ├── ConexoesPage.jsx     # Lista de sessões, painel de conexão, QR code
    │   │   ├── ContatosPage.jsx     # Contatos, tags, envio em massa
    │   │   ├── GruposPage.jsx       # Grupos, tags, envio em massa
    │   │   ├── WebhooksPage.jsx     # Webhooks CRUD
    │   │   ├── ApiPage.jsx          # Tokens de API
    │   │   ├── LogsPage.jsx         # Logs com streaming SSE em tempo real
    │   │   └── ConfigPage.jsx       # Workspace, membros, plano e billing
    │   ├── components/              # Chrome, Modal, ConnectPanel, Turnstile, Icons…
    │   └── services/                # api.js, auth.js, sessions.js, contacts.js…
    ├── nginx.conf                   # Config Nginx (prod) com CSP e proxy reverso
    ├── Dockerfile
    ├── vite.config.js
    └── package.json
```

---

## API

Documentação interativa disponível em `http://localhost:3000/docs`.

### Endpoints principais

| Método | Rota                            | Descrição                                         | Auth |
|--------|---------------------------------|---------------------------------------------------|------|
| POST   | `/api/auth/login`               | Login — seta cookie HttpOnly                      | ✗    |
| POST   | `/api/auth/register`            | Cria workspace + usuário admin                    | ✗    |
| GET    | `/api/auth/me`                  | Dados do usuário e workspace autenticados         | ✓    |
| PATCH  | `/api/auth/preferences`         | Salva preferências de UI                          | ✓    |
| POST   | `/api/auth/set-password`        | Define nova senha (primeiro acesso)               | ✓    |
| POST   | `/api/auth/forgot-password`     | Solicita link de redefinição por e-mail           | ✗    |
| POST   | `/api/auth/reset-password`      | Redefine senha via token do e-mail                | ✗    |
| POST   | `/api/auth/logout`              | Logout — remove cookie                            | ✓    |
| GET    | `/api/sessions`                 | Lista sessões do workspace                        | ✓    |
| POST   | `/api/sessions`                 | Cria sessão                                       | ✓    |
| GET    | `/api/sessions/:id`             | Detalhes da sessão (inclui wppToken)              | ✓    |
| PUT    | `/api/sessions/:id`             | Atualiza sessão                                   | ✓    |
| DELETE | `/api/sessions/:id`             | Remove sessão                                     | ✓    |
| GET    | `/api/contacts`                 | Lista contatos do workspace                       | ✓    |
| POST   | `/api/contacts`                 | Cria contato                                      | ✓    |
| PUT    | `/api/contacts/:id`             | Atualiza contato                                  | ✓    |
| DELETE | `/api/contacts/:id`             | Remove contato                                    | ✓    |
| GET    | `/api/groups`                   | Lista grupos do workspace                         | ✓    |
| POST   | `/api/groups`                   | Cria grupo                                        | ✓    |
| PUT    | `/api/groups/:id`               | Atualiza grupo                                    | ✓    |
| DELETE | `/api/groups/:id`               | Remove grupo                                      | ✓    |
| GET    | `/api/webhooks`                 | Lista webhooks do workspace                       | ✓    |
| POST   | `/api/webhooks`                 | Cria webhook (valida SSRF)                        | ✓    |
| PUT    | `/api/webhooks/:id`             | Atualiza webhook                                  | ✓    |
| POST   | `/api/webhooks/:id/test`        | Dispara requisição de teste                       | ✓    |
| DELETE | `/api/webhooks/:id`             | Remove webhook                                    | ✓    |
| GET    | `/api/tokens`                   | Lista tokens de API do workspace                  | ✓    |
| POST   | `/api/tokens`                   | Gera token (plain retornado uma única vez)        | ✓    |
| PUT    | `/api/tokens/:id`               | Atualiza nome / escopos                           | ✓    |
| DELETE | `/api/tokens/:id`               | Revoga token                                      | ✓    |
| GET    | `/api/members`                  | Lista membros do workspace (admin)                | ✓    |
| POST   | `/api/members`                  | Convida membro (admin)                            | ✓    |
| PATCH  | `/api/members/:id`              | Altera papel do membro (admin)                    | ✓    |
| DELETE | `/api/members/:id`              | Remove membro (admin)                             | ✓    |
| GET    | `/api/plan`                     | Plano e uso real do workspace                     | ✓    |
| POST   | `/api/plan/upgrade`             | Muda plano do workspace                           | ✓    |
| POST   | `/api/plan/cancel`              | Cancela assinatura do workspace                   | ✓    |
| GET    | `/api/logs`                     | Consulta logs com filtros                         | ✓    |
| GET    | `/api/logs/stream`              | SSE — push de novos logs em tempo real            | ✓    |
| POST   | `/api/logs`                     | Insere entrada de log                             | ✓    |
| GET    | `/api/dashboard`                | Métricas agregadas (`?period=24h\|7d\|30d`)       | ✓    |
| GET    | `/health`                       | Health check público                              | ✗    |

---

## Segurança

| Mecanismo                  | Detalhe                                                                              |
|----------------------------|--------------------------------------------------------------------------------------|
| **HttpOnly cookie**        | JWT nunca exposto ao JavaScript — proteção contra XSS                               |
| **Rate limiting**          | Login: 5 req/IP a cada 15 min · Registro: 3 req/IP/hora · Forgot: 5 req/IP a cada 15 min |
| **Security headers**       | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS |
| **CSP**                    | Content Security Policy restrita via Nginx                                           |
| **CORS**                   | Apenas a origem definida em `FRONTEND_URL` é permitida                               |
| **Senhas**                 | bcrypt via pgcrypto (`gen_salt('bf', 10)`)                                           |
| **Validação de entrada**   | Todos os inputs validados pelo schema Elysia (`t.*`)                                 |
| **SQL injection**          | Impossível: postgres.js usa tagged templates com binding nativo                      |
| **SSRF**                   | URLs de webhook validadas contra RFC 1918, loopback e link-local                    |
| **Token de reset**         | 64 hex chars (32 bytes), expira em 30 minutos, invalidado após uso                  |
| **Enumeração de e-mails**  | Resposta neutra em `/forgot-password` independente do e-mail existir                 |
| **Turnstile**              | Captcha Cloudflare configurável na tela de login                                     |
| **Secrets em runtime**     | `JWT_SECRET` e `WPP_SECRET_KEY` sem fallback — processo falha na inicialização se ausentes |

---

## License

[Apache 2.0](LICENSE) © 2021 WPPConnect Team
