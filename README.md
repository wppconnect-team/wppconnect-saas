# WPPConnect Team

## _WPPConnect SaaS_

## Our online channels

Connect with us across various platforms to stay updated and engage in discussions:

[![Discord](https://img.shields.io/discord/844351092758413353?color=blueviolet&label=Discord&logo=discord&style=flat)](https://discord.gg/JU5JGGKGNG)
[![Telegram Group](https://img.shields.io/badge/Telegram-Group-32AFED?logo=telegram)](https://t.me/wppconnect)
[![WhatsApp Group](https://img.shields.io/badge/WhatsApp-Group-25D366?logo=whatsapp)](https://chat.whatsapp.com/LJaQu6ZyNvnBPNAVRbX00K)
[![YouTube](https://img.shields.io/youtube/channel/subscribers/UCD7J9LG08PmGQrF5IS7Yv9A?label=YouTube)](https://www.youtube.com/c/wppconnect)

---

WhatsApp session management dashboard. Connect multiple instances, manage contacts, configure webhooks, and monitor everything in real time.

## Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 18 + Vite 8                 |
| Backend  | Elysia (Bun) + TypeScript         |
| Database | PostgreSQL 16                     |
| Auth     | JWT via HttpOnly cookie (pgcrypto)|
| Deploy   | Docker + Nginx                    |

## Features

- WhatsApp session management (connect, disconnect, QR code)
- Contact listing and search
- Webhook endpoints with delivery rate monitoring
- API tokens for programmatic integration
- Real-time event logs
- Dashboard with aggregated metrics
- HttpOnly cookie authentication + login rate limiting
- Security headers on all responses (CSP, HSTS, X-Frame-Options…)
- Cloudflare Turnstile captcha on the login form

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.1
- [Node.js](https://nodejs.org) >= 20
- [Docker](https://www.docker.com) + Docker Compose

### 1. Database

```bash
cd backend
docker compose up db -d
```

The database starts on port `5432` and automatically runs the `001_init.sql` migration, creating tables and demo data.

**Default account created by the migration:**

| Field    | Value                 |
|----------|-----------------------|
| Email    | `admin@wppconnect.io` |
| Password | `admin123`            |

### 2. Backend

```bash
cd backend
cp .env.example .env   # adjust variables as needed
bun install
bun run dev            # hot-reload at http://localhost:3000
```

Swagger docs available at `http://localhost:3000/docs`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The Vite proxy already forwards `/api/*` → `http://localhost:3000`, so `VITE_API_URL` does not need to be configured.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable         | Description                                           | Default                                                  |
|------------------|-------------------------------------------------------|----------------------------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string                          | `postgres://wppconnect:secret@localhost:5432/wppconnect` |
| `JWT_SECRET`     | Secret used to sign JWT tokens (**change in production**) | `dev-secret-change-in-production`                    |
| `PORT`           | Server port                                           | `3000`                                                   |
| `FRONTEND_URL`   | Allowed CORS origin                                   | `http://localhost:5173`                                  |
| `NODE_ENV`       | Environment (`development` / `production`)            | —                                                        |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key (leave empty to disable) | —                                               |

### Frontend (`frontend/.env`)

| Variable                  | Description                                                       | Default |
|---------------------------|-------------------------------------------------------------------|---------|
| `VITE_API_URL`            | API base URL (leave empty — Vite proxy handles it in dev)         | `""`    |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (leave empty to disable the widget) | `""`    |

---

## Production with Docker

### Full stack (frontend + api + database)

```bash
# From the project root
cp backend/.env.example backend/.env
# Edit backend/.env with a strong JWT_SECRET and DB_PASSWORD

JWT_SECRET="your-long-secret-key" \
DB_PASSWORD="strong-password" \
FRONTEND_URL="https://yourdomain.com" \
docker compose up -d --build
```

The frontend is available on port `80`. Nginx proxies `/api/*` to the backend internally.

### Backend + database only

```bash
cd backend
docker compose up -d --build
```

### Required variables in production

- `JWT_SECRET` — long random string (minimum 32 characters). The root compose will throw an error if not set.
- `DB_PASSWORD` — PostgreSQL password (`secret` default is for local development only).

---

## Project Structure

```
wppconnect/
├── docker-compose.yaml          # Full stack (prod)
├── .gitignore
│
├── backend/
│   ├── src/
│   │   ├── index.ts             # Elysia entrypoint
│   │   ├── db.ts                # PostgreSQL connection (postgres.js)
│   │   ├── plugins/
│   │   │   ├── auth.ts          # JWT middleware via HttpOnly cookie
│   │   │   ├── security.ts      # Global security headers
│   │   │   └── rateLimit.ts     # In-memory rate limiter
│   │   └── routes/
│   │       ├── auth.ts          # Login, logout, register, /me
│   │       ├── sessions.ts      # WhatsApp session CRUD
│   │       ├── contacts.ts      # Contact CRUD
│   │       ├── webhooks.ts      # Webhook CRUD
│   │       ├── tokens.ts        # API token CRUD
│   │       ├── logs.ts          # Log queries
│   │       └── dashboard.ts     # Aggregated metrics
│   ├── migrations/
│   │   └── 001_init.sql         # Schema + demo data
│   ├── Dockerfile
│   ├── docker-compose.yaml      # API + database only (dev/isolated)
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx              # Routing, auth, theme
    │   ├── pages/               # Dashboard, Sessions, Contacts, Webhooks, API, Logs, Config
    │   ├── components/          # Chrome, Modal, ConnectPanel, Turnstile, Icons…
    │   └── services/            # api.js, auth.js, sessions.js, contacts.js…
    ├── nginx.conf               # Nginx config (prod) with CSP + reverse proxy
    ├── Dockerfile
    ├── vite.config.js
    ├── .env.example
    └── package.json
```

---

## API

Interactive documentation available at `http://localhost:3000/docs` (Swagger UI).

### Main Endpoints

| Method | Route                   | Description                          | Auth |
|--------|-------------------------|--------------------------------------|------|
| POST   | `/api/auth/login`       | Login — sets HttpOnly cookie         | ✗    |
| POST   | `/api/auth/register`    | Register a new user                  | ✗    |
| GET    | `/api/auth/me`          | Authenticated user data              | ✓    |
| POST   | `/api/auth/logout`      | Logout — clears cookie               | ✓    |
| GET    | `/api/sessions`         | List sessions with filters           | ✓    |
| POST   | `/api/sessions`         | Create session                       | ✓    |
| PUT    | `/api/sessions/:id`     | Update session                       | ✓    |
| DELETE | `/api/sessions/:id`     | Delete session                       | ✓    |
| GET    | `/api/contacts`         | List contacts                        | ✓    |
| POST   | `/api/contacts`         | Create contact                       | ✓    |
| DELETE | `/api/contacts/:id`     | Remove contact                       | ✓    |
| GET    | `/api/webhooks`         | List webhooks                        | ✓    |
| POST   | `/api/webhooks`         | Create webhook                       | ✓    |
| PUT    | `/api/webhooks/:id`     | Update webhook                       | ✓    |
| DELETE | `/api/webhooks/:id`     | Remove webhook                       | ✓    |
| GET    | `/api/tokens`           | List API tokens                      | ✓    |
| POST   | `/api/tokens`           | Generate token (plain shown once)    | ✓    |
| DELETE | `/api/tokens/:id`       | Revoke token                         | ✓    |
| GET    | `/api/logs`             | Query logs with filters              | ✓    |
| GET    | `/api/dashboard`        | Aggregated metrics                   | ✓    |
| GET    | `/health`               | Public health check                  | ✗    |

---

## Security

- **HttpOnly cookie** — JWT never exposed to JavaScript (XSS protection)
- **Rate limiting** — 5 login attempts per IP every 15 minutes
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (production)
- **CSP** — strict Content Security Policy via Nginx
- **CORS** — only the origin configured in `FRONTEND_URL` is allowed
- **Passwords** — bcrypt via pgcrypto (`gen_salt('bf', 10)`)
- **Input validation** — all inputs validated by Elysia schema (`t.*`)
- **SQL injection** — not possible: postgres.js uses tagged templates with native binding
- **Cloudflare Turnstile** — captcha challenge on the login form (configurable)

---

## License

MIT
