import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantConnectionManager } from '../../prisma/tenant-prisma.service';
import { TenantContextService } from '../../prisma/tenant-context.service';
import { FiscalMetricsService } from './fiscal-metrics.service';
import { HeartPrismaService } from '../../prisma/heart-prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/fiscal/audit')
export class FiscalAuditController {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly heartPrisma: HeartPrismaService,
    private readonly metricsService: FiscalMetricsService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);

    // Count notas pendentes e falhas (NfeEntrada)
    const groupByStatus = await tenantPrisma.nfeEntrada.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    const pendingCount = groupByStatus
      .filter(s => ['RECEBIDA', 'PROCESSANDO', 'AGUARDANDO_CONCILIACAO', 'PRONTA_IMPORTAR', 'IMPORTANDO'].includes(s.status))
      .reduce((sum, s) => sum + s._count.id, 0);
    const errorCount = groupByStatus.find(s => s.status === 'ERRO')?._count.id || 0;
    const importedCount = groupByStatus.find(s => s.status === 'IMPORTADA')?._count.id || 0;
    const partialCount = 0;

    // Métricas de performance global do node process (se desejável expor via API)
    const metrics = this.metricsService.getMetrics();

    // DLQ falhas no Tenant
    const dlqCount = await tenantPrisma.fiscalFailedJob.count({
      where: { resolved: false },
    });

    return {
      notas: {
        pendentes: pendingCount,
        erros: errorCount,
        importadas: importedCount,
        parciais: partialCount,
      },
      dlq: {
        unresolved: dlqCount,
      },
      performance: metrics,
    };
  }

  @Get('events')
  async getEvents(@Query('skip') skip = '0', @Query('take') take = '50') {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);

    const skipNum = parseInt(skip, 10);
    const takeNum = parseInt(take, 10);

    const [events, total] = await Promise.all([
      tenantPrisma.fiscalEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      tenantPrisma.fiscalEvent.count(),
    ]);

    return { data: events, total, skip: skipNum, take: takeNum };
  }

  @Get('dlq')
  async getDlq() {
    const context = this.tenantContext.get();
    const tenantPrisma = await this.tenantManager.getTenantClient(context.tenantId, context.databaseUrl);

    // Listar as últimas 50 mensagens não resolvidas da DLQ
    const jobs = await tenantPrisma.fiscalFailedJob.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { data: jobs };
  }
}
