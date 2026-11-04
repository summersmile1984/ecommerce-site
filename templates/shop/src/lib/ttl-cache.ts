/** Tiny TTL cache used for SSR-side data memos (invalidation + expiry). */
export interface TtlCache<T> {
  set(key: string, value: T, storedAt?: number): void;
  get(key: string, now?: number): T | null;
  clear(): void;
  size(): number;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const map = new Map<string, { value: T; storedAt: number }>();
  return {
    set(key, value, storedAt = Date.now()) {
      map.set(key, { value, storedAt });
    },
    get(key, now = Date.now()) {
      const entry = map.get(key);
      if (!entry) return null;
      if (now - entry.storedAt > ttlMs) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    clear() {
      map.clear();
    },
    size() {
      return map.size;
    },
  };
}
