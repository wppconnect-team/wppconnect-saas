# Embedded Session Manager

`wppconnect-saas` runs as the product manager for a single internal
multi-session runtime, similar to the Evolution deployment model.

The browser only talks to the SaaS API. The SaaS API manages sessions in the
internal runtime container.

## Docker Topology

```text
frontend -> api -> runtime(wppconnect-server) -> WhatsApp providers
             |
             -> postgres
```

The default runtime image is:

```env
WPP_SERVER_IMAGE=wppconnect/wppconnect-server:develop
WPP_SERVER=http://runtime:21465/api
WPP_SECRET_KEY=troque-em-producao-runtime-secret
WPP_DEFAULT_PROVIDER=wppconnect
```

`runtime` is not published to the public network by default. It is exposed only
inside the Docker network, and the SaaS API proxies the required operations.

## Session Flow

1. `POST /api/sessions` creates the SaaS session and generates a runtime token.
2. The selected provider is stored on the session.
3. `POST /api/sessions/{id}/start` calls the internal runtime
   `/api/{session}/start-session` with the selected provider.
4. `GET /api/sessions/{id}/status` checks the runtime status.
5. `GET /api/sessions/{id}/qrcode` returns the QR as a data URL.
6. `POST /api/sessions/{id}/send-message` sends text through the same runtime.
7. `DELETE /api/sessions/{id}` tries to close/logout the runtime session and
   then removes the SaaS record.

## Providers

The current UI exposes:

| provider | runtime |
| --- | --- |
| `wppconnect` | `wppconnect-server` |
| `baileys` | `wppconnect-server` |
| `whaileys` | `wppconnect-server` |
| `zapo` | `wppconnect-server` |

All providers run as sessions in the same runtime instance.

## Public API Surface

The SaaS API remains the stable integration surface:

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/{id}/start`
- `GET /api/sessions/{id}/status`
- `GET /api/sessions/{id}/qrcode`
- `POST /api/sessions/{id}/send-message`
- `PUT /api/sessions/{id}`
- `DELETE /api/sessions/{id}`

Generated OpenAPI docs are available at `/docs`.
