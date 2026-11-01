import { ShortReadCache } from './short-read-cache';

describe('cache curto de polling', () => {
  it('coalesce leituras concorrentes sem misturar tenants', async () => {
    const cache = new ShortReadCache();
    const load = jest.fn(async () => ['tenant-a']);
    const [a, b, other] = await Promise.all([cache.get('a', load), cache.get('a', load), cache.get('b', async () => ['tenant-b'])]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b); expect(other).not.toEqual(a);
  });
  it('não guarda falhas e expira dados', async () => {
    jest.useFakeTimers();
    try {
      const cache = new ShortReadCache();
      await expect(cache.get('a', async () => { throw new Error('offline'); })).rejects.toThrow();
      const load = jest.fn(async () => 'ok');
      await cache.get('a', load); await cache.get('a', load);
      jest.advanceTimersByTime(501);
      await cache.get('a', load);
      expect(load).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });
});
