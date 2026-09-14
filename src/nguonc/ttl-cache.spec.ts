import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  it('does not retain a rejected upstream result', async () => {
    const cache = new TtlCache();
    const loader = vi.fn().mockRejectedValueOnce(new Error('upstream failed')).mockResolvedValueOnce('fresh');

    await expect(cache.getOrLoad('film', 60_000, loader)).rejects.toThrow('upstream failed');
    await expect(cache.getOrLoad('film', 60_000, loader)).resolves.toBe('fresh');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not retain an unavailable optional value', async () => {
    const cache = new TtlCache();
    const loader = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce('available');

    await expect(cache.getOrLoad('stream', 60_000, loader)).resolves.toBeUndefined();
    await expect(cache.getOrLoad('stream', 60_000, loader)).resolves.toBe('available');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
