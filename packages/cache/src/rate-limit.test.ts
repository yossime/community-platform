import { describe, it, expect } from 'vitest';

// Test rate limit configurations are correct
describe('Rate Limit Configuration', () => {
  it('should export all rate limiters', async () => {
    // Dynamic import to avoid mock issues with redis
    const module = await import('./rate-limit');
    expect(module.authRateLimit).toBeDefined();
    expect(module.contentCreationRateLimit).toBeDefined();
    expect(module.searchRateLimit).toBeDefined();
    expect(module.uploadRateLimit).toBeDefined();
    expect(module.apiRateLimit).toBeDefined();
  });
});
