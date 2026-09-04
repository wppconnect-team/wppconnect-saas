# WPPConnect Media API

Asynchronous conversion and transcription service for WhatsApp audio. Uploads and fetched media are AES-256-GCM encrypted at rest, jobs are idempotent per workspace, output links expire, and completion webhooks are HMAC signed.

## Public contract

- `POST /v1/audio/conversions` — JSON with `sourceUrl`, or multipart with `file`.
- `POST /v1/audio/transcriptions` — same input contract; optionally accepts `language`.
- `GET /v1/jobs/{id}` — polls job state.
- `GET /v1/jobs/{id}/content` — short-lived signed conversion result.

Creation requires `Idempotency-Key` and an API key with `media:write`; polling requires `media:read`. A conversion always emits mono 48 kHz OGG/Opus using FFmpeg's VoIP profile and validates the result with ffprobe. Transcription uses an OpenAI-compatible `/audio/transcriptions` provider configured through environment variables.

Webhook consumers must verify `X-WPPConnect-Signature` over `<timestamp>.<raw-body>`, deduplicate with `Idempotency-Key`, and reject stale timestamps. Files are removed after `MEDIA_RETENTION_HOURS`.

The continuously validated production image is published as
`ghcr.io/wppconnect-team/wppconnect-media-api:latest`. Every build also receives
an immutable `sha-<commit>` tag and OCI provenance/SBOM attestations. Deployment
still requires PostgreSQL, persistent `/data` storage, HTTPS, and the secrets
listed in `.env.example`.

The WPPConnect organization currently disables public package visibility. Until
an organization owner enables it, authenticate `docker` to `ghcr.io` with a
GitHub token carrying `read:packages` before pulling the image.

## Azure Container Apps

`deploy/azure` provides a repeatable production topology for the worker:

- Azure Container Registry with managed-identity pulls (no registry password);
- one continuously available Container Apps replica so queued jobs are not abandoned;
- autoscaling up to three replicas using HTTP concurrency;
- encrypted Azure Files mounted at `/data` for retained inputs and outputs;
- health probes and Log Analytics;
- secrets passed through a temporary ARM parameter file that is deleted after deployment.

Copy `deploy/azure/media-api.env.example` to a location outside the repository,
preserve the storage key between deployments, and run from the repository root:

```powershell
./services/media-api/deploy/azure/deploy.ps1 -SecretsFile C:\secure\media-api.env -WhatIf
./services/media-api/deploy/azure/deploy.ps1 -SecretsFile C:\secure\media-api.env
```

The command returns `mediaApiUrl`; configure that value as `MEDIA_API_URL` in
WPPConnect Cloud only after the health check succeeds. `TRANSCRIPTION_API_KEY`
may be omitted for conversion-only deployments, but transcription jobs must not
be offered publicly until a compatible provider is configured and tested. The
public `/health` response exposes `capabilities.conversion` and
`capabilities.transcription`; an unavailable transcription request returns 503
without creating a job.

This topology creates billable Azure resources. A minimum replica is deliberate:
the current worker polls PostgreSQL continuously and cannot safely scale to zero.
