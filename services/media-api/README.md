# WPPConnect Media API

Asynchronous conversion and transcription service for WhatsApp audio. Uploads and fetched media are AES-256-GCM encrypted at rest, jobs are idempotent per workspace, output links expire, and completion webhooks are HMAC signed.

## Public contract

- `POST /v1/audio/conversions` — JSON with `sourceUrl`, or multipart with `file`.
- `POST /v1/audio/transcriptions` — same input contract; optionally accepts `language`.
- `GET /v1/jobs/{id}` — polls job state.
- `GET /v1/jobs/{id}/content` — short-lived signed conversion result.

Creation requires `Idempotency-Key` and an API key with `media:write`; polling requires `media:read`. A conversion always emits mono 48 kHz OGG/Opus using FFmpeg's VoIP profile and validates the result with ffprobe. Transcription uses an OpenAI-compatible `/audio/transcriptions` provider configured through environment variables.

Webhook consumers must verify `X-WPPConnect-Signature` over `<timestamp>.<raw-body>`, deduplicate with `Idempotency-Key`, and reject stale timestamps. Files are removed after `MEDIA_RETENTION_HOURS`.
