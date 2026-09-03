export interface LicenseClaims {
  v: 1; appId: string; licenseId: string; installationHash?: string;
  entitlements: Record<string, unknown>; limits: Record<string, unknown>;
  iat: number; exp: number; offlineUntil: number;
}
export interface LicenseClientOptions {
  baseUrl: string; appId: string; publicKey: string; installationId?: string;
  fetch?: typeof fetch; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}
export class WppLicenseClient {
  configure(options: LicenseClientOptions): this;
  verifyLicense(licenseKey: string, options?: { installationId?: string; activate?: boolean }): Promise<{
    valid: true; source: 'server' | 'offline-cache'; claims: LicenseClaims; token: string;
  }>;
}
export const waAuth: WppLicenseClient;
export function verifyCredential(token: string, publicKey: string, allowOffline?: boolean): Promise<LicenseClaims>;
