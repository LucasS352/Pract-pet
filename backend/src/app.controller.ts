import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { HeartPrismaService } from './prisma/heart-prisma.service';

@Controller()
export class AppController {
  constructor(private readonly heartPrisma: HeartPrismaService) {}

  @Get()
  healthCheck() {
    return {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Healthcheck com verificação do banco Heart (usado pelo Docker/Portainer). */
  @Get('health')
  async health(@Res() res: Response) {
    try {
      await this.heartPrisma.$queryRawUnsafe('SELECT 1');
      return res.status(200).json({ status: 'ok', db: 'up', uptime: process.uptime() });
    } catch {
      return res.status(503).json({ status: 'degraded', db: 'down' });
    }
  }

  @Get('products/uploads/images/:id')
  async serveProductImage(@Param('id') id: string, @Res() res: Response) {
    try {
      const etag = `"${id}"`;
      const header = res.req?.headers?.['if-none-match'];
      const acceptsCached = typeof header === 'string' && header.split(',').some(value => {
        const tag = value.trim().replace(/^W\//, '');
        return tag === etag || tag === '*';
      });
      // Validate existence without materializing the LongBlob on a cache hit.
      const image = await this.heartPrisma.image.findUnique({
        where: { id },
        ...(acceptsCached ? { select: { id: true, mimeType: true } } : {}),
      });

      if (!image) {
        throw new NotFoundException('Image not found');
      }

      // Cache imutável: ID é UUID único por imagem — conteúdo nunca muda
      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('ETag', etag);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Suporte a conditional GET (If-None-Match)
      if (acceptsCached) {
        return res.status(304).end();
      }

      res.send(image.data);
    } catch (err) {
      res.setHeader('Cache-Control', 'no-store');
      if (err instanceof NotFoundException) return res.status(404).send('Product image not found');
      return res.status(503).send('Image temporarily unavailable');
    }
  }
}
