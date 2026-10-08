import { describe, expect, it } from 'vitest';

import { getHealthStatus } from '../src/modules/health/health.service.js';

describe('getHealthStatus', () => {
  it('trả về trạng thái ok', () => {
    const result = getHealthStatus();

    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
