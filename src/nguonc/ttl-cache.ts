interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > Date.now()) return existing.value;

    const value = await loader();
    if (value !== undefined) this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}
