**English** | [Português (Brasil)](./README.pt-BR.md)

<p align="center">
  <a href="https://wppconnect.io/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://wppconnect-team.github.io/brand/wppconnect-dark.png" />
      <img src="https://wppconnect-team.github.io/brand/wppconnect-light.png" alt="WPPConnect" width="220" height="121" />
    </picture>
  </a>
</p>

# WPPConnect SaaS

Manage WhatsApp workspaces, sessions and ecosystem services in a multi-tenant platform.

A project in the WPPConnect ecosystem, maintained by WPPConnect Team.

[Getting started](#getting-started) | [Documentation](#documentation) | [Contributing](#contributing) | [Support WPPConnect](#support-the-project)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE) [![CI](https://github.com/wppconnect-team/wppconnect-saas/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/wppconnect-team/wppconnect-saas/actions/workflows/build.yml) [![Documentation](https://img.shields.io/badge/docs-WPPConnect-blue)](https://wppconnect.io/) [![Open Collective](https://img.shields.io/badge/Open%20Collective-WPPConnect-blue)](https://opencollective.com/wppconnect)

## Overview

For teams operating isolated company workspaces with admin/editor/viewer roles. The repository combines React/Vite, a Bun/Elysia backend and PostgreSQL 16, integrating with a separately operated WPPConnect Server. Some integrations require external providers and operator configuration.

## Features

- Workspace sessions, contacts, groups, scoped API tokens, webhooks and streamed logs.
- Control plane for products, plans, entitlements and idempotent usage events.
- Opt-in aggregate telemetry, catalog preview/apply synchronization and signed declarative compatibility manifests.
- Optional asynchronous Media API and extension-licensing sandbox. Sandbox billing events do not move money; Stripe Connect remains gated by the documented operating model.

## Getting started

Use Docker with Compose. Start from the repository root:

```sh
cp .env.example .env
```

In PowerShell use `Copy-Item .env.example .env`. Edit this root `.env`: set private `JWT_SECRET` (at least 32 characters), `DB_PASSWORD` and `WPP_SECRET_KEY`, and configure `WPP_SERVER`, `VITE_WPP_SERVER` and `VITE_WPP_SOCKET` to reach your own Server. The API container needs a container-reachable URL; Vite values must be browser-reachable. Then:

```sh
docker compose up -d --build
docker compose ps
```

Open `http://localhost`. On an empty database, obtain the initial admin credentials from the API container startup log and change the password immediately. Do not reuse demonstration credentials. For source development use Bun >=1.1 and the Node version required by the frontend Vite release; follow the separate backend/frontend scripts.

## Configuration

Compose reads the root `.env` for interpolation; copying only `backend/.env` does not configure Compose. Backend source development uses [backend/.env.example](backend/.env.example). Migrations are applied by the backend before traffic and tracked by checksum; add a new migration rather than editing one already applied. Configure SMTP for email flows. Media is opt-in through `docker compose --profile media up -d --build` and requires the `MEDIA_*` keys in its service example. Telemetry is explicitly opt-in and rejects conversation content and user identifiers. Compatibility manifests carry declarative data, never executable remote JavaScript.

## Documentation

- [Media API contract](./services/media-api/README.md)
- [Telemetry SDK](./packages/telemetry-sdk/README.md)
- [Extension license SDK](./packages/license-sdk/README.md)
- [Backend environment](./backend/.env.example)
- [Compose services](./docker-compose.yaml)
- [Retained technical details and acknowledgments](documentation/readme-reference.md)

## WPPConnect ecosystem

| Project | Purpose | When to use it |
| --- | --- | --- |
| [WPPConnect Server](https://github.com/wppconnect-team/wppconnect-server) | Run a REST API for WhatsApp sessions, messages and webhooks. | Expose session and messaging operations over HTTP. |
| [WPPConnect/WA-JS](https://github.com/wppconnect-team/wa-js) | Expose WhatsApp Web functions through the browser-side `WPP` API. | Run browser-side code in WhatsApp Web. |
| [Wppconnect Extension](https://github.com/wppconnect-team/wppconnect-extension) | Send configured messages and attachments through a Chrome extension for WhatsApp Web. | Use a Chrome UI over WA-JS. |

## Support the project

WPPConnect is maintained by an open-source community. Your support helps fund maintenance, infrastructure, documentation, and the people working on the ecosystem.

If WPPConnect helps your project or business, consider making a one-time contribution or becoming a recurring supporter.

**[Support WPPConnect on Open Collective](https://opencollective.com/wppconnect)**

Contributions are voluntary. See the official page for current financial information. You can also help with code, tests, documentation, translations and well-described issue reports.

Additional official beneficiaries in [.github/FUNDING.yml](.github/FUNDING.yml): [joaosouz4dev](https://github.com/sponsors/joaosouz4dev), [manfe](https://github.com/sponsors/manfe).

## Contributing

Contributions of code, tests, examples, documentation and translations are welcome. For larger changes, discuss the approach in an issue first. Include the project/runtime versions, a minimal reproduction and sanitized logs when reporting a problem. Update both `README.md` and `README.pt-BR.md` in the same change when installation, configuration, features, examples, licensing or funding changes.

After installing the development dependencies, use the repository checks relevant to your change:

```sh
bun run --cwd backend typecheck
bun run --cwd backend test
npm --prefix frontend run build
```

Account-dependent examples and tests require separate validation with an authorized test account. Never attach credentials or session files to an issue.

## Community and support

Use [repository issues](https://github.com/wppconnect-team/wppconnect-saas/issues) for reproducible bugs and feature proposals. For usage questions, join the community through the official channels:

- [Discord](https://discord.gg/JU5JGGKGNG)
- [Telegram](https://t.me/wppconnect)
- [YouTube](https://www.youtube.com/c/wppconnect)

This project is independent and is not affiliated with or endorsed by WhatsApp or Meta. Follow applicable terms and obtain authorization for account and messaging operations.

## License

[Apache License 2.0 (Apache-2.0)](./LICENSE).

Copyright 2021 WPPConnect Team.

The original legal document and existing copyright notices are preserved. Third-party components retain their own terms.
