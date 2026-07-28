import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
    incrby: vi.fn().mockResolvedValue(5),
    get: vi.fn().mockResolvedValue('10'),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn().mockResolvedValue([]),
    scan: vi.fn().mockResolvedValue([0, []]),
  },
}));

import { redis } from './client';

const mockedRedis = vi.mocked(redis);

describe('Redis Counter Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('increment', () => {
    it('increments a counter by 1', async () => {
      const result = await redis.incr('counter:views:thread-1');
      expect(result).toBe(1);
      expect(mockedRedis.incr).toHaveBeenCalledWith('counter:views:thread-1');
    });
  });

  describe('batch increment', () => {
    it('increments by specified amount', async () => {
      const result = await redis.incrby('counter:posts:forum-1', 5);
      expect(result).toBe(5);
    });
  });

  describe('get counter', () => {
    it('retrieves counter value', async () => {
      const result = await redis.get('counter:views:thread-1');
      expect(result).toBe('10');
    });
  });
});
