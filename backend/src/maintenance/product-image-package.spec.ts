import sharp from 'sharp';
import { changeImageLink, IMAGE_URL_PREFIX, ImagePackageStore, ProductImagePackage, sha256, validateAsset, validatePackage } from './product-image-package';
import { mysqlImageStore, assertImageId, safeDatabase } from './product-image-store';

const oldId = '11111111-1111-4111-8111-111111111111', newId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333', productId = '44444444-4444-4444-8444-444444444444';
const oldUrl = IMAGE_URL_PREFIX + oldId, newUrl = IMAGE_URL_PREFIX + newId;
let data: Buffer, p: ProductImagePackage;

function fakeStore() {
  let state = { url: oldUrl, images: new Map([[oldId, { hash: p.assets[0].oldHash, bytes: p.assets[0].oldBytes }]]) };
  let snapshot = state;
  const store: ImagePackageStore = {
    begin: jest.fn(async () => { snapshot = { url: state.url, images: new Map(state.images) }; }),
    commit: jest.fn(async () => {}), rollback: jest.fn(async () => { state = snapshot; }),
    productImage: jest.fn(async () => state.url), imageInfo: jest.fn(async id => state.images.get(id)),
    insertImage: jest.fn(async (id, bytes) => { state.images.set(id, { hash: sha256(bytes), bytes: bytes.length }); }),
    compareAndSwap: jest.fn(async (_id, expected, replacement) => { if (state.url !== expected) return false; state.url = replacement; return true; }),
  };
  return { store, get state() { return state; } };
}

beforeAll(async () => {
  data = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'blue' } }).webp().toBuffer();
});
beforeEach(() => {
  p = { version: 1, policy: 'product-webp-800-v1', createdAt: new Date().toISOString(), tenantId, databaseName: 'zoio_beer',
    assets: [{ oldId, oldHash: sha256('original'), oldBytes: 5000, newId, newHash: sha256(data), bytes: data.length, width: 40, height: 20 }],
    entries: [{ productId, oldUrl, assetId: newId }] };
});

describe('tenant-scoped image package (no real databases)', () => {
  it('default simulation never inserts, updates or commits', async () => {
    const h = fakeStore();
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply')).toBe('eligible_apply');
    expect(h.store.insertImage).not.toHaveBeenCalled(); expect(h.store.compareAndSwap).not.toHaveBeenCalled();
    expect(h.store.commit).not.toHaveBeenCalled(); expect(h.state.url).toBe(oldUrl);
  });
  it('applies selectively, replays idempotently, rolls back and preserves both images', async () => {
    const h = fakeStore();
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply', false)).toBe('applied');
    expect(h.state.url).toBe(newUrl); expect(h.state.images.size).toBe(2);
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply', false)).toBe('already_applied');
    expect(h.store.insertImage).toHaveBeenCalledTimes(1);
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'rollback', false)).toBe('reverted');
    expect(h.state.url).toBe(oldUrl); expect(h.state.images.size).toBe(2);
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'rollback', false)).toBe('already_reverted');
  });
  it('never overwrites a newer client photo, including during rollback', async () => {
    const h = fakeStore(); h.state.url = '/new-client-photo.jpg';
    for (const direction of ['apply', 'rollback'] as const) {
      expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, direction, false)).toBe('conflict');
    }
    expect(h.store.insertImage).not.toHaveBeenCalled(); expect(h.store.compareAndSwap).not.toHaveBeenCalled();
  });
  it('detects changed source data and ID collision without writing', async () => {
    const h = fakeStore(); h.state.images.set(oldId, { hash: sha256('changed'), bytes: 5000 });
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply', false)).toBe('source_changed');
    const collision = fakeStore(); collision.state.images.set(newId, { hash: sha256('another'), bytes: 20 });
    expect(await changeImageLink(collision.store, p.entries[0], p.assets[0], data, 'apply', false)).toBe('target_changed');
    expect(collision.store.compareAndSwap).not.toHaveBeenCalled();
  });
  it('rolls back the inserted image when link CAS fails', async () => {
    const h = fakeStore(); (h.store.compareAndSwap as jest.Mock).mockResolvedValue(false);
    expect(await changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply', false)).toBe('conflict');
    expect(h.state.images.has(newId)).toBe(false); expect(h.state.url).toBe(oldUrl);
  });
  it('propagates database failure with rollback, not false success', async () => {
    const h = fakeStore(); (h.store.insertImage as jest.Mock).mockRejectedValue(Error('db failure'));
    await expect(changeImageLink(h.store, p.entries[0], p.assets[0], data, 'apply', false)).rejects.toThrow('db failure');
    expect(h.state.url).toBe(oldUrl); expect(h.store.commit).not.toHaveBeenCalled();
  });
  it('validates hashes and actual optimized bytes', async () => {
    await expect(validateAsset(p.assets[0], data)).resolves.toBeUndefined();
    await expect(validateAsset(p.assets[0], Buffer.from('corrupted'))).rejects.toThrow('ASSET_CHECKSUM');
  });
  it('rejects traversal, SQL identifiers, duplicate products and mismatched source URLs', () => {
    expect(validatePackage(p)).toBe(p);
    for (const mutated of [
      { ...p, databaseName: 'db`; DELETE FROM products' },
      { ...p, assets: [{ ...p.assets[0], newId: '../../secret' }] },
      { ...p, entries: [...p.entries, ...p.entries] },
      { ...p, entries: [{ ...p.entries[0], oldUrl: IMAGE_URL_PREFIX + newId }] },
    ]) expect(() => validatePackage(mutated)).toThrow();
  });
  it('SQL adapter uses read-only transactions in simulation and refuses mutators', async () => {
    const c: any = { query: jest.fn(), execute: jest.fn().mockResolvedValue([[]]), rollback: jest.fn(), commit: jest.fn() };
    const store = mysqlImageStore(c, 'zoio_beer', true); await store.begin();
    expect(c.query).toHaveBeenCalledWith('START TRANSACTION READ ONLY');
    await expect(store.insertImage(newId, data)).rejects.toThrow('READ_ONLY');
    await expect(store.compareAndSwap(productId, oldUrl, newUrl)).rejects.toThrow('READ_ONLY');
    expect(c.execute).not.toHaveBeenCalled();
  });
  it('SQL write adapter scopes updates to explicit tenant table, product and exact previous URL', async () => {
    const c: any = { execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await mysqlImageStore(c, 'zoio_beer', false).compareAndSwap(productId, oldUrl, newUrl);
    const [sql, values] = c.execute.mock.calls[0];
    expect(sql).toContain('UPDATE `zoio_beer`.products'); expect(sql).toContain('BINARY imageUrl=BINARY ?');
    expect(values).toEqual([newUrl, productId, oldUrl]); expect(sql).not.toMatch(/sales|stock|payments/);
  });
  it('rejects arbitrary job paths and database identifiers before connecting', () => {
    expect(() => assertImageId('../secrets')).toThrow('INVALID_ID');
    expect(() => safeDatabase('heart`; DROP TABLE images')).toThrow('INVALID_DATABASE');
  });
});
