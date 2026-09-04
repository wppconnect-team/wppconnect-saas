import { describe, expect, test } from 'bun:test';
import { resolveLicenseUsageWindow } from './licenseUsage';

describe('license usage window', () => {
  test('defaults to the last 30 UTC calendar days', () => {
    expect(resolveLicenseUsageWindow(undefined, undefined, new Date('2026-09-04T23:30:00-03:00')))
      .toEqual({ from: '2026-08-07', to: '2026-09-05' });
  });

  test('accepts an inclusive custom window', () => {
    expect(resolveLicenseUsageWindow('2026-01-01', '2026-12-31'))
      .toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  test('rejects invalid, inverted, and oversized windows', () => {
    expect(() => resolveLicenseUsageWindow('2026-02-30', '2026-03-01')).toThrow('Data inválida');
    expect(() => resolveLicenseUsageWindow('2026-03-02', '2026-03-01')).toThrow('anterior');
    expect(() => resolveLicenseUsageWindow('2025-01-01', '2026-01-02')).toThrow('366 dias');
  });
});
