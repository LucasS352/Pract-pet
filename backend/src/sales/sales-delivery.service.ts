import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { SalesService } from './sales.service';

@Injectable()
export class SalesDeliveryService {
  private running = false;
  private readonly logger = new Logger(SalesDeliveryService.name);

  constructor(
    private readonly heart: HeartPrismaService,
    private readonly tenants: TenantConnectionManager,
    private readonly sales: SalesService,
    private readonly integrations: IntegrationsService,
  ) {}

  // Cron pausado por decisão operacional: evita varreduras automáticas de 10s no MySQL da VPS
  // @Cron('*/10 * * * * *')
  async deliverPending() {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.heart.tenant.findMany({ where: { status: 'active' } });
      for (const tenant of tenants) {
        try {
          const db = await this.tenants.getTenantClient(tenant.id, tenant.databaseUrl);
          await this.deliverTenant(db, tenant.id, tenant.databaseUrl);
        } catch (error: any) {
          // Older tenants must be upgraded through Sys-Init, never by this worker.
          if (!['P2021', 'P2022'].includes(error?.code)) this.logger.error(`Entrega pendente: ${error.message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  async deliverTenant(db: any, tenantId: string, databaseUrl: string) {
    const expired = new Date(Date.now() - 10 * 60_000);
    // Re-sending absolute stock is safe. A fiscal request with unknown result is NOT blindly retried.
    await db.saleDeliveryJob.updateMany({
      where: { kind: 'STOCK', status: 'PROCESSING', claimedAt: { lt: expired } },
      data: { status: 'PENDING', claimToken: null },
    });
    const interrupted = await db.saleDeliveryJob.findMany({
      where: { kind: 'NFCE', status: 'PROCESSING', claimedAt: { lt: expired } }, take: 20,
    });
    for (const job of interrupted) {
      await db.$transaction(async (tx: any) => {
        const claimed = await tx.saleDeliveryJob.updateMany({
          where: { id: job.id, status: 'PROCESSING', claimToken: job.claimToken },
          data: { status: 'REVIEW', lastError: 'Emissão interrompida: consultar o resultado no Gestor Fiscal antes de reenviar.' },
        });
        if (claimed.count) await tx.sale.updateMany({
          where: { id: job.saleId, nfceStatus: 'pendente' },
          data: { nfceStatus: 'rejeitada', nfceMotivoRejeicao: 'Resultado da emissão desconhecido após interrupção. Consulte no Gestor Fiscal antes de reenviar.' },
        });
      });
    }
    const jobs = await db.saleDeliveryJob.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20,
    });
    for (const job of jobs) {
      const claimToken = randomUUID();
      const claim = await db.saleDeliveryJob.updateMany({
        where: { id: job.id, status: 'PENDING', availableAt: { lte: new Date() } },
        data: { status: 'PROCESSING', claimedAt: new Date(), claimToken, attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      const owned = { id: job.id, status: 'PROCESSING', claimToken };
      try {
        if (job.kind === 'STOCK') {
          await this.integrations.syncProductStock(tenantId, JSON.parse(job.payload).productIds, true);
        } else if (job.kind === 'NFCE') {
          const sale = await db.sale.findUnique({ where: { id: job.saleId }, include: { items: true, payments: true, customer: true } });
          if (!sale) throw new Error('Venda da emissão não encontrada');
          if (sale.status !== 'cancelled' && sale.nfceStatus === 'pendente') {
            await this.sales.dispararNfce(tenantId, databaseUrl, sale);
          }
          const result = await db.sale.findUnique({ where: { id: job.saleId } });
          if (result?.nfceStatus === 'pendente' || result?.nfceStatus === 'rejeitada') {
            await db.saleDeliveryJob.updateMany({ where: owned, data: { status: 'REVIEW', lastError: 'Verificar emissão no Gestor Fiscal.' } });
            continue;
          }
        } else throw new Error('Tipo de entrega desconhecido');
        await db.saleDeliveryJob.updateMany({ where: owned, data: { status: 'DONE', lastError: null } });
      } catch (error: any) {
        await db.saleDeliveryJob.updateMany({ where: owned, data: {
          status: job.kind === 'STOCK' ? 'PENDING' : 'REVIEW',
          availableAt: new Date(Date.now() + Math.min(300_000, 10_000 * (job.attempts + 1))),
          lastError: String(error.message).slice(0, 2000),
        } });
        this.logger.warn(`Entrega ${job.id} preservada: ${error.message}`);
      }
    }
  }
}
