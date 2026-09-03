#!/usr/bin/env bash
set -euo pipefail

cookie_jar="$(mktemp)"
server_log="$(mktemp)"
cleanup() {
  if [[ -n "${server_pid:-}" ]]; then kill "${server_pid}" 2>/dev/null || true; fi
  rm -f "${cookie_jar}" "${server_log}"
}
trap cleanup EXIT

export DATABASE_URL="postgres://wppconnect:test-password@127.0.0.1:5432/wppconnect"
export JWT_SECRET="platform-smoke-jwt-secret"
export NODE_ENV="test"
export FRONTEND_URL="http://127.0.0.1:5173"
export ADMIN_EMAIL="bootstrap-smoke@localhost"
export COMPATIBILITY_INGEST_SECRET="platform-smoke-ingest-secret"
export WEBHOOK_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export COMPATIBILITY_WEBHOOK_POLL_MS="60000"

(
  cd backend
  bun run src/index.ts >"${server_log}" 2>&1
) &
server_pid=$!

for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then break; fi
  sleep 1
done
if ! curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then
  cat "${server_log}"
  exit 1
fi

register_body='{"workspaceName":"Platform Smoke","name":"Smoke Admin","email":"platform-smoke@example.com","password":"strong-smoke-password"}'
curl --fail --silent --show-error --cookie-jar "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data "${register_body}" \
  http://127.0.0.1:3000/api/auth/register | jq -e '.workspace.slug == "platform-smoke"'

curl --fail --silent --show-error --cookie "${cookie_jar}" --cookie-jar "${cookie_jar}" \
  --request POST http://127.0.0.1:3000/api/auth/refresh | jq -e '.expiresIn > 0'

curl --fail --silent --show-error --cookie "${cookie_jar}" \
  http://127.0.0.1:3000/api/platform/overview | jq -e '.workspace.slug == "platform-smoke"'
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/platform/catalog | jq -e '.data | length >= 1'

token_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data '{"name":"Smoke key","scopes":["usage:write"]}' \
  http://127.0.0.1:3000/api/tokens/)"
token_id="$(jq -r '.data.id' <<<"${token_response}")"
api_key="$(jq -r '.token' <<<"${token_response}")"

usage_body='{"schemaVersion":"1","idempotencyKey":"platform-smoke-event-1","product":"compatibility-monitor","meter":"webhook.delivery","quantity":1,"occurredAt":"2026-09-03T00:00:00.000Z"}'
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/json' --data "${usage_body}" \
  http://127.0.0.1:3000/api/v1/usage/events | jq -e '.duplicate == false'
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/json' --data "${usage_body}" \
  http://127.0.0.1:3000/api/v1/usage/events | jq -e '.duplicate == true'

rotate_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --request POST http://127.0.0.1:3000/api/tokens/${token_id}/rotate)"
rotated_id="$(jq -r '.data.id' <<<"${rotate_response}")"
rotated_key="$(jq -r '.token' <<<"${rotate_response}")"

old_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "authorization: Bearer ${api_key}" --header 'content-type: application/json' \
  --data "${usage_body/platform-smoke-event-1/platform-smoke-event-old}" \
  http://127.0.0.1:3000/api/v1/usage/events)"
test "${old_status}" = "401"

curl --fail --silent --show-error --header "authorization: Bearer ${rotated_key}" \
  --header 'content-type: application/json' \
  --data "${usage_body/platform-smoke-event-1/platform-smoke-event-2}" \
  http://127.0.0.1:3000/api/v1/usage/events | jq -e '.duplicate == false'

curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --request DELETE http://127.0.0.1:3000/api/tokens/${rotated_id} >/dev/null
revoked_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "authorization: Bearer ${rotated_key}" --header 'content-type: application/json' \
  --data "${usage_body/platform-smoke-event-1/platform-smoke-event-revoked}" \
  http://127.0.0.1:3000/api/v1/usage/events)"
test "${revoked_status}" = "401"

curl --fail --silent --show-error --cookie "${cookie_jar}" --cookie-jar "${cookie_jar}" \
  --request POST http://127.0.0.1:3000/api/auth/logout >/dev/null
logged_out_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --cookie "${cookie_jar}" http://127.0.0.1:3000/api/platform/overview)"
test "${logged_out_status}" = "401"

echo 'Platform smoke passed: session rotation, catalog, overview, API-key rotation/revocation, and idempotent usage.'
