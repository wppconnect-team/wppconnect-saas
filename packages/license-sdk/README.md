# `@wppconnect/license-sdk`

Local-first license verification for browser extensions and other WPPConnect
integrations. The SDK validates short-lived Ed25519 credentials locally and
contacts the control plane for activation and authoritative verification.

```js
import { waAuth } from "@wppconnect/license-sdk";

waAuth.configure({
  baseUrl: "https://wppconnect-control-plane.vercel.app",
  appId: "your-app-id",
  publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  installationId: "stable-random-installation-id",
});

const license = await waAuth.verifyLicense("wpp_lic_...", { activate: true });
if (license.claims.entitlements.export) {
  // Enable the licensed capability.
}
```

After activation, use `verifyLicense()` without `activate` for routine checks.
If the server is temporarily unavailable, a previously verified credential may
be used only until its signed `offlineUntil` limit. Explicit revocation or any
other authoritative server rejection clears the local cache.

Client-side licensing raises the cost of casual misuse but cannot make browser
extension code impossible to bypass. Keep high-value operations and sensitive
data behind server-side entitlement checks.
