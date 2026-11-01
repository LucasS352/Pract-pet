import { Body, CanActivate, Controller, ExecutionContext, Get, HttpException, Injectable, Param, Post, Query, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { ImageMaintenanceService } from './image-maintenance.service';
import type { ImageRunMode } from './image-maintenance.service';

@Injectable()
export class ImageMaintenanceGuard implements CanActivate {
  private failures = new Map<string, { count: number; until: number }>();
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    context.switchToHttp().getResponse()?.setHeader('Cache-Control', 'private, no-store');
    const pin = req.headers['x-setup-pin'];
    const now = Date.now(), key = req.ip || 'unknown';
    for (const [ip, f] of this.failures) if (f.until < now) this.failures.delete(ip);
    if ((this.failures.get(key)?.count || 0) >= 10) throw new HttpException('Muitas tentativas de PIN. Aguarde um minuto.', 429);
    // Existing Sys-Init credentials, but NO hardcoded fallback and NO query-string secret.
    const valid = typeof pin === 'string' && pin.length <= 200 && [process.env.SETUP_PIN, process.env.SQL_PIN].some(secret =>
      secret && Buffer.byteLength(pin) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(pin), Buffer.from(secret)));
    if (!valid) {
      if (this.failures.size >= 1000 && !this.failures.has(key)) throw new HttpException('Limite de autenticação. Aguarde.', 429);
      const old = this.failures.get(key);
      this.failures.set(key, { count: (old?.count || 0) + 1, until: old?.until || now + 60000 });
      throw new UnauthorizedException('PIN Sys-Init inválido ou não configurado no servidor.');
    }
    this.failures.delete(key); return true;
  }
}

@Controller('tenants/setup/:tenantId/image-optimization')
@UseGuards(ImageMaintenanceGuard)
export class ImageMaintenanceController {
  constructor(private readonly service: ImageMaintenanceService) {}
  private async safe<T>(work: () => T | Promise<T>): Promise<T> {
    try { return await work(); } catch (e: any) {
      if (e instanceof HttpException) throw e;
      const code = /^[A-Z0-9_]{1,100}$/.test(e?.message) ? e.message : 'MAINTENANCE_FAILED';
      // Never send SQL errors, connection strings or blob contents to the browser/log.
      throw new HttpException({ message: `Operação interrompida com segurança (${code}). Consulte o lote antes de retomar.`, code },
        code === 'MAINTENANCE_BUSY' ? 429 : code === 'JOB_NOT_FOUND' ? 404 : code === 'MAINTENANCE_FAILED' ? 503 : 409);
    }
  }
  @Get('jobs')
  list(@Param('tenantId') tenantId: string) { return this.safe(() => this.service.list(tenantId)); }
  @Post('jobs')
  create(@Param('tenantId') tenantId: string, @Body() body: any) { return this.safe(() => this.service.create(tenantId, body?.id, body?.limit)); }
  @Get('jobs/:id')
  get(@Param('tenantId') tenantId: string, @Param('id') id: string) { return this.safe(() => this.service.get(tenantId, id)); }
  @Post('jobs/:id/start')
  start(@Param('tenantId') tenantId: string, @Param('id') id: string, @Body() body: any) {
    return this.safe(() => this.service.start(tenantId, id, body?.mode as ImageRunMode, body));
  }
  @Post('jobs/:id/step')
  step(@Param('tenantId') tenantId: string, @Param('id') id: string, @Body() body: any) {
    return this.safe(() => this.service.step(tenantId, id, body?.runId, body?.cursor, body));
  }
  @Get('jobs/:id/preview/:assetId')
  async preview(@Param('tenantId') tenantId: string, @Param('id') id: string, @Param('assetId') assetId: string,
    @Query('original') original: string, @Res() res: Response) {
    const photo = await this.safe(() => this.service.preview(tenantId, id, assetId, original === 'true'));
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', photo.mime); res.setHeader('Content-Length', photo.data.length);
    res.send(photo.data);
  }
}
