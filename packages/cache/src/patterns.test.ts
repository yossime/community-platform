import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the redis client
vi.mock('./client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn().mockResolvedValue([0, []]),
  },
}));

import { cacheGet, cacheSet, cacheDelete, cacheGetOrSet, invalidatePattern } from './patterns';
import { redis } from './client';

const mockedRedis = vi.mocked(redis);

describe('Cache Patterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cacheGet', () => {
    it('returns cached data when present', async () => {
      mockedRedis.get.mockResolvedValue({ id: 1, name: 'test' });
      const result = await cacheGet('test-key');
      expect(result).toEqual({ id: 1, name: 'test' });
      expect(mockedRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('returns null when cache miss', async () => {
      mockedRedis.get.mockResolvedValue(null);
      const result = await cacheGet('missing-key');
      expect(result).toBeNull();
    });
  });

  describe('cacheSet', () => {
    it('sets value with default TTL', async () => {
      await cacheSet('key', { data: 'value' });
      expect(mockedRedis.set).toHaveBeenCalledWith('key', { data: 'value' }, { ex: 300 });
    });

    it('sets value with custom TTL', async () => {
      await cacheSet('key', 'value', 60);
      expect(mockedRedis.set).toHaveBeenCalledWith('key', 'value', { ex: 60 });
    });
  });

  describe('cacheDelete', () => {
    it('deletes a key', async () => {
      await cacheDelete('key');
      expect(mockedRedis.del).toHaveBeenCalledWith('key');
    });
  });

  describe('cacheGetOrSet', () => {
    it('returns cached value if exists', async () => {
      mockedRedis.get.mockResolvedValue('cached-value');
      const fetcher = vi.fn();

      const result = await cacheGetOrSet('key', fetcher);
      expect(result).toBe('cached-value');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('calls fetcher and caches result on miss', async () => {
      mockedRedis.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue('fresh-value');

      const result = await cacheGetOrSet('key', fetcher);
      expect(result).toBe('fresh-value');
      expect(fetcher).toHaveBeenCalled();
      expect(mockedRedis.set).toHaveBeenCalledWith('key', 'fresh-value', { ex: 300 });
    });

    it('uses custom TTL when provided', async () => {
      mockedRedis.get.mockResolvedValue(null);
      const fetcher = vi.fn().mockResolvedValue('data');

      await cacheGetOrSet('key', fetcher, 3600);
      expect(mockedRedis.set).toHaveBeenCalledWith('key', 'data', { ex: 3600 });
    });
  });

  describe('invalidatePattern', () => {
    it('deletes matching keys', async () => {
      mockedRedis.scan.mockResolvedValueOnce(['0', ['cache:user:1', 'cache:user:2']]);
      await invalidatePattern('cache:user:*');
      expect(mockedRedis.del).toHaveBeenCalledWith('cache:user:1', 'cache:user:2');
    });

    it('handles no matching keys', async () => {
      mockedRedis.scan.mockResolvedValueOnce(['0', []]);
      await invalidatePattern('cache:empty:*');
      expect(mockedRedis.del).not.toHaveBeenCalled();
    });
  });
});
