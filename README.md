# WPPConnect Team

## _WPPConnect SaaS_

## Our online channels

Connect with us across various platforms to stay updated and engage in discussions:

[![Discord](https://img.shields.io/discord/844351092758413353?color=blueviolet&label=Discord&logo=discord&style=flat)](https://discord.gg/JU5JGGKGNG)
[![Telegram Group](https://img.shields.io/badge/Telegram-Group-32AFED?logo=telegram)](https://t.me/wppconnect)
[![WhatsApp Group](https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp)](https://chat.whatsapp.com/LJaQu6ZyNvnBPNAVRbX00K)
[![YouTube](https://img.shields.io/youtube/channel/subscribers/UCD7J9LG08PmGQrF5IS7Yv9A?label=YouTube)](https://www.youtube.com/c/wppconnect)

---

Painel de gerenciamento de sessões WhatsApp. Conecte múltiplas instâncias, gerencie contatos, configure webhooks e monitore tudo em tempo real.

## Stack

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Frontend   | React 18 + Vite 8                   |
| Backend    | Elysia (Bun) + TypeScript           |
| Banco      | PostgreSQL 16                       |
| Auth       | JWT em HttpOnly cookie (pgcrypto)   |
| Deploy     | Docker + Nginx                      |

## Funcionalidades

- Gerenciamento de sessões WhatsApp (conectar, desconectar, QR code)
- Listagem e busca de contatos
- Endpoints de webhook com monitoramento de taxa de entrega
- Tokens de API para integração programática
- Logs de eventos em tempo real
- Dashboard com métricas agregadas
- Autenticação com HttpOnly cookie + rate limiting no login
- Security headers em todas as respostas (CSP, HSTS, X-Frame-Options…)

---

## Desenvolvimento local

### Pré-requisitos

- [Bun](https://bun.sh) >= 1.1
- [Node.js](https://nodejs.org) >= 20
- [Docker](https://www.docker.com) + Docker Compose

### 1. Banco de dados

```bash
cd backend
docker compose up db -d
```

O banco sobe na porta `5432` e executa automaticamente a migration `001_init.sql`, criando tabelas e dados de demonstração.

**Conta padrão criada pela migration:**

| Campo | Valor |
|-------|-------|
| Email | `admin@wppconnect.io` |
| Senha | `admin123` |

### 2. Backend

```bash
cd backend
cp .env.example .env   # ajuste as variáveis se necessário
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

O Vite proxy já encaminha `/api/*` → `http://localhost:3000`, portanto não é necessário configurar `VITE_API_URL`.

---

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável       | Descrição                                      | Padrão                                     |
|----------------|------------------------------------------------|--------------------------------------------|
| `DATABASE_URL` | Connection string do PostgreSQL                | `postgres://wppconnect:secret@localhost:5432/wppconnect` |
| `JWT_SECRET`   | Segredo para assinar tokens JWT (**trocar em produção**) | `dev-secret-change-in-production` |
| `PORT`         | Porta do servidor                              | `3000`                                     |
| `FRONTEND_URL` | Origem permitida no CORS                       | `http://localhost:5173`                    |
| `NODE_ENV`     | Ambiente (`development` / `production`)        | —                                          |

### Frontend (`frontend/.env`)

| Variável        | Descrição                                                  | Padrão |
|-----------------|------------------------------------------------------------|--------|
| `VITE_API_URL`  | URL base da API (deixar vazio — Vite proxy cuida em dev)   | `""`   |

---

## Produção com Docker

### Stack completo (frontend + api + banco)

```bash
# Na raiz do projeto
cp backend/.env.example backend/.env
# Edite backend/.env com JWT_SECRET forte e DB_PASSWORD

JWT_SECRET="sua-chave-secreta-longa" \
DB_PASSWORD="senha-forte" \
FRONTEND_URL="https://seudominio.com" \
docker compose up -d --build
```

O frontend fica disponível na porta `80`. O Nginx encaminha `/api/*` para o backend internamente.

### Apenas o backend + banco

```bash
cd backend
docker compose up -d --build
```

### Variáveis obrigatórias em produção

- `JWT_SECRET` — string aleatória longa (mínimo 32 caracteres). O compose raiz lança erro se não for definida.
- `DB_PASSWORD` — senha do PostgreSQL (padrão `secret` só para desenvolvimento local).

---

## Estrutura do projeto

```
wppconnect/
├── docker-compose.yaml          # Stack completo (prod)
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── index.ts             # Entrypoint Elysia
│   │   ├── db.ts                # Conexão PostgreSQL (postgres.js)
│   │   ├── plugins/
│   │   │   ├── auth.ts          # Middleware JWT via HttpOnly cookie
│   │   │   ├── security.ts      # Security headers globais
│   │   │   └── rateLimit.ts     # Rate limiter em memória
│   │   └── routes/
│   │       ├── auth.ts          # Login, logout, registro, /me
│   │       ├── sessions.ts      # CRUD sessões WhatsApp
│   │       ├── contacts.ts      # CRUD contatos
│   │       ├── webhooks.ts      # CRUD webhooks
│   │       ├── tokens.ts        # CRUD tokens de API
│   │       ├── logs.ts          # Consulta de logs
│   │       └── dashboard.ts     # Métricas agregadas
│   ├── migrations/
│   │   └── 001_init.sql         # Schema + dados de demonstração
│   ├── Dockerfile
│   ├── docker-compose.yaml      # Apenas api + banco (dev/isolado)
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx              # Roteamento, auth, tema
    │   ├── pages/               # Dashboard, Conexões, Contatos, Webhooks, API, Logs, Config
    │   ├── components/          # Chrome, Modal, ConnectPanel, Icons…
    │   └── services/            # api.js, auth.js, sessions.js, contacts.js…
    ├── nginx.conf               # Configuração Nginx (prod) com CSP + proxy
    ├── Dockerfile
    ├── vite.config.js
    ├── .env.example
    └── package.json
```

---

## API

Documentação interativa disponível em `http://localhost:3000/docs` (Swagger UI).

### Endpoints principais

| Método | Rota                    | Descrição                         | Auth |
|--------|-------------------------|-----------------------------------|------|
| POST   | `/api/auth/login`       | Login — seta HttpOnly cookie      | ✗    |
| POST   | `/api/auth/register`    | Cadastro de novo usuário          | ✗    |
| GET    | `/api/auth/me`          | Dados do usuário autenticado      | ✓    |
| POST   | `/api/auth/logout`      | Logout — remove cookie            | ✓    |
| GET    | `/api/sessions`         | Lista sessões com filtros         | ✓    |
| POST   | `/api/sessions`         | Criar sessão                      | ✓    |
| PUT    | `/api/sessions/:id`     | Atualizar sessão                  | ✓    |
| DELETE | `/api/sessions/:id`     | Deletar sessão                    | ✓    |
| GET    | `/api/contacts`         | Lista contatos                    | ✓    |
| POST   | `/api/contacts`         | Criar contato                     | ✓    |
| DELETE | `/api/contacts/:id`     | Remover contato                   | ✓    |
| GET    | `/api/webhooks`         | Lista webhooks                    | ✓    |
| POST   | `/api/webhooks`         | Criar webhook                     | ✓    |
| PUT    | `/api/webhooks/:id`     | Atualizar webhook                 | ✓    |
| DELETE | `/api/webhooks/:id`     | Remover webhook                   | ✓    |
| GET    | `/api/tokens`           | Lista tokens de API               | ✓    |
| POST   | `/api/tokens`           | Gerar token (plain exibido 1x)    | ✓    |
| DELETE | `/api/tokens/:id`       | Revogar token                     | ✓    |
| GET    | `/api/logs`             | Consultar logs com filtros        | ✓    |
| GET    | `/api/dashboard`        | Métricas agregadas                | ✓    |
| GET    | `/health`               | Health check público              | ✗    |

---

## Segurança

- **HttpOnly cookie** — JWT nunca exposto ao JavaScript (proteção XSS)
- **Rate limiting** — 5 tentativas de login por IP a cada 15 minutos
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (produção)
- **CSP** — Content Security Policy restritiva via Nginx
- **CORS** — apenas a origem configurada em `FRONTEND_URL`
- **Senhas** — bcrypt via pgcrypto (`gen_salt('bf', 10)`)
- **Validação** — todos os inputs validados pelo schema Elysia (`t.*`)
- **SQL injection** — impossível: postgres.js usa tagged templates com binding nativo

---

## Licença

MIT
