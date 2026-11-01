import { Prisma } from '@prisma/client';
import { reportPeriod } from './reports.period';

const DAY = 86_400_000;
type Period = ReturnType<typeof reportPeriod>;
export interface DailySalesRow {
  date: string;
  revenue: Prisma.Decimal;
  transactions: bigint;
}
const businessDate = (time: number) => new Date(time - 3 * 3_600_000).toISOString().slice(0, 10);

export function previousReportPeriod(period: Period) {
  return reportPeriod(
    businessDate(period.start.getTime() - period.days * DAY),
    businessDate(period.start.getTime() - DAY),
  );
}

export function salesTrends(period: Period, rows: DailySalesRow[], revenue: Prisma.Decimal, now: Date) {
  const previous = previousReportPeriod(period);
  const byDate = new Map(rows.map(row => [row.date, row]));
  const daily = Array.from({ length: period.days }, (_, index) => {
    const date = businessDate(period.start.getTime() + index * DAY);
    const row = byDate.get(date);
    return { date, revenue: (row?.revenue ?? new Prisma.Decimal(0)).toFixed(2),
      transactions: Number(row?.transactions ?? 0) };
  });
  let previousRevenue = new Prisma.Decimal(0);
  let previousTransactions = 0;
  for (const row of rows) {
    if (row.date >= previous.startDate && row.date <= previous.endDate) {
      previousRevenue = previousRevenue.plus(row.revenue);
      previousTransactions += Number(row.transactions);
    }
  }
  const difference = revenue.minus(previousRevenue);
  return {
    daily,
    comparison: {
      startDate: previous.startDate, endDate: previous.endDate, days: previous.days,
      revenue: previousRevenue.toFixed(2), transactions: previousTransactions,
      averageTicket: previousTransactions ? previousRevenue.div(previousTransactions).toFixed(2) : '0.00',
      revenueDifference: difference.toFixed(2),
      revenueChangePercent: previousRevenue.gt(0) ? difference.div(previousRevenue).mul(100).toFixed(2) : null,
      includesOpenDays: previous.endExclusive > now,
    },
  };
}
