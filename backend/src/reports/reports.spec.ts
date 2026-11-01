import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { reportPeriod } from './reports.period';
import { ReportsService } from './reports.service';
import { TenantContextService } from '../prisma/tenant-context.service';

describe('Report periods', () => {
  it.each([
    [undefined, '2026-01-01'], [['2026-01-01'], '2026-01-01'],
    ['2026-02-29', '2026-03-01'], ['2026-04-31', '2026-05-01'],
    ['2026-1-01', '2026-01-01'], ['2026-01-02', '2026-01-01'],
    ['2026-01-01', '2026-04-03'], ['2026-01-01T00:00:00Z', '2026-01-01'],
  ])('rejects invalid or excessive range %s → %s', (start, end) => {
    expect(() => reportPeriod(start, end)).toThrow(BadRequestException);
  });
  it('includes the last millisecond and crosses year boundaries at UTC-03', () => {
    const period = reportPeriod('2025-12-31', '2026-01-01');
    expect(period.start.toISOString()).toBe('2025-12-31T03:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-01-02T03:00:00.000Z');
    expect(period.days).toBe(2);
  });
  it('accepts leap days and the inclusive 92-day limit', () => {
    expect(reportPeriod('2024-02-29', '2024-02-29').days).toBe(1);
    expect(reportPeriod('2026-01-01', '2026-04-02').days).toBe(92);
  });
});

describe('Reports read model', () => {
  const decimal = (v: string) => new Prisma.Decimal(v);
  const context = new TenantContextService();
  let prisma: any;
  let manager: any;
  let service: ReportsService;
  beforeEach(() => {
    prisma = {
      sale: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 3 },
        _sum: { total: decimal('100.01'), discount: decimal('9.99'), addition: decimal('2') } }) },
      saleItem: { groupBy: jest.fn().mockResolvedValue([{ productId: 'p', productName: 'Nome histórico',
        unit: 'KG', _sum: { quantity: decimal('1.234'), subtotal: decimal('108') } }]) },
      $transaction: jest.fn(async (queries) => Promise.all(queries)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    manager = { getTenantClient: jest.fn().mockResolvedValue(prisma) };
    service = new ReportsService(manager, context);
  });
  const run = (fn: () => Promise<unknown>) => context.run({ tenantId: 'tenant-a', databaseUrl: 'test-only', userId: 'admin' }, fn);
  it('preserves decimal totals, historical names and fractional quantities', async () => {
    const result: any = await run(() => service.sales('2026-01-01', '2026-01-02'));
    expect(result.summary).toEqual({ revenue: '100.01', transactions: 3, averageTicket: '33.34', saleDiscounts: '9.99', saleAdditions: '2.00' });
    expect(result.products[0]).toEqual({ productId: 'p', name: 'Nome histórico', unit: 'KG', quantity: '1.234', itemSubtotal: '108.00' });
    expect(manager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'test-only');
    const where = prisma.sale.aggregate.mock.calls[0][0].where;
    expect(where).toEqual({ status: 'completed', source: { not: 'ajuste_fiscal' },
      createdAt: { gte: new Date('2026-01-01T03:00:00Z'), lt: new Date('2026-01-03T03:00:00Z') } });
    expect(prisma.saleItem.groupBy.mock.calls[0][0]).toMatchObject({ where: { sale: where }, take: 20 });
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead' });
  });
  it('returns a genuine empty state without division by zero', async () => {
    prisma.sale.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null, discount: null, addition: null } });
    prisma.saleItem.groupBy.mockResolvedValue([]);
    const result: any = await run(() => service.sales('2026-01-01', '2026-01-01'));
    expect(result.summary.revenue).toBe('0.00');
    expect(result.summary.averageTicket).toBe('0.00');
    expect(result.products).toEqual([]);
  });
  it('rejects invalid dates before acquiring any tenant connection', async () => {
    await expect(service.sales('invalid', 'invalid')).rejects.toThrow(BadRequestException);
    expect(manager.getTenantClient).not.toHaveBeenCalled();
  });
  it('fails closed without an authenticated tenant context', async () => {
    await expect(service.sales('2026-01-01', '2026-01-01')).rejects.toThrow('TenantContext');
    expect(manager.getTenantClient).not.toHaveBeenCalled();
  });
});
