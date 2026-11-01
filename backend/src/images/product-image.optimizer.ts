import sharp, { type SharpOptions } from 'sharp';
import { BadRequestException, HttpException, HttpStatus, PayloadTooLargeException } from '@nestjs/common';

export const PRODUCT_IMAGE_POLICY = 'product-webp-800-v1';
export const IMAGE_INPUT_BYTES = 8 * 1024 * 1024;
export const IMAGE_INPUT_PIXELS = 50_000_000;
export const IMAGE_OUTPUT_BYTES = 200 * 1024;
export const IMAGE_OUTPUT_EDGE = 800;
export interface OptimizedProductImage {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  originalBytes: number;
  policy: typeof PRODUCT_IMAGE_POLICY;
}

// Native work stays off the JS thread. Bound libvips threads/cache and admission
// separately: one decode at a time, at most two waiting buffers (16 MiB).
sharp.concurrency(1);
sharp.cache({ memory: 8, files: 0, items: 20 });

export class ProductImageOptimizer {
  private busy = false;
  private waiting: (() => void)[] = [];

  async optimize(input: Buffer): Promise<OptimizedProductImage> {
    if (!Buffer.isBuffer(input) || !input.length) throw new BadRequestException('Imagem vazia ou inválida.');
    if (input.length > IMAGE_INPUT_BYTES) throw new PayloadTooLargeException('A imagem deve ter no máximo 8 MB.');
    const signature = input.subarray(0, 12);
    const supported = (signature[0] === 0xff && signature[1] === 0xd8) ||
      signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP') ||
      ['GIF87a', 'GIF89a'].includes(signature.toString('ascii', 0, 6));
    if (!supported) throw new BadRequestException('Use uma foto JPG, PNG ou WebP. HEIC/HEIF deve ser exportado como JPG antes do envio.');
    if (this.busy) {
      if (this.waiting.length >= 2) throw new HttpException('Processamento de imagens ocupado. Aguarde e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else this.busy = true;
    try {
      return await this.process(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Never leak codec internals and never return the unoptimized input.
      throw new BadRequestException('Não foi possível otimizar a foto. Use uma imagem válida JPG, PNG ou WebP de até 50 megapixels. HEIC/HEIF e animações não são aceitos; exporte como JPG.');
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.busy = false;
    }
  }

  private async process(input: Buffer): Promise<OptimizedProductImage> {
    const options: SharpOptions = { failOn: 'warning', limitInputPixels: IMAGE_INPUT_PIXELS, sequentialRead: true };
    const metadata = await sharp(input, options).timeout({ seconds: 8 }).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '') ||
        !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) {
      throw new BadRequestException('Formato não suportado ou imagem animada. Envie uma foto estática JPG, PNG ou WebP.');
    }
    for (const quality of [80, 68, 58]) {
      const { data, info } = await sharp(input, options)
        .autoOrient()
        .resize({ width: IMAGE_OUTPUT_EDGE, height: IMAGE_OUTPUT_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 3 })
        .timeout({ seconds: 8 })
        .toBuffer({ resolveWithObject: true });
      // sharp strips EXIF (including GPS) by default. No withMetadata/keepExif.
      if (data.length <= IMAGE_OUTPUT_BYTES) return {
        data, mimeType: 'image/webp', width: info.width, height: info.height,
        originalBytes: input.length, policy: PRODUCT_IMAGE_POLICY,
      };
    }
    throw new BadRequestException('A foto continua acima de 200 KB após otimização. Selecione uma foto mais simples ou recorte o produto.');
  }
}

export const productImageOptimizer = new ProductImageOptimizer();
