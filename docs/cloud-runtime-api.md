# WPPConnect SaaS Runtime API

The SaaS API owns product authentication, workspace isolation and plan limits.
Runtime operations are routed through the WPPConnect Cloud Manager when
`WPP_MANAGER_URL` is configured.

## Runtime Configuration

```env
WPP_MANAGER_URL=https://cloud-manager.wppconnect.io
WPP_MANAGER_TOKEN=
WPP_ORIGIN=wppconnect-cloud
WPP_DEFAULT_RUNTIME=wppconnect-server
WPP_DEFAULT_PROVIDER=wppconnect
```

Legacy development without the manager can still use:

```env
WPP_SERVER=http://localhost:21465/api
WPP_SECRET_KEY=secret
```

## Create Session

`POST /api/sessions`

Creates the SaaS record and asks the manager to allocate a runtime/container.

```json
{
  "name": "Support",
  "phone": "+5511999999999",
  "tag": "atendimento",
  "origin": "wppconnect-cloud",
  "runtime": "wppconnect-server",
  "provider": "wppconnect",
  "webhook": "https://example.com/webhook"
}
```

Supported runtime/provider pairs:

| runtime | provider |
| --- | --- |
| `wppconnect-server` | `wppconnect` |
| `wppconnect-server` | `baileys` |
| `wppconnect-server` | `whaileys` |
| `wppconnect-server` | `zapo` |
| `wppconnect-server-go` | `go` |

Response includes routing metadata:

```json
{
  "data": {
    "id": "wa_abcd",
    "origin": "wppconnect-cloud",
    "runtime": "wppconnect-server",
    "provider": "wppconnect",
    "worker": "node-1",
    "containerPort": 10001
  }
}
```

## Start Session

`POST /api/sessions/{sessionId}/start`

Starts or restarts the runtime session through the manager.

```json
{
  "waitQrCode": false
}
```

For pairing code:

```json
{
  "phone": "5511999999999",
  "waitQrCode": true
}
```

## Status

`GET /api/sessions/{sessionId}/status`

Returns the normalized runtime status and synchronizes the SaaS session state.

## QR Code

`GET /api/sessions/{sessionId}/qrcode`

Returns a JSON payload with a data URL when the runtime exposes a QR image:

```json
{
  "status": "qr",
  "qrcode": "data:image/png;base64,..."
}
```

## Send Text Message

`POST /api/sessions/{sessionId}/send-message`

```json
{
  "phone": "5511999999999",
  "message": "Hello from WPPConnect Cloud",
  "isGroup": false
}
```

Groups can use the group JID or group phone/id and `isGroup=true`.

## Generated API Docs

The backend also exposes OpenAPI/Swagger at:

`GET /docs`
