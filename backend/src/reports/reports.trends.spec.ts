import { Prisma } from '@prisma/client';
import { reportPeriod } from './reports.period';
import { previousReportPeriod, salesTrends } from './reports.trends';

const d = (value: string) => new Prisma.Decimal(value);
describe('Daily sales and equal calendar periods', () => {
  it('keeps equal duration without overlap across leap day and year boundaries', () => {
    const leap = previousReportPeriod(reportPeriod('2024-03-01', '2024-03-02'));
    expect([leap.startDate, leap.endDate, leap.days]).toEqual(['2024-02-28', '2024-02-29', 2]);
    const year = previousReportPeriod(reportPeriod('2026-01-01', '2026-01-03'));
    expect([year.startDate, year.endDate, year.days]).toEqual(['2025-12-29', '2025-12-31', 3]);
    expect(year.endExclusive).toEqual(reportPeriod('2026-01-01', '2026-01-03').start);
  });
  it('fills days without sales and keeps fractional money exact', () => {
    const result = salesTrends(reportPeriod('2026-01-01', '2026-01-03'), [
      { date: '2025-12-31', revenue: d('40.00'), transactions: 2n },
      { date: '2026-01-01', revenue: d('0.10'), transactions: 1n },
      { date: '2026-01-03', revenue: d('0.20'), transactions: 1n },
    ], d('0.30'), new Date('2026-01-04T03:00:00Z'));
    expect(result.daily).toEqual([
      { date: '2026-01-01', revenue: '0.10', transactions: 1 },
      { date: '2026-01-02', revenue: '0.00', transactions: 0 },
      { date: '2026-01-03', revenue: '0.20', transactions: 1 },
    ]);
    expect(result.comparison).toMatchObject({ revenue: '40.00', transactions: 2, averageTicket: '20.00', revenueDifference: '-39.70', revenueChangePercent: '-99.25', includesOpenDays: false });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it.each([['0', null], ['-1', null], ['80', '25.00'], ['200', '-50.00'], ['100', '0.00']])(
    'handles prior total %s without invented growth', (previous, expected) => {
      const result = salesTrends(reportPeriod('2026-01-01', '2026-01-01'), [
        { date: '2025-12-31', revenue: d(previous!), transactions: 1n },
      ], d('100'), new Date('2026-01-02T03:00:00Z'));
      expect(result.comparison.revenueChangePercent).toBe(expected);
    });
  it('handles an entirely empty 92-day window and a not-yet-closed comparison', () => {
    const period = reportPeriod('2026-01-01', '2026-04-02');
    const result = salesTrends(period, [], d('0'), new Date('2025-12-31T12:00:00Z'));
    expect(result.daily).toHaveLength(92);
    expect(result.daily[91].date).toBe('2026-04-02');
    expect(result.comparison).toMatchObject({ revenue: '0.00', averageTicket: '0.00', transactions: 0, includesOpenDays: true });
  });
});
