import { redis } from '../db/redis';

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function del(key: string): Promise<void> {
  await redis.del(key);
}

export function dashboardCacheKey(userId: string): string {
  return `dashboard:${userId}`;
}
