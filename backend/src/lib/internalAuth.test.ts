import { describe, expect, test } from 'bun:test';
import { acceptsBearerSecret } from './internalAuth';

describe('internal bearer authentication', () => {
  test('accepts only an exact configured bearer secret', () => {
    expect(acceptsBearerSecret('Bearer cron-secret', 'cron-secret')).toBe(true);
    expect(acceptsBearerSecret('Bearer wrong', 'cron-secret')).toBe(false);
    expect(acceptsBearerSecret('Basic cron-secret', 'cron-secret')).toBe(false);
    expect(acceptsBearerSecret(null, 'cron-secret')).toBe(false);
    expect(acceptsBearerSecret('Bearer cron-secret', '')).toBe(false);
  });
});
