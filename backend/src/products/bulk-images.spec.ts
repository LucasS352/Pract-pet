import { Readable } from 'stream';
import multer = require('multer');
import { ProductsService } from './products.service';
import { productImageOptimizer } from '../images/product-image.optimizer';
import { bulkImageIdentities, decodeLegacyImageName, BULK_IMAGE_MAX_BYTES, BULK_IMAGE_MAX_FILES } from './bulk-images.helper';

const name = 'Álcool Etílico Líquido 70° Frasco 1L.jpg';
const file = (originalname = name, size = 1) => ({ originalname, size, mimetype: 'image/jpeg', buffer: Buffer.from('x') }) as Express.Multer.File;
const manifest = (names = [name]) => JSON.stringify(names.map((fileName, i) => ({ fileId: `image-${i}`, fileName })));

function harness(names = [name.replace(/\.jpg$/, '')]) {
  const product = {
    findMany: jest.fn().mockResolvedValue(names.map((name, i) => ({ id: `p-${i}`, name, imageUrl: null }))),
    update: jest.fn().mockResolvedValue({}),
  };
  const image = { create: jest.fn().mockResolvedValue({ id: 'img' }) };
  const service = new ProductsService({ getTenantClient: async () => ({ product }) } as any,
    { get: () => ({ tenantId: 'test', databaseUrl: 'unused' }) } as any, { image } as any, {} as any);
  return { service, product, image };
}

async function multipart(wireNames: string[], metadata?: string) {
  const boundary = 'test-bulk-images';
  const fields = metadata ? `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${metadata}\r\n` : '';
  const body = Buffer.from(fields + wireNames.map(wireName =>
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${wireName}"\r\nContent-Type: image/jpeg\r\n\r\nx\r\n`
  ).join('') + `--${boundary}--\r\n`, 'utf8');
  const req: any = Readable.from([body]);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) };
  req.method = 'POST';
  await new Promise<void>((resolve, reject) => multer({ limits: { fileSize: BULK_IMAGE_MAX_BYTES, files: BULK_IMAGE_MAX_FILES, fields: 1, fieldSize: 16 * 1024 } })
    .array('files', BULK_IMAGE_MAX_FILES)(req, {} as any, error => error ? reject(error) : resolve()));
  return { files: req.files as Express.Multer.File[], manifest: req.body.manifest };
}

describe('bulk images — synthetic multipart and mocked databases only', () => {
  beforeEach(() => jest.spyOn(productImageOptimizer, 'optimize').mockResolvedValue({
    data: Buffer.from('optimized-webp'), mimeType: 'image/webp', width: 20, height: 20,
    originalBytes: 1, policy: 'product-webp-800-v1',
  }));
  afterEach(() => jest.restoreAllMocks());
  it('round-trips accented UTF-8 names through installed Multer and matches by ID', async () => {
    const parsed = await multipart(['image-0'], manifest());
    const h = harness();
    const result = await h.service.bulkImageUpload('test', parsed.files, parsed.manifest);
    expect(result.matched).toBe(1);
    expect(result.details.matched[0]).toMatchObject({ fileId: 'image-0', fileName: name, productId: 'p-0' });
    expect(h.product.update).toHaveBeenCalledTimes(1);
  });
  it('repairs legacy multipart names without damaging normal Unicode', async () => {
    const parsed = await multipart([name]);
    expect(parsed.files[0].originalname).not.toBe(name);
    const result = await harness().service.bulkImageUpload('test', parsed.files);
    expect(result.details.matched[0].fileName).toBe(name);
    for (const normal of [name, 'Açúcar.jpg', 'Água.jpg', 'Café.jpg', '水.jpg', 'Coca.jpg']) {
      expect(decodeLegacyImageName(normal)).toBe(normal);
    }
  });
  it('rejects invalid metadata, duplicate IDs, reordering and oversized batches before database access', async () => {
    const h = harness();
    await expect(h.service.bulkImageUpload('test', [file('image-0')], '{')).rejects.toThrow();
    expect(() => bulkImageIdentities([file('wrong')], manifest())).toThrow();
    expect(() => bulkImageIdentities([file('image-0'), file('image-0')], JSON.stringify([
      { fileId: 'image-0', fileName: name }, { fileId: 'image-0', fileName: name },
    ]))).toThrow();
    expect(() => bulkImageIdentities([file(name, BULK_IMAGE_MAX_BYTES), file('a.jpg')])).toThrow();
    expect(() => bulkImageIdentities([{ ...file(), mimetype: 'text/html' }])).toThrow();
    expect(h.product.findMany).not.toHaveBeenCalled();
  });
  it('limits file count in actual multipart middleware', async () => {
    await expect(multipart(Array.from({ length: 11 }, (_, i) => `file-${i}`))).rejects.toBeDefined();
  });
  it('does not pick arbitrary products for ambiguous partial or normalized exact matches', async () => {
    for (const names of [['Água 500ml', 'Água 1L'], ['Açúcar', 'Acucar']]) {
      const h = harness(names);
      const result = await h.service.bulkImageUpload('test', [file(names.length && names[0].startsWith('Água') ? 'Água.jpg' : 'Acucar.jpg')]);
      expect(result.errors).toBe(1);
      expect(h.image.create).not.toHaveBeenCalled();
    }
  });
  it('keeps exact match priority and does not match an empty normalized name', async () => {
    const h = harness(['Água', 'Água 500ml']);
    expect((await h.service.bulkImageUpload('test', [file('Água.jpg')])).matched).toBe(1);
    const result = await h.service.bulkImageUpload('test', [file('---.jpg')]);
    expect(result.notFound).toBe(1);
    expect(h.image.create).toHaveBeenCalledTimes(1);
  });
  it('returns a terminal result for every ID despite per-file persistence errors', async () => {
    const h = harness(['Primeiro', 'Segundo']);
    h.product.update.mockRejectedValueOnce(new Error('database unavailable'));
    const result = await h.service.bulkImageUpload('test', [file('image-0'), file('image-1'), file('image-2')],
      manifest(['Primeiro.jpg', 'Segundo.jpg', 'Ausente.jpg']));
    expect(result.details.errors[0].fileId).toBe('image-0');
    expect(result.details.matched[0].fileId).toBe('image-1');
    expect(result.details.notFound[0].fileId).toBe('image-2');
  });
  it('stores only optimized bytes in both upload paths and never falls back on codec failure', async () => {
    const h = harness();
    await h.service.uploadPhoto('test', file());
    expect(h.image.create.mock.calls[0][0].data).toMatchObject({ data: Buffer.from('optimized-webp'), mimeType: 'image/webp' });
    (productImageOptimizer.optimize as jest.Mock).mockRejectedValueOnce(new Error('invalid image'));
    await expect(h.service.uploadPhoto('test', file())).rejects.toThrow('invalid image');
    expect(h.image.create).toHaveBeenCalledTimes(1);
    (productImageOptimizer.optimize as jest.Mock).mockRejectedValueOnce(new Error('invalid image'));
    const result = await h.service.bulkImageUpload('test', [file()]);
    expect(result.errors).toBe(1);
    expect(h.image.create).toHaveBeenCalledTimes(1);
    expect(h.product.update).not.toHaveBeenCalled();
  });
});
