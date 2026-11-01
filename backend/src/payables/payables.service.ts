import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ensureFutureOccurrences, monthKey, nextOccurrence } from './payable-recurrence';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

@Injectable()
export class PayablesService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  private input(data: any, existing?: any) {
    const merged = { ...existing, ...data };
    const amount = Number(merged.amount);
    const dueDate = new Date(merged.dueDate);
    const type = merged.type || 'VARIABLE', status = merged.status || 'PENDING';
    if (typeof merged.description !== 'string' || !merged.description.trim() || !Number.isFinite(amount) || amount < 0 ||
        !Number.isFinite(dueDate.getTime()) || !['FIXED', 'VARIABLE'].includes(type) || !['PENDING', 'PAID'].includes(status)) {
      throw new BadRequestException('Informe descrição, valor, vencimento e status válidos.');
    }
    if (merged.isRecurring !== undefined && typeof merged.isRecurring !== 'boolean') throw new BadRequestException('Recorrência inválida.');
    return {
      description: merged.description.trim(), amount, dueDate, type, status,
      isRecurring: merged.isRecurring ?? (type === 'FIXED'),
      category: merged.category || null, supplierId: merged.supplierId || null, notes: merged.notes || null,
      paidAt: status === 'PAID' ? (existing?.status === 'PAID' ? existing.paidAt : new Date()) : null,
    };
  }

  private async transaction<T>(prisma: any, work: (tx: any) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await prisma.$transaction(work, { isolationLevel: 'ReadCommitted' }); }
      catch (error: any) {
        if (error?.code !== 'P2034' || attempt >= 2) throw error;
      }
    }
  }

  private async lockPayable(tx: any, id: string) {
    const first = await tx.payable.findUnique({ where: { id } });
    if (!first) throw new NotFoundException('Conta não encontrada.');
    if (first.recurrenceId) {
      await tx.$queryRaw`SELECT id FROM payables WHERE recurrenceId = ${first.recurrenceId} ORDER BY id FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT id FROM payables WHERE id = ${id} FOR UPDATE`;
    }
    const current = await tx.payable.findUnique({ where: { id } });
    if (!current || current.status === 'CANCELLED') throw new NotFoundException('Conta não encontrada ou excluída.');
    return current;
  }

  async createPayable(data: any) {
    const prisma = await this.getPrisma();
    const createData = this.input(data);
    return this.transaction(prisma, async tx => {
      const payable = await tx.payable.create({ data: {
        ...createData,
        ...(createData.isRecurring ? {
          recurrenceId: randomUUID(), recurrenceMonth: monthKey(createData.dueDate), recurrenceDay: createData.dueDate.getUTCDate(),
        } : {}),
      } });
      // Original + next two months, even if the original has not been paid.
      if (payable.type === 'FIXED') await ensureFutureOccurrences(tx, payable, 2);
      return payable;
    });
  }

  async getPayables(month?: string, year?: string) {
    const prisma = await this.getPrisma();
    
    const where: any = { status: { not: 'CANCELLED' } };
    if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      const start = new Date(Date.UTC(y, m, 1));
      const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
      where.dueDate = {
        gte: start,
        lte: end,
      };
    }

    return prisma.payable.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        supplier: true,
      },
    });
  }

  async getPayablesDashboard(month?: string, year?: string) {
    const prisma = await this.getPrisma();
    
    const d = new Date();
    const m = month ? parseInt(month) - 1 : d.getMonth();
    const y = year ? parseInt(year) : d.getFullYear();
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));

    const payables = await prisma.payable.findMany({
      where: {
        status: { not: 'CANCELLED' },
        dueDate: {
          gte: start,
          lte: end,
        },
      },
    });

    const totalFixed = payables.filter(p => p.type === 'FIXED').reduce((acc, p) => acc + Number(p.amount), 0);
    const totalVariable = payables.filter(p => p.type === 'VARIABLE').reduce((acc, p) => acc + Number(p.amount), 0);
    const paidFixed = payables.filter(p => p.type === 'FIXED' && p.status === 'PAID').reduce((acc, p) => acc + Number(p.amount), 0);
    const paidVariable = payables.filter(p => p.type === 'VARIABLE' && p.status === 'PAID').reduce((acc, p) => acc + Number(p.amount), 0);
    const totalToPay = totalFixed + totalVariable;
    const totalPaid = paidFixed + paidVariable;

    // Get current month sales to calculate Real Profit (Sales - Payables - Purchases?)
    // Basic real profit = sales total - payables
    const sales = await prisma.sale.aggregate({
      where: {
        createdAt: {
          gte: start,
          lte: end,
        },
        status: 'completed',
        NOT: { source: 'ajuste_fiscal' },
      },
      _sum: {
        total: true,
      }
    });

    const totalSales = Number(sales._sum.total || 0);
    const realProfit = totalSales - totalToPay;
    const breakEvenPoint = totalToPay; // To pay bills we need at least totalToPay in gross margin, wait, just conceptually "how much we need to sell". Let's say we need to sell totalToPay.
    const remainingToBreakEven = Math.max(0, totalToPay - totalSales);

    return {
      totalFixed,
      totalVariable,
      paidFixed,
      paidVariable,
      totalToPay,
      totalPaid,
      totalSales,
      realProfit,
      breakEvenPoint,
      remainingToBreakEven
    };
  }

  async getPayableById(payableId: string) {
    const prisma = await this.getPrisma();
    const payable = await prisma.payable.findUnique({
      where: { id: payableId },
      include: {
        supplier: true,
      },
    });

    if (!payable) throw new NotFoundException('Conta não encontrada.');
    return payable;
  }

  async updatePayable(payableId: string, data: any) {
    const prisma = await this.getPrisma();
    return this.transaction(prisma, async tx => {
      const current = await this.lockPayable(tx, payableId);
      const update = this.input(data, current);
      if (current.recurrenceId && update.type !== current.type) {
        throw new BadRequestException('Para mudar o tipo de uma série, crie uma nova conta. Esta edição altera somente a ocorrência.');
      }
      const payable = await tx.payable.update({ where: { id: payableId }, data: {
        ...update,
      } });
      if (payable.recurrenceId && current.isRecurring !== update.isRecurring) {
        // Stop/resume the series; already-created bills remain visible and unchanged financially.
        await tx.payable.updateMany({ where: { recurrenceId: payable.recurrenceId }, data: { isRecurring: update.isRecurring } });
      }
      if (payable.type === 'FIXED') await ensureFutureOccurrences(tx, payable, 2);
      return payable;
    });
  }

  async deletePayable(payableId: string) {
    const prisma = await this.getPrisma();
    return this.transaction(prisma, async tx => {
      const payable = await this.lockPayable(tx, payableId);
      // Keep a tombstone so extending the series cannot resurrect an explicitly deleted month.
      if (payable.recurrenceId) return tx.payable.update({ where: { id: payableId }, data: { status: 'CANCELLED' } });
      return tx.payable.delete({ where: { id: payableId } });
    });
  }

  async payPayable(payableId: string) {
    const prisma = await this.getPrisma();
    return this.transaction(prisma, async tx => {
      const payable = await this.lockPayable(tx, payableId);
      if (payable.status === 'PAID') return payable;
      const updated = await tx.payable.update({ where: { id: payableId }, data: { status: 'PAID', paidAt: new Date() } });
      if (payable.recurrenceId) {
        await ensureFutureOccurrences(tx, payable, payable.type === 'FIXED' ? 2 : 1);
      } else if (payable.isRecurring) {
        // Legacy rows have no reliable series identity. Preserve their existing one-month flow;
        // never infer/backfill relationships between historical bills automatically.
        const { dueDate } = nextOccurrence(monthKey(payable.dueDate), payable.dueDate.getUTCDate(), 1);
        const exists = await tx.payable.findFirst({ where: {
          description: payable.description, type: payable.type, supplierId: payable.supplierId,
          dueDate: { gte: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())),
            lt: new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate() + 1)) },
        } });
        if (!exists) await tx.payable.create({ data: {
          description: payable.description, amount: payable.amount, dueDate, status: 'PENDING',
          type: payable.type, isRecurring: true, category: payable.category, supplierId: payable.supplierId, notes: payable.notes,
        } });
      }
      return updated;
    });
  }
}
