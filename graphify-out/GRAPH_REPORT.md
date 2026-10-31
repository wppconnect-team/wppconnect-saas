# Graph Report - wppconnect-saas  (2026-10-31)

## Corpus Check
- 122 files · ~79,836 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 412 nodes · 585 edges · 55 communities (48 shown, 7 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c4e6c16`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `WppTelemetryClient` - 20 edges
2. `number()` - 18 edges
3. `PostgresMediaRepository` - 18 edges
4. `MemoryRepository` - 16 edges
5. `hashOpaqueToken()` - 14 edges
6. `isPrivateUrl()` - 13 edges
7. `EncryptedStorage` - 10 edges
8. `MediaWorker` - 10 edges
9. `WppCatalogDestination` - 9 edges
10. `canonicalJson()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `minor()` --calls--> `number()`  [INFERRED]
  backend/src/lib/catalogSync.ts → packages/telemetry-sdk/src/validation.js
- `req()` --calls--> `fetch()`  [INFERRED]
  frontend/src/services/api.js → packages/telemetry-sdk/test/reliability.test.js
- `parseInput()` --calls--> `number()`  [INFERRED]
  services/media-api/src/app.ts → packages/telemetry-sdk/src/validation.js
- `imageDataUrl()` --calls--> `number()`  [INFERRED]
  backend/src/lib/catalogConnectors.ts → packages/telemetry-sdk/src/validation.js
- `boundedInt()` --calls--> `number()`  [INFERRED]
  backend/src/lib/telemetry.ts → packages/telemetry-sdk/src/validation.js

## Communities (55 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (24): verifyTurnstile(), authorize(), bearer(), createApp(), grants(), parseInput(), command(), convertToPtt() (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (23): assertBaseUrl(), checkedJson(), fetchShopifyProducts(), fetchWooProducts(), imageDataUrl(), WppCatalogDestination, minor(), normalizeShopifyProduct() (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (4): gzip(), memoryStorage(), queueLock(), WppTelemetryClient

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (15): addMonthsClamped(), resolveSandboxBillingEvent(), dateOnly(), readLicenseUsage(), recordLicenseUsage(), resolveLicenseUsageWindow(), utcDate(), createLicenseKey() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): clientIpFromHeaders(), createRotationMaterial(), createSessionMaterial(), sendPasswordResetEmail(), assertUsageQuantity(), createApiCredential(), entitlementForScope(), grantsScope() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (10): ContatosPage(), DashboardPage(), GruposPage(), WebhooksPage(), loadConfig(), positiveInt(), secret(), keys() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (6): clearDemo(), isDemo(), req(), setDemo(), App(), useTweaks()

### Community 9 - "Community 9"
Cohesion: 0.27
Nodes (10): canonicalize(), canonicalJson(), signCompatibilityPayload(), transitionCompatibilityMonitor(), verifyCompatibilitySignature(), incidentPayload(), queueIncidentEvent(), claimDeliveries() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (5): acceptsBearerSecret(), boundedInt(), exactKeys(), parseTelemetryBatch(), validateSnapshot()

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (8): applyMigrationPlan(), loadMigrationPlan(), resolveMigrationDirectory(), runMigrations(), generateTempPassword(), runSetup(), startCatalogSyncWorker(), startCompatibilityWebhookWorker()

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (7): compatibilityManifestPublicKey(), createCompatibilityManifestKeys(), encode(), issueCompatibilityManifest(), verifyCompatibilityManifest(), manifestConfig(), normalizedPem()

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (5): base64urlBytes(), defaultStorage(), pemBytes(), verifyCredential(), WppLicenseClient

## Knowledge Gaps
- **2 isolated node(s):** `WppLicenseClient`, `WppTelemetryClient`
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch()` connect `Community 0` to `Community 1`, `Community 2`, `Community 9`, `Community 6`?**
  _High betweenness centrality (0.254) - this node is a cross-community bridge._
- **Why does `number()` connect `Community 5` to `Community 0`, `Community 1`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Why does `processCatalogWebhookBatch()` connect `Community 1` to `Community 0`, `Community 9`, `Community 5`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `number()` (e.g. with `imageDataUrl()` and `minor()`) actually correct?**
  _`number()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `hashOpaqueToken()` (e.g. with `createSessionMaterial()` and `createRotationMaterial()`) actually correct?**
  _`hashOpaqueToken()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `WppLicenseClient`, `WppTelemetryClient` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._