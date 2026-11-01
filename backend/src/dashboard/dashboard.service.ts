import { Injectable } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

@Injectable()
export class DashboardService {
  constructor(
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService
  ) {}

  async getSummary(
    tenantId: string,
    startDate: string,
    endDate: string,
  ) {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);

    // ── Definir janelas de tempo ────────────────────────────────────────────
    const now = new Date();

    const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = nowBr.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const todayStart = new Date(`${todayStr}T00:00:00-03:00`);
    const todayEnd   = new Date(`${todayStr}T23:59:59-03:00`);

    // Início da semana (segunda-feira)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);

    // Semana anterior
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setMilliseconds(-1);

    // Início do mês
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Janela de período customizado do filtro (Ajustado para fuso -03:00) ──
    const periodStart = new Date(`${startDate}T00:00:00-03:00`);
    const periodEnd   = new Date(`${endDate}T23:59:59-03:00`);

    // ── Todas as queries em PARALELO para máxima performance ──────────────
    const [
      openRegisters,
      todayAgg,
      weekAgg,
      prevWeekAgg,
      monthAgg,
      periodSales,
      payablesAlerts,
    ] = await Promise.all([
      // 1. Caixas abertos
      prisma.cashRegister.findMany({
        where: { status: 'open' },
        include: { operator: { select: { name: true } } },
        orderBy: { openingTime: 'asc' },
      }),

      // 2. Faturamento de Hoje (exclui notas de ajuste fiscal)
      prisma.sale.aggregate({
        where: { createdAt: { gte: todayStart, lte: todayEnd }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        _sum: { total: true },
        _count: { id: true },
      }),

      // 3. Faturamento da Semana (exclui notas de ajuste fiscal)
      prisma.sale.aggregate({
        where: { createdAt: { gte: weekStart, lte: todayEnd }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        _sum: { total: true },
      }),

      // 4. Semana anterior (exclui notas de ajuste fiscal)
      prisma.sale.aggregate({
        where: { createdAt: { gte: prevWeekStart, lte: prevWeekEnd }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        _sum: { total: true },
      }),

      // 5. Faturamento do Mês (exclui notas de ajuste fiscal)
      prisma.sale.aggregate({
        where: { createdAt: { gte: monthStart, lte: todayEnd }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        _sum: { total: true },
      }),

      // 6. Dados do período filtrado (exclui notas de ajuste fiscal)
      prisma.sale.findMany({
        where: { createdAt: { gte: periodStart, lte: periodEnd }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        include: {
          payments: { select: { method: true, value: true, label: true } },
          items: {
            select: {
              quantity: true,
              priceUnit: true,
              subtotal: true,
              productName: true,
              productId: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // 7. Alertas de contas a pagar (próximos 3 dias)
      prisma.payable.findMany({
        where: {
          status: 'PENDING',
          dueDate: { lte: new Date(new Date(todayEnd).setDate(new Date(todayEnd).getDate() + 3)) },
        },
        orderBy: { dueDate: 'asc' },
      }),
    ]);
    // Calcula receita por caixa (paralelo para os caixas abertos)
    const openRegistersWithRevenue = await Promise.all(
      openRegisters.map(async (reg) => {
        const regSales = await prisma.sale.aggregate({
          where: { cashRegisterId: reg.id, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
          _sum: { total: true },
          _count: { id: true },
        });
        return {
          cashRegisterId: reg.id,
          code: reg.code,
          operatorName: (reg as any).operator?.name ?? 'Operador',
          operatorId: reg.operatorId,
          openedAt: (reg as any).openingTime,
          openingValue: Number(reg.openingValue ?? 0),
          total: Number(regSales._sum.total ?? 0),
          salesCount: Number(regSales._count.id ?? 0),
        };
      })
    );

    const weekRevenue = Number(weekAgg._sum.total ?? 0);
    const prevWeekRevenue = Number(prevWeekAgg._sum.total ?? 0);
    const vsLastWeek = prevWeekRevenue > 0
      ? ((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100
      : null;

    // Agrega pagamentos por método
    const byPaymentMethod: Record<string, number> = {
      dinheiro: 0, pix: 0, credito: 0, debito: 0,
    };
    periodSales.forEach(sale => {
      sale.payments.forEach(p => {
        const rawKey = ((p.method && isNaN(Number(p.method))) ? p.method : (p.label && isNaN(Number(p.label))) ? p.label : 'credito').toLowerCase();
        let normKey = 'credito';
        if (rawKey.includes('dinh')) normKey = 'dinheiro';
        else if (rawKey.includes('pix')) normKey = 'pix';
        else if (rawKey.includes('cred')) normKey = 'credito';
        else if (rawKey.includes('deb')) normKey = 'debito';
        else if (rawKey.includes('consumo')) normKey = 'consumo_funcionario';

        byPaymentMethod[normKey] = (byPaymentMethod[normKey] ?? 0) + Number(p.value);
      });
    });

    // Agrega faturamento por recortes temporais (Hora, Dia, Semana, Mês)
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;

    const byDay: Record<string, number> = {};
    const byWeek: Record<string, number> = {};
    const byMonth: Record<string, number> = {};

    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};

    periodSales.forEach(sale => {
      const saleDate = new Date((sale as any).createdAt);
      const brDate = new Date(saleDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const saleTotal = Number((sale as any).total || 0);

      // 1. Agregação por Hora
      const brHour = brDate.getHours();
      byHour[brHour] = (byHour[brHour] ?? 0) + saleTotal;

      // 2. Agregação por Dia (YYYY-MM-DD)
      const dayKey = `${brDate.getFullYear()}-${String(brDate.getMonth() + 1).padStart(2, '0')}-${String(brDate.getDate()).padStart(2, '0')}`;
      byDay[dayKey] = (byDay[dayKey] ?? 0) + saleTotal;

      // 3. Agregação por Semana (YYYY-MM-DD da segunda-feira correspondente)
      const monday = new Date(brDate);
      const dayOfWeek = monday.getDay();
      const diffToMonday = monday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      monday.setDate(diffToMonday);
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      byWeek[weekKey] = (byWeek[weekKey] ?? 0) + saleTotal;

      // 4. Agregação por Mês (YYYY-MM)
      const monthKey = `${brDate.getFullYear()}-${String(brDate.getMonth() + 1).padStart(2, '0')}`;
      byMonth[monthKey] = (byMonth[monthKey] ?? 0) + saleTotal;

      // Agregação de produtos vendidos
      sale.items.forEach(item => {
        const key = item.productId as string;
        const name = (item.productName as string) || 'Desconhecido';
        if (!productMap[key]) productMap[key] = { name, qty: 0, revenue: 0 };
        productMap[key].qty += Number(item.quantity);
        productMap[key].revenue += Number(item.subtotal);
      });
    });

    const periodRevenue = periodSales.reduce((acc, s) => acc + Number((s as any).total), 0);

    // Lista total de produtos vendidos ordenados por faturamento decrescente
    const productsSold = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map(p => ({
        name: p.name,
        qty: p.qty,
        revenue: p.revenue,
      }));

    // Top 8 produtos para a widget lateral clássica
    const topProducts = productsSold.slice(0, 8).map(p => ({
      name: p.name,
      qty: p.qty,
      revenue: p.revenue,
      pct: periodRevenue > 0 ? (p.revenue / periodRevenue) * 100 : 0,
    }));

    const avgTicket = periodSales.length > 0
      ? periodRevenue / periodSales.length
      : 0;

    const overduePayables = payablesAlerts.filter(p => p.dueDate < todayStart);
    const upcomingPayables = payablesAlerts.filter(p => p.dueDate >= todayStart);

    return {
      openRegisters: openRegistersWithRevenue,
      // Compat: currentRegister aponta para o primeiro caixa aberto (se houver)
      currentRegister: openRegistersWithRevenue.length > 0 ? openRegistersWithRevenue[0] : null,
      today: {
        revenue: Number(todayAgg._sum.total ?? 0),
        transactions: Number(todayAgg._count.id ?? 0),
      },
      week: {
        revenue: weekRevenue,
        vsLastWeek,
      },
      month: {
        revenue: Number(monthAgg._sum.total ?? 0),
      },
      period: {
        revenue: periodRevenue,
        transactions: periodSales.length,
        avgTicket,
        byPaymentMethod,
        byHour,
        byDay,
        byWeek,
        byMonth,
        topProducts,
        productsSold,
      },
      alerts: {
        overduePayables,
        upcomingPayables,
      }
    };
  }
}
