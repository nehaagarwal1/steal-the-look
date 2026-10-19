// Tiny in-memory cache so repeated try-ons of the same product on the same
// selfie don't spend YouCam units. Fine for a hackathon (single instance);
// swap for Redis/KV if you deploy multiple instances.

const store = new Map<string, { value: unknown; expires: number }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export const HOUR = 60 * 60 * 1000;
