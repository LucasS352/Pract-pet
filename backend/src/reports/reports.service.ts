import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { reportPeriod } from './reports.period';
import { DailySalesRow, previousReportPeriod, salesTrends } from './reports.trends';

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
  ) {}

  async sales(startDate: unknown, endDate: unknown) {
    const period = reportPeriod(startDate, endDate);
    const previous = previousReportPeriod(period);
    const { tenantId, databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    const where: Prisma.SaleWhereInput = {
      status: 'completed', source: { not: 'ajuste_fiscal' },
      createdAt: { gte: period.start, lt: period.endExclusive },
    };
    // Sem carregar vendas individuais e sem joins que multipliquem totais.
    // Todas as leituras usam o mesmo snapshot, inclusive durante cancelamentos.
    const [sales, products, dailyRows] = await prisma.$transaction([
      prisma.sale.aggregate({ where, _count: { _all: true },
        _sum: { total: true, discount: true, addition: true } }),
      prisma.saleItem.groupBy({
        by: ['productId', 'productName', 'unit'], where: { sale: where },
        _sum: { quantity: true, subtotal: true },
        orderBy: [{ _sum: { subtotal: 'desc' } }, { productId: 'asc' },
          { productName: 'asc' }, { unit: 'asc' }], take: 20,
      }),
      // Só a projeção agrupa por dia; o filtro mantém createdAt sem função,
      // permitindo usar seu índice. Valores são parâmetros, nunca SQL concatenado.
      prisma.$queryRaw<DailySalesRow[]>(Prisma.sql`
        SELECT DATE_FORMAT(DATE_SUB(createdAt, INTERVAL 3 HOUR), '%Y-%m-%d') AS date,
          SUM(total) AS revenue, COUNT(*) AS transactions
        FROM sales
        WHERE createdAt >= ${previous.start} AND createdAt < ${period.endExclusive}
          AND status = 'completed' AND source <> 'ajuste_fiscal'
        GROUP BY date ORDER BY date
      `),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const revenue = sales._sum.total ?? new Prisma.Decimal(0);
    const now = new Date();
    return {
      period: { startDate: period.startDate, endDate: period.endDate,
        days: period.days, timezone: period.timezone, includesOpenDays: period.endExclusive > now },
      ...salesTrends(period, dailyRows, revenue, now),
      summary: {
        revenue: revenue.toFixed(2), transactions: sales._count._all,
        averageTicket: sales._count._all ? revenue.div(sales._count._all).toFixed(2) : '0.00',
        saleDiscounts: (sales._sum.discount ?? new Prisma.Decimal(0)).toFixed(2),
        saleAdditions: (sales._sum.addition ?? new Prisma.Decimal(0)).toFixed(2),
      },
      productLimit: 20,
      products: products.map(p => ({ productId: p.productId, name: p.productName,
        unit: p.unit, quantity: (p._sum!.quantity ?? new Prisma.Decimal(0)).toFixed(3),
        itemSubtotal: (p._sum!.subtotal ?? new Prisma.Decimal(0)).toFixed(2) })),
    };
  }
}
