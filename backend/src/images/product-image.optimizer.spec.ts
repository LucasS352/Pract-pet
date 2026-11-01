import sharp from 'sharp';
import { IMAGE_INPUT_BYTES, IMAGE_OUTPUT_BYTES, ProductImageOptimizer } from './product-image.optimizer';
import { ImageUploadAdmissionInterceptor } from './image-upload.interceptor';
import { Subject, lastValueFrom, of, throwError } from 'rxjs';

describe('bounded product image optimization (synthetic images only)', () => {
  const optimizer = new ProductImageOptimizer();
  it('reduces a large JPEG to WebP <=800px /200KiB without cropping', async () => {
    const input = await sharp({ create: { width: 4624, height: 3468, channels: 3, background: '#ac7020' } }).jpeg().toBuffer();
    const result = await optimizer.optimize(input);
    const m = await sharp(result.data).metadata();
    expect(m.format).toBe('webp'); expect(m.width).toBe(800); expect(m.height).toBe(600);
    expect(result.data.length).toBeLessThanOrEqual(IMAGE_OUTPUT_BYTES);
    expect(result.data.length).toBeLessThan(input.length);
  });
  it('preserves alpha and never enlarges a small image', async () => {
    const input = await sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 1, g: 20, b: 30, alpha: 0.4 } } }).png().toBuffer();
    const result = await optimizer.optimize(input);
    const m = await sharp(result.data).metadata();
    expect(m.width).toBe(80); expect(m.height).toBe(40); expect(m.hasAlpha).toBe(true);
  });
  it('corrects EXIF orientation and strips metadata', async () => {
    const input = await sharp({ create: { width: 1600, height: 800, channels: 3, background: 'red' } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await optimizer.optimize(input);
    const m = await sharp(result.data).metadata();
    expect([m.width, m.height]).toEqual([400, 800]); expect(m.exif).toBeUndefined(); expect(m.orientation).toBeUndefined();
  });
  it('rejects empty, oversized, SVG and invalid disguised input without passing through originals', async () => {
    for (const input of [Buffer.alloc(0), Buffer.alloc(IMAGE_INPUT_BYTES + 1), Buffer.from('not a jpeg'), Buffer.from('<svg width="20" height="20"></svg>')]) {
      await expect(optimizer.optimize(input)).rejects.toBeDefined();
    }
  });
  it('bounds the waiting queue and releases it after failures', async () => {
    const gated = new ProductImageOptimizer();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const process = jest.spyOn(gated as any, 'process').mockImplementation(async () => { await gate; throw Error('codec failure'); });
    const signature = Buffer.from([255, 216, 255, 217]);
    const promises = [gated.optimize(signature), gated.optimize(signature), gated.optimize(signature)];
    await expect(gated.optimize(signature)).rejects.toMatchObject({ status: 429 });
    release(); await Promise.allSettled(promises);
    expect(process).toHaveBeenCalledTimes(3);
    process.mockRestore();
    const valid = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
    expect((await gated.optimize(valid)).width).toBe(2);
  });
  it('refuses excess uploads before Multer and releases admission on error or unsubscribe', async () => {
    const interceptor = new ImageUploadAdmissionInterceptor();
    const context = { switchToHttp: () => ({ getResponse: () => ({ setHeader: jest.fn() }) }) } as any;
    const first = new Subject(), second = new Subject();
    const a = interceptor.intercept(context, { handle: () => first }).subscribe();
    const b = interceptor.intercept(context, { handle: () => second }).subscribe();
    expect(() => interceptor.intercept(context, { handle: () => of(1) })).toThrow();
    a.unsubscribe(); b.unsubscribe();
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => Error('bad multipart')) }))).rejects.toThrow();
    expect(await lastValueFrom(interceptor.intercept(context, { handle: () => of(1) }))).toBe(1);
  });
});
