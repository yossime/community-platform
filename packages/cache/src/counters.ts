import { redis } from './client';

export async function incrementCounter(entityType: string, entityId: string, field: string, amount = 1): Promise<void> {
  const key = `counter:${entityType}:${entityId}`;
  await redis.hincrby(key, field, amount);
}

export async function getCounter(entityType: string, entityId: string, field: string): Promise<number> {
  const value = await redis.hget<number>(`counter:${entityType}:${entityId}`, field);
  return value ?? 0;
}

export async function getAllCounters(entityType: string, entityId: string): Promise<Record<string, number>> {
  const key = `counter:${entityType}:${entityId}`;
  const data = await redis.hgetall<Record<string, number>>(key);
  return data ?? {};
}

export async function flushCounterToDB(
  entityType: string,
  entityId: string,
  flush: (counters: Record<string, number>) => Promise<void>,
): Promise<void> {
  const key = `counter:${entityType}:${entityId}`;
  const counters = await redis.hgetall<Record<string, number>>(key);
  if (!counters || Object.keys(counters).length === 0) return;
  await flush(counters);
  await redis.del(key);
}
