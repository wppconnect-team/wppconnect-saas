[English](./README.md) | **Português (Brasil)**

<p align="center">
  <a href="https://wppconnect.io/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://wppconnect-team.github.io/brand/wppconnect-dark.png" />
      <img src="https://wppconnect-team.github.io/brand/wppconnect-light.png" alt="WPPConnect" width="220" height="121" />
    </picture>
  </a>
</p>

# WPPConnect SaaS

Gerencie workspaces, sessões e serviços do ecossistema em uma plataforma multi-tenant.

Um projeto do ecossistema WPPConnect, mantido pela WPPConnect Team.

[Primeiros passos](#primeiros-passos) | [Documentação](#documentação) | [Como contribuir](#como-contribuir) | [Apoie a WPPConnect](#apoie-o-projeto)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE) [![CI](https://github.com/wppconnect-team/wppconnect-saas/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/wppconnect-team/wppconnect-saas/actions/workflows/build.yml) [![Documentation](https://img.shields.io/badge/docs-WPPConnect-blue)](https://wppconnect.io/) [![Open Collective](https://img.shields.io/badge/Open%20Collective-WPPConnect-blue)](https://opencollective.com/wppconnect)

## Visão geral

Para equipes que operam workspaces isolados por empresa com papéis admin/editor/viewer. O repositório combina React/Vite, backend Bun/Elysia e PostgreSQL 16, integrando um WPPConnect Server operado separadamente. Algumas integrações exigem provedores externos e configuração operacional.

## Funcionalidades

- Sessões, contatos, grupos, tokens de API com escopo, webhooks e logs por streaming no workspace.
- Control plane de produtos, planos, entitlements e eventos de uso idempotentes.
- Telemetria agregada opt-in, sincronização de catálogo com preview/aplicação e manifestos declarativos assinados de compatibilidade.
- Media API assíncrona opcional e sandbox de licenciamento de extensões. Eventos de billing sandbox não movimentam dinheiro; Stripe Connect continua condicionado ao modelo operacional documentado.

## Primeiros passos

Use Docker com Compose. Comece na raiz do repositório:

```sh
cp .env.example .env
```

No PowerShell use `Copy-Item .env.example .env`. Edite esse `.env` da raiz: defina `JWT_SECRET` privado (pelo menos 32 caracteres), `DB_PASSWORD` e `WPP_SECRET_KEY`, e configure `WPP_SERVER`, `VITE_WPP_SERVER` e `VITE_WPP_SOCKET` para alcançar seu Server. O container da API precisa de URL acessível pelo container; os valores Vite precisam ser acessíveis pelo navegador. Depois:

```sh
docker compose up -d --build
docker compose ps
```

Abra `http://localhost`. No banco vazio, obtenha as credenciais administrativas iniciais no log de inicialização do container da API e troque a senha imediatamente. Não reutilize credenciais de demonstração. Para desenvolver pelos fontes use Bun >=1.1 e a versão Node exigida pela versão Vite do frontend; siga os scripts separados de backend/frontend.

## Configuração

O Compose lê o `.env` da raiz para interpolação; copiar somente `backend/.env` não configura o Compose. O desenvolvimento do backend usa [backend/.env.example](backend/.env.example). Migrations são aplicadas pelo backend antes do tráfego e controladas por checksum; adicione uma migration nova em vez de editar uma já aplicada. Configure SMTP para os fluxos de e-mail. Mídia é opt-in por `docker compose --profile media up -d --build` e exige as chaves `MEDIA_*` do exemplo do serviço. Telemetria é explicitamente opt-in e rejeita conteúdo de conversa e identificadores de usuários. Manifestos de compatibilidade carregam dados declarativos, nunca JavaScript remoto executável.

## Documentação

- [Contrato da Media API](./services/media-api/README.md)
- [SDK de telemetria](./packages/telemetry-sdk/README.md)
- [SDK de licenciamento de extensões](./packages/license-sdk/README.md)
- [Ambiente do backend](./backend/.env.example)
- [Serviços Compose](./docker-compose.yaml)
- [Detalhes técnicos e agradecimentos preservados](documentation/readme-reference.md)

## Ecossistema WPPConnect

| Projeto | Finalidade | Quando usar |
| --- | --- | --- |
| [WPPConnect Server](https://github.com/wppconnect-team/wppconnect-server) | Execute uma API REST para sessões, mensagens e webhooks do WhatsApp. | Expor operações de sessão e mensagens por HTTP. |
| [WPPConnect/WA-JS](https://github.com/wppconnect-team/wa-js) | Exponha funções do WhatsApp Web pela API `WPP` no navegador. | Executar código no navegador dentro do WhatsApp Web. |
| [Wppconnect Extension](https://github.com/wppconnect-team/wppconnect-extension) | Envie mensagens e anexos configurados por uma extensão Chrome para WhatsApp Web. | Usar uma interface Chrome sobre WA-JS. |

## Apoie o projeto

A WPPConnect é mantida por uma comunidade de código aberto. Seu apoio ajuda a financiar a manutenção, a infraestrutura, a documentação e o trabalho das pessoas que desenvolvem o ecossistema.

Se a WPPConnect ajuda seu projeto ou sua empresa, considere fazer uma contribuição pontual ou apoiar de forma recorrente.

**[Apoie a WPPConnect no Open Collective](https://opencollective.com/wppconnect)**

As contribuições são voluntárias. Consulte a página oficial para acompanhar as informações financeiras atuais. Você também pode ajudar com código, testes, documentação, traduções e relatos de problemas bem descritos.

Beneficiários oficiais adicionais em [.github/FUNDING.yml](.github/FUNDING.yml): [joaosouz4dev](https://github.com/sponsors/joaosouz4dev), [manfe](https://github.com/sponsors/manfe).

## Como contribuir

Contribuições de código, testes, exemplos, documentação e traduções são bem-vindas. Para mudanças maiores, discuta a proposta em uma issue primeiro. Ao relatar um problema, informe as versões do projeto/runtime, uma reprodução mínima e logs sem dados sensíveis. Atualize `README.md` e `README.pt-BR.md` na mesma alteração quando mudar instalação, configuração, funcionalidades, exemplos, licença ou arrecadação.

Após instalar as dependências de desenvolvimento, use as verificações pertinentes à sua alteração:

```sh
bun run --cwd backend typecheck
bun run --cwd backend test
npm --prefix frontend run build
```

Exemplos e testes que dependem de conta exigem validação separada com uma conta de teste autorizada. Nunca anexe credenciais ou arquivos de sessão a uma issue.

## Comunidade e suporte

Use as [issues do repositório](https://github.com/wppconnect-team/wppconnect-saas/issues) para bugs reproduzíveis e propostas de funcionalidades. Para dúvidas de uso, participe pelos canais oficiais:

- [Discord](https://discord.gg/JU5JGGKGNG)
- [Telegram](https://t.me/wppconnect)
- [YouTube](https://www.youtube.com/c/wppconnect)

Este projeto é independente e não é afiliado nem endossado pelo WhatsApp ou pela Meta. Siga os termos aplicáveis e obtenha autorização para operações de conta e mensagens.

## Licença

[Apache License 2.0 (Apache-2.0)](./LICENSE).

Copyright 2021 WPPConnect Team.

O documento jurídico original e os avisos de autoria existentes são preservados. Componentes de terceiros mantêm seus próprios termos.
