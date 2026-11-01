import { createHash } from 'crypto';
import sharp from 'sharp';
import { IMAGE_OUTPUT_BYTES, IMAGE_OUTPUT_EDGE, PRODUCT_IMAGE_POLICY } from '../images/product-image.optimizer';

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export const IMAGE_URL_PREFIX = '/api/products/uploads/images/';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
export interface ImagePackageAsset {
  oldId: string; oldHash: string; oldBytes: number;
  newId: string; newHash: string; bytes: number; width: number; height: number;
}
export interface ImagePackageEntry { productId: string; oldUrl: string; assetId: string }
export interface ProductImagePackage {
  version: 1; policy: typeof PRODUCT_IMAGE_POLICY; createdAt: string;
  tenantId: string; databaseName: string;
  assets: ImagePackageAsset[]; entries: ImagePackageEntry[];
}

export function validatePackage(value: unknown): ProductImagePackage {
  const p = value as ProductImagePackage;
  if (!p || p.version !== 1 || p.policy !== PRODUCT_IMAGE_POLICY || !uuid.test(p.tenantId) ||
      !/^[a-zA-Z0-9_]{1,64}$/.test(p.databaseName) || !Array.isArray(p.assets) || !Array.isArray(p.entries) ||
      !p.assets.length || p.assets.length > 10000 || !p.entries.length || p.entries.length > 10000) throw Error('INVALID_PACKAGE');
  const ids = new Set<string>(), oldIds = new Set<string>(), products = new Set<string>();
  for (const a of p.assets) {
    if (!a || !uuid.test(a.oldId) || !uuid.test(a.newId) || a.oldId === a.newId || ids.has(a.newId) || oldIds.has(a.oldId) ||
        !hash.test(a.oldHash) || !hash.test(a.newHash) || !Number.isSafeInteger(a.bytes) || a.bytes <= 0 || a.bytes > IMAGE_OUTPUT_BYTES ||
        !Number.isSafeInteger(a.oldBytes) || a.oldBytes <= a.bytes ||
        !Number.isInteger(a.width) || !Number.isInteger(a.height) || a.width < 1 || a.height < 1 ||
        a.width > IMAGE_OUTPUT_EDGE || a.height > IMAGE_OUTPUT_EDGE) throw Error('INVALID_ASSET');
    ids.add(a.newId); oldIds.add(a.oldId);
  }
  if ([...ids].some(id => oldIds.has(id))) throw Error('OVERLAPPING_IMAGE_IDENTITIES');
  const assetsById = new Map(p.assets.map(a => [a.newId, a]));
  const referenced = new Set<string>();
  for (const e of p.entries) {
    const a = assetsById.get(e?.assetId);
    if (!e || !a || !uuid.test(e.productId) || products.has(e.productId) ||
        // Accept original absolute URLs, but require exact immutable source ID (no query/fragment).
        !new RegExp('^(?:https?://[^/?#]+)?' + IMAGE_URL_PREFIX + a.oldId + '$', 'i').test(e.oldUrl)) throw Error('INVALID_ENTRY');
    products.add(e.productId);
    referenced.add(e.assetId);
  }
  if (p.assets.some(a => !referenced.has(a.newId))) throw Error('UNREFERENCED_ASSET');
  return p;
}

export async function validateAsset(a: ImagePackageAsset, data: Buffer) {
  if (data.length !== a.bytes || sha256(data) !== a.newHash) throw Error('ASSET_CHECKSUM_MISMATCH');
  const m = await sharp(data, { limitInputPixels: IMAGE_OUTPUT_EDGE ** 2, failOn: 'warning' }).metadata();
  if (m.format !== 'webp' || (m.pages || 1) !== 1 || m.width !== a.width || m.height !== a.height || m.exif) throw Error('INVALID_OPTIMIZED_IMAGE');
  // Decode the small optimized image too; valid metadata alone does not prove intact pixel data.
  await sharp(data, { limitInputPixels: IMAGE_OUTPUT_EDGE ** 2, failOn: 'warning' }).timeout({ seconds: 8 }).raw().toBuffer();
}

// One transaction on the SAME MySQL server across tenant.products and Heart.images.
// No schema changes, sale writes, image updates or image deletion in this interface.
export interface ImagePackageStore {
  begin(): Promise<void>; commit(): Promise<void>; rollback(): Promise<void>;
  productImage(productId: string): Promise<string | null | undefined>;
  imageInfo(id: string): Promise<{ hash: string; bytes: number } | undefined>;
  insertImage(id: string, data: Buffer): Promise<void>;
  compareAndSwap(productId: string, expected: string, replacement: string): Promise<boolean>;
}
export type ImagePackageOutcome = 'eligible_apply' | 'eligible_rollback' | 'applied' | 'already_applied' | 'reverted' | 'already_reverted' | 'conflict' | 'source_changed' | 'target_changed';

export async function changeImageLink(store: ImagePackageStore, entry: ImagePackageEntry, asset: ImagePackageAsset,
  data: Buffer, direction: 'apply' | 'rollback', dryRun = true): Promise<ImagePackageOutcome> {
  const nextUrl = IMAGE_URL_PREFIX + asset.newId;
  await store.begin();
  try {
    const current = await store.productImage(entry.productId);
    const source = await store.imageInfo(asset.oldId);
    if (!source || source.hash !== asset.oldHash || source.bytes !== asset.oldBytes) { await store.rollback(); return 'source_changed'; }
    const target = await store.imageInfo(asset.newId);
    if (target && (target.hash !== asset.newHash || target.bytes !== asset.bytes)) { await store.rollback(); return 'target_changed'; }
    if (direction === 'apply' && current === nextUrl && target) { await store.rollback(); return 'already_applied'; }
    if (direction === 'rollback' && current === entry.oldUrl) { await store.rollback(); return 'already_reverted'; }
    const expected = direction === 'apply' ? entry.oldUrl : nextUrl;
    if (current !== expected || (direction === 'rollback' && !target)) { await store.rollback(); return 'conflict'; }
    if (dryRun) {
      if (direction === 'apply' && !target) await validateAsset(asset, data);
      await store.rollback();
      return direction === 'apply' ? 'eligible_apply' : 'eligible_rollback';
    }
    if (direction === 'apply' && !target) {
      // Hash validation repeated at the write boundary, not trusted from manifest.
      await validateAsset(asset, data);
      await store.insertImage(asset.newId, data);
    }
    if (!await store.compareAndSwap(entry.productId, expected, direction === 'apply' ? nextUrl : entry.oldUrl)) {
      await store.rollback(); return 'conflict';
    }
    await store.commit();
    return direction === 'apply' ? 'applied' : 'reverted';
  } catch (error) { await store.rollback(); throw error; }
}
