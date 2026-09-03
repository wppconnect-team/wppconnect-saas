#!/usr/bin/env bash
set -euo pipefail

cookie_jar="$(mktemp)"
server_log="$(mktemp)"
telemetry_payload="$(mktemp)"
cleanup() {
  status=$?
  if [[ "${status}" -ne 0 ]]; then
    echo '--- backend log after smoke failure ---' >&2
    cat "${server_log}" >&2
  fi
  if [[ -n "${server_pid:-}" ]]; then kill "${server_pid}" 2>/dev/null || true; fi
  rm -f "${cookie_jar}" "${server_log}" "${telemetry_payload}"
  trap - EXIT
  exit "${status}"
}
trap cleanup EXIT

export DATABASE_URL="postgres://wppconnect:test-password@127.0.0.1:5432/wppconnect"
export JWT_SECRET="platform-smoke-jwt-secret"
export NODE_ENV="test"
export FRONTEND_URL="http://127.0.0.1:5173"
export ADMIN_EMAIL="bootstrap-smoke@localhost"
export WPP_SECRET_KEY="platform-smoke-wpp-secret"
export COMPATIBILITY_INGEST_SECRET="platform-smoke-ingest-secret"
export WEBHOOK_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export COMPATIBILITY_WEBHOOK_POLL_MS="60000"
export CRON_SECRET="platform-smoke-cron-secret"
export COMPATIBILITY_MANIFEST_PRIVATE_KEY="$(openssl genpkey -algorithm ED25519)"
export COMPATIBILITY_MANIFEST_KEY_ID="smoke-key-1"
export COMPATIBILITY_MANIFEST_ADMIN_SECRET="platform-smoke-manifest-admin"

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
  --data '{"name":"Smoke key","scopes":["usage:write","telemetry:write"]}' \
  http://127.0.0.1:3000/api/tokens/)"
token_id="$(jq -r '.data.id' <<<"${token_response}")"
api_key="$(jq -r '.token' <<<"${token_response}")"

curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  'http://127.0.0.1:3000/api/v1/auth/context?required=usage%3Awrite' \
  | jq -e '.workspaceId and (.scopes | index("usage:write"))'

usage_body='{"schemaVersion":"1","idempotencyKey":"platform-smoke-event-1","product":"compatibility-monitor","meter":"webhook.delivery","quantity":1,"occurredAt":"2026-09-03T00:00:00.000Z"}'
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/json' --data "${usage_body}" \
  http://127.0.0.1:3000/api/v1/usage/events | jq -e '.duplicate == false'
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/json' --data "${usage_body}" \
  http://127.0.0.1:3000/api/v1/usage/events | jq -e '.duplicate == true'

telemetry_body='{"schemaVersion":"1","snapshots":[{"schemaVersion":"1","idempotencyKey":"platform-telemetry-1","sourceId":"smoke-node","sdkVersion":"0.1.0","waVersion":"2.3000.1","observedFrom":"2026-09-03T10:00:00.000Z","observedTo":"2026-09-03T10:01:00.000Z","counters":{"messages.sent":4,"messages.received":3,"messages.deleted":1,"errors.total":2},"responseLatency":{"sumMs":1200,"count":4},"availability":{"connectedSeconds":58,"observedSeconds":60},"functions":[{"name":"sendText","calls":4,"errors":1,"durationMsSum":900}]}]}'
printf '%s' "${telemetry_body}" | gzip -c >"${telemetry_payload}"
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/octet-stream' --header 'content-encoding: gzip' \
  --data-binary "@${telemetry_payload}" \
  http://127.0.0.1:3000/api/v1/telemetry/snapshots | jq -e '.accepted == 1 and .duplicates == 0'
curl --fail --silent --show-error --header "authorization: Bearer ${api_key}" \
  --header 'content-type: application/json' --data "${telemetry_body}" \
  http://127.0.0.1:3000/api/v1/telemetry/snapshots | jq -e '.accepted == 0 and .duplicates == 1'
curl --fail --silent --show-error --cookie "${cookie_jar}" \
  'http://127.0.0.1:3000/api/telemetry/summary?days=365' \
  | jq -e '.data.messages.sent == 4 and .data.messages.deleted == 1 and .data.averageResponseMs == 300'
curl --fail --silent --show-error --cookie "${cookie_jar}" --request PUT \
  --header 'content-type: application/json' --data '{"retentionDays":14}' \
  http://127.0.0.1:3000/api/telemetry/settings | jq -e '.data.retentionDays == 14'
curl --fail --silent --show-error --cookie "${cookie_jar}" \
  'http://127.0.0.1:3000/api/telemetry/export?days=365' | jq -e '.data | length == 1'

catalog_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data '{"name":"Woo Smoke","provider":"woocommerce","storeUrl":"https://example.com","sourceCredentials":{"consumerKey":"ck_smoke","consumerSecret":"cs_smoke","currency":"BRL"},"wppServerUrl":"https://wppconnect.io","wppSession":"smoke","wppToken":"wpp-secret-token","webhookUrl":"https://example.com/catalog"}' \
  http://127.0.0.1:3000/api/catalog/connections)"
catalog_id="$(jq -r '.data.id' <<<"${catalog_response}")"
jq -e '.signingSecret | startswith("whsec_")' <<<"${catalog_response}"
curl --fail --silent --show-error --cookie "${cookie_jar}" \
  http://127.0.0.1:3000/api/catalog/connections | jq -e --arg id "${catalog_id}" '.data | any(.id == $id)'
psql --set ON_ERROR_STOP=1 --host 127.0.0.1 --username wppconnect --dbname wppconnect \
  --tuples-only --no-align --command "SELECT encrypted_source_credentials NOT LIKE '%ck_smoke%' AND encrypted_wpp_token NOT LIKE '%wpp-secret-token%' FROM catalog_connections WHERE id='${catalog_id}'" \
  | grep -qx 't'
curl --fail --silent --show-error --cookie "${cookie_jar}" --request DELETE \
  http://127.0.0.1:3000/api/catalog/connections/${catalog_id} >/dev/null

manifest_body='{"whatsappVersion":"2.3000.1","minimumPackageVersion":"3.20.0","recommendedPackageVersion":"3.21.0","capabilities":{"sendText":"supported","ptt":"degraded"},"featureFlags":{"useLegacyPtt":true},"workaroundUrl":"https://wppconnect.io/status","notes":"Declarative smoke manifest","expiresInSeconds":3600}'
manifest_response="$(curl --fail --silent --show-error --request PUT \
  --header "authorization: Bearer ${COMPATIBILITY_MANIFEST_ADMIN_SECRET}" \
  --header 'content-type: application/json' --data "${manifest_body}" \
  http://127.0.0.1:3000/api/internal/compatibility/manifests/%40wppconnect%2Fwa-js)"
jq -e '.data.payload.revision == 1 and .data.payload.featureFlags.useLegacyPtt == true and (.data.token | split(".") | length == 3)' <<<"${manifest_response}"
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/v1/compatibility/manifests/%40wppconnect%2Fwa-js/latest \
  | jq -e '.data.payload.package == "@wppconnect/wa-js" and .data.keyId == "smoke-key-1"'
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/v1/compatibility/keys/smoke-key-1 \
  | jq -e '.data.algorithm == "Ed25519" and (.data.publicKey | startswith("-----BEGIN PUBLIC KEY-----"))'
manifest_unauthorized="$(curl --silent --output /dev/null --write-out '%{http_code}' --request PUT \
  --header 'content-type: application/json' --data "${manifest_body}" \
  http://127.0.0.1:3000/api/internal/compatibility/manifests/%40wppconnect%2Fwa-js)"
test "${manifest_unauthorized}" = "401"
manifest_code_field_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --request PUT \
  --header "authorization: Bearer ${COMPATIBILITY_MANIFEST_ADMIN_SECRET}" \
  --header 'content-type: application/json' \
  --data '{"whatsappVersion":"2.3000.1","minimumPackageVersion":"3.20.0","recommendedPackageVersion":"3.21.0","capabilities":{},"featureFlags":{},"expiresInSeconds":3600,"remoteJavaScript":"alert(1)"}' \
  http://127.0.0.1:3000/api/internal/compatibility/manifests/%40wppconnect%2Fwa-js)"
test "${manifest_code_field_status}" = "400"

retention_unauthorized="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  http://127.0.0.1:3000/api/internal/telemetry/retention)"
test "${retention_unauthorized}" = "401"
curl --fail --silent --show-error --header "authorization: Bearer ${CRON_SECRET}" \
  http://127.0.0.1:3000/api/internal/telemetry/retention | jq -e '.deleted == 0'

app_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data '{"name":"Smoke Extension","offlineGraceSeconds":3600}' \
  http://127.0.0.1:3000/api/licensing/apps)"
app_id="$(jq -r '.data.id' <<<"${app_response}")"
jq -e '.data.publicKey | startswith("-----BEGIN PUBLIC KEY-----")' <<<"${app_response}"

plan_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data '{"slug":"pro","name":"Pro","currency":"USD","unitAmount":1900,"billingInterval":"month","entitlements":{"export":true},"limits":{"devices":1}}' \
  http://127.0.0.1:3000/api/licensing/apps/${app_id}/plans)"
plan_id="$(jq -r '.data.id' <<<"${plan_response}")"

license_response="$(curl --fail --silent --show-error --cookie "${cookie_jar}" \
  --header 'content-type: application/json' \
  --data "{\"planId\":\"${plan_id}\",\"maxInstallations\":1}" \
  http://127.0.0.1:3000/api/licensing/apps/${app_id}/licenses)"
license_id="$(jq -r '.data.id' <<<"${license_response}")"
license_key="$(jq -r '.licenseKey' <<<"${license_response}")"

activation_body="{\"appId\":\"${app_id}\",\"licenseKey\":\"${license_key}\",\"installationId\":\"smoke-device-one\"}"
curl --fail --silent --show-error --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/activate | jq -e '.valid == true and (.token | length > 100)'
curl --fail --silent --show-error --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/verify | jq -e '.valid == true'

second_activation_body="{\"appId\":\"${app_id}\",\"licenseKey\":\"${license_key}\",\"installationId\":\"smoke-device-two\"}"
second_activation_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' --data "${second_activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/activate)"
test "${second_activation_status}" = "409"

curl --fail --silent --show-error --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/heartbeat | jq -e '.valid == true'
curl --fail --silent --show-error --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/deactivate | jq -e '.deactivated == true'
deactivated_verify_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/verify)"
test "${deactivated_verify_status}" = "403"

curl --fail --silent --show-error --cookie "${cookie_jar}" --header 'content-type: application/json' \
  --data '{"status":"revoked"}' \
  http://127.0.0.1:3000/api/licensing/licenses/${license_id}/status | jq -e '.data.status == "revoked"'
revoked_license_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header 'content-type: application/json' --data "${activation_body}" \
  http://127.0.0.1:3000/api/v1/licenses/activate)"
test "${revoked_license_status}" = "403"

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

echo 'Platform smoke passed: sessions, API keys, usage, telemetry, catalog, signed compatibility manifest, retention, and licensing.'
