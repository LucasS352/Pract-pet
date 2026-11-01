import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { ProductsService } from '../products/products.service';
import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';


@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private heartPrisma: HeartPrismaService,
    private productsService: ProductsService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Creates a Prisma client connected to a specific tenant database */
  private createTenantClient(databaseUrl: string) {
    return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }

  /** Fetches a group and validates it exists, includes members+tenant */
  private async getGroupWithMembers(groupId: string) {
    const group = await this.heartPrisma.tenantGroup.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { tenant: true },
        },
      },
    });
    if (!group) throw new NotFoundException(`Grupo ${groupId} não encontrado`);
    const labels = group.members.map(m => m.alias?.trim() || m.tenant.nomeFantasia || m.tenant.name);
    return { ...group, members: group.members.map((m, i) => ({ ...m,
      alias: labels.filter(label => label === labels[i]).length > 1 ? `${labels[i]} · ${m.tenant.databaseName}` : labels[i],
    })) };
  }

  private productKey(product: { name: string; unit: string; barcode?: string | null }) {
    return product.barcode?.trim() ? `ean:${product.barcode.trim()}:${product.unit}` : `name:${product.name.trim().toLocaleLowerCase('pt-BR')}:${product.unit}`;
  }

  // ── Group CRUD ─────────────────────────────────────────────────────────────

  async listGroups() {
    return this.heartPrisma.tenantGroup.findMany({
      include: {
        members: {
          include: { tenant: { select: { id: true, name: true, nomeFantasia: true, razaoSocial: true, status: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createGroup(name: string) {
    if (!name?.trim()) throw new BadRequestException('Nome do grupo é obrigatório');
    return this.heartPrisma.tenantGroup.create({ data: { name: name.trim() } });
  }

  async deleteGroup(groupId: string) {
    await this.getGroupWithMembers(groupId);
    await this.heartPrisma.tenantGroup.delete({ where: { id: groupId } });
    return { success: true };
  }

  // ── Members ────────────────────────────────────────────────────────────────

  async addMember(groupId: string, tenantId: string, alias?: string) {
    await this.getGroupWithMembers(groupId);
    const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} não encontrado`);
    return this.heartPrisma.tenantGroupMember.upsert({
      where: { groupId_tenantId: { groupId, tenantId } },
      update: { alias: alias ?? null },
      create: { groupId, tenantId, alias: alias ?? null },
    });
  }

  async removeMember(groupId: string, tenantId: string) {
    await this.heartPrisma.tenantGroupMember.deleteMany({ where: { groupId, tenantId } });
    return { success: true };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(groupId: string, startDate?: string, endDate?: string) {
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];
    const salesByDateMap = new Map<string, number>();
    const salesByHourMap = new Map<string, number>();
    const salesByDayOfWeekMap = new Map<string, number>();
    const salesByWeekMap = new Map<string, number>();
    const salesByMonthMap = new Map<string, number>();
    const paymentsMap = new Map<string, number>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDate = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    const start = startDate ? parseDate(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? parseDate(endDate) : new Date();
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      end.setHours(23, 59, 59, 999);
    }
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
      throw new BadRequestException('Período inválido');
    }

    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const [salesTodayAgg, salesPeriodAgg, salesPeriodCount, topProducts, dailySales, paymentsData, todayCount] = await Promise.all([
          client.sale.aggregate({
            where: { createdAt: { gte: today }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
            _sum: { total: true },
          }),
          client.sale.aggregate({
            where: { createdAt: { gte: start, lte: end }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
            _sum: { total: true },
          }),
          client.sale.count({
            where: { createdAt: { gte: start, lte: end }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
          }),
          client.saleItem.groupBy({
            by: ['productId'],
            where: { sale: { createdAt: { gte: start, lte: end }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'desc' } },
            take: 15,
          }),
          client.sale.findMany({
            where: { createdAt: { gte: start, lte: end }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
            select: { createdAt: true, total: true },
          }),
          client.payment.groupBy({
            by: ['method'],
            where: { sale: { createdAt: { gte: start, lte: end }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] } },
            _sum: { value: true },
          }),
          client.sale.count({ where: { createdAt: { gte: today }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] } }),
        ]);

        // Aggregate daily and hourly sales
        const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        
        for (const sale of dailySales) {
          const dt = sale.createdAt;
          const dStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          const hourStr = dt.getHours().toString() + 'h';
          const dayOfWeekStr = DIAS_SEMANA[dt.getDay()];
          const startOfWeek = new Date(dt);
          startOfWeek.setDate(dt.getDate() - dt.getDay());
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          const fmtDt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}`;
          const weekStr = `${fmtDt(startOfWeek)} a ${fmtDt(endOfWeek)}`;
          const monthStr = MESES[dt.getMonth()];
          
          const val = Number(sale.total);
          salesByDateMap.set(dStr, (salesByDateMap.get(dStr) || 0) + val);
          salesByHourMap.set(hourStr, (salesByHourMap.get(hourStr) || 0) + val);
          salesByDayOfWeekMap.set(dayOfWeekStr, (salesByDayOfWeekMap.get(dayOfWeekStr) || 0) + val);
          salesByWeekMap.set(weekStr, (salesByWeekMap.get(weekStr) || 0) + val);
          salesByMonthMap.set(monthStr, (salesByMonthMap.get(monthStr) || 0) + val);
        }

        // Aggregate payments
        const tenantPaymentMethods = await client.tenantPaymentMethod.findMany({
          select: { id: true, name: true }
        });
        const paymentMethodNames = new Map(tenantPaymentMethods.map((t: any) => [t.id, t.name]));

        for (const p of paymentsData) {
          let method = p.method || 'outros';
          
          if (paymentMethodNames.has(method)) {
            method = paymentMethodNames.get(method)!;
          } else {
            // map common types
            if (method === 'credit') method = 'Cartão de Crédito';
            else if (method === 'debit') method = 'Cartão de Débito';
            else if (method === 'pix') method = 'Pix';
            else if (method === 'cash') method = 'Dinheiro';
            else method = method.charAt(0).toUpperCase() + method.slice(1);
          }
          
          const val = Number(p._sum.value ?? 0);
          paymentsMap.set(method, (paymentsMap.get(method) || 0) + val);
        }

        const productIds = topProducts.map((p: any) => p.productId);
        const products = await client.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, imageUrl: true },
        });
        const productMap = new Map<string, { name: string; imageUrl: string | null }>(products.map((p: any) => [p.id, { name: p.name, imageUrl: p.imageUrl }]));

        results.push({
          tenantId: member.tenantId,
          alias: member.alias ?? member.tenant.nomeFantasia ?? member.tenant.name,
          salesToday: Number(salesTodayAgg._sum.total ?? 0),
          salesMonth: Number(salesPeriodAgg._sum.total ?? 0),
          countToday: todayCount,
          countPeriod: salesPeriodCount,
          topProducts: topProducts.map((p: any) => {
            const prodData = productMap.get(p.productId) || { name: 'Desconhecido', imageUrl: null };
            return {
              productId: p.productId,
              name: prodData.name,
              imageUrl: prodData.imageUrl,
              totalQty: Number(p._sum.quantity ?? 0),
            };
          }),
        });
      } catch (err: any) {
        this.logger.warn(`Dashboard erro tenant ${member.tenantId}: ${err.message}`);
        results.push({
          tenantId: member.tenantId,
          alias: member.alias ?? member.tenant.nomeFantasia ?? member.tenant.name,
          error: err.message,
          salesToday: 0,
          salesMonth: 0,
          countToday: 0,
          countPeriod: 0,
          topProducts: [],
        });
      } finally {
        await client.$disconnect();
      }
    }

    const salesByDate = Array.from(salesByDateMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Sort Hours numerically: 0h, 1h, ... 23h
    const sortedHours = Array.from(salesByHourMap.keys()).sort((a, b) => parseInt(a) - parseInt(b));
    const salesByHour = sortedHours.map(h => ({ hour: h, total: salesByHourMap.get(h)! }));

    // Sort Days of Week naturally
    const orderDay = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const sortedDaysOfWeek = Array.from(salesByDayOfWeekMap.keys()).sort((a, b) => orderDay.indexOf(a) - orderDay.indexOf(b));
    const salesByDayOfWeek = sortedDaysOfWeek.map(d => ({ name: d, total: salesByDayOfWeekMap.get(d)! }));

    // Sort Weeks naturally
    const sortedWeeks = Array.from(salesByWeekMap.keys()).sort();
    const salesByWeek = sortedWeeks.map(w => ({ name: w, total: salesByWeekMap.get(w)! }));

    // Sort Months naturally
    const orderMonth = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const sortedMonths = Array.from(salesByMonthMap.keys()).sort((a, b) => orderMonth.indexOf(a) - orderMonth.indexOf(b));
    const salesByMonth = sortedMonths.map(m => ({ name: m, total: salesByMonthMap.get(m)! }));

    const payments = Array.from(paymentsMap.keys()).map(m => ({ method: m, total: paymentsMap.get(m)! }));

    return {
      groupId,
      groupName: group.name,
      tenants: results,
      salesByDate,
      salesByHour,
      salesByDayOfWeek,
      salesByWeek,
      salesByMonth,
      payments,
    };
  }

  // ── Stock ──────────────────────────────────────────────────────────────────

  async getConsolidatedStock(groupId: string) {
    const catalog = await this.getProductsCatalog(groupId);
    return { groupId, groupName: catalog.groupName, tenantLabels: catalog.tenantLabels,
      rows: catalog.rows.map(row => ({ key: row.key, name: row.name, barcode: row.barcode, unit: row.unit,
        tenants: Object.fromEntries(Object.entries(row.tenants).map(([id, p]: [string, any]) => [id, { qty: p.stock, productId: p.id, unit: p.unit }])) })) };
  }

  async stockEntry(
    groupId: string,
    body: { tenantId: string; productId: string; quantity: number; costPrice?: number },
  ) {
    if (!Number.isFinite(body.quantity) || body.quantity <= 0 || body.quantity > 9999999.999 || Math.abs(body.quantity * 1000 - Math.round(body.quantity * 1000)) > 0.000001 || (body.costPrice !== undefined && (!Number.isFinite(body.costPrice) || body.costPrice < 0 || body.costPrice > 999999.9999))) {
      throw new BadRequestException('Informe quantidade positiva com até 3 casas decimais e custo válido');
    }
    const group = await this.getGroupWithMembers(groupId);
    const member = group.members.find((m) => m.tenantId === body.tenantId);
    if (!member) throw new NotFoundException('Tenant não faz parte deste grupo');

    const client = this.createTenantClient(member.tenant.databaseUrl);
    try {
      const newStock = await client.$transaction(async tx => {
        const changed = await tx.product.updateMany({ where: { id: body.productId, active: true, stock: { lte: 9999999.999 - body.quantity } }, data: { stock: { increment: body.quantity } } });
        if (changed.count !== 1) throw new BadRequestException('Produto indisponível ou saldo acima do limite');
        const product = await tx.product.findUniqueOrThrow({ where: { id: body.productId } });
        const costPrice = body.costPrice ?? product.priceCost;
        await tx.stockLot.create({ data: { productId: product.id, quantity: body.quantity, remaining: body.quantity, costPrice } });
        await tx.inventoryLog.create({ data: { productId: product.id, type: 'entry', quantity: body.quantity, costPrice, reason: 'Entrada via portal grupo multiempresa' } });
        return Number(product.stock);
      });
      this.productsService.invalidateCache(body.tenantId);
      return { success: true, newStock };
    } finally {
      await client.$disconnect();
    }
  }

  async stockTransfer(
    groupId: string,
    body: { fromTenantId: string; toTenantId: string; productId: string; quantity: number },
  ) {
    const quantity = body.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999.999 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) {
      throw new BadRequestException('Informe uma quantidade positiva com até 3 casas decimais');
    }
    if (body.fromTenantId === body.toTenantId) throw new BadRequestException('Origem e destino devem ser diferentes');
    const group = await this.getGroupWithMembers(groupId);
    const fromMember = group.members.find(m => m.tenantId === body.fromTenantId);
    const toMember = group.members.find(m => m.tenantId === body.toTenantId);
    if (!fromMember || !toMember) throw new BadRequestException('As duas lojas devem pertencer ao grupo');
    const fromClient = this.createTenantClient(fromMember.tenant.databaseUrl);
    const toClient = this.createTenantClient(toMember.tenant.databaseUrl);
    const transferId = randomUUID();
    const consumed: { id: string; quantity: number }[] = [];
    try {
      const product = await fromClient.product.findUnique({ where: { id: body.productId } });
      if (!product?.active) throw new BadRequestException('Produto indisponível na origem');
      // IDs são locais a cada banco; EAN tem prioridade e nome/unidade é o fallback.
      const candidates = await toClient.product.findMany({ where: product.barcode
        ? { barcode: product.barcode, active: true }
        : { name: product.name, unit: product.unit, active: true }, take: 2 });
      if (candidates.length !== 1 || candidates[0].unit !== product.unit) {
        throw new BadRequestException('Produto ausente, ambíguo ou com unidade diferente no destino. Sincronize o catálogo e confira o cadastro antes de transferir. Nenhum saldo foi debitado.');
      }
      const destination = candidates[0];
      // Cada banco confirma saldo, lotes e log juntos. A reserva usa débito
      // condicional para impedir duas transferências de gastar o mesmo saldo.
      await fromClient.$transaction(async tx => {
        const debit = await tx.product.updateMany({ where: { id: product.id, active: true, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
        if (debit.count !== 1) throw new BadRequestException('Estoque insuficiente para transferência');
        const lots = await tx.stockLot.findMany({ where: { productId: product.id, remaining: { gt: 0 } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        let remaining = quantity;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const amount = Math.min(Number(lot.remaining), remaining);
          const updated = await tx.stockLot.updateMany({ where: { id: lot.id, remaining: { gte: amount } }, data: { remaining: { decrement: amount } } });
          if (updated.count !== 1) throw new BadRequestException('O estoque mudou durante a transferência. Tente novamente.');
          consumed.push({ id: lot.id, quantity: amount });
          remaining = Math.round((remaining - amount) * 1000) / 1000;
        }
        await tx.inventoryLog.create({ data: { id: transferId, productId: product.id, type: 'transfer_out', quantity: -quantity,
          origin: 'GROUP_TRANSFER', referenceId: transferId, referenceKey: body.toTenantId, reason: 'Transferência entre lojas do grupo' } });
      });
      try {
        await toClient.$transaction(async tx => {
          const credit = await tx.product.updateMany({ where: { id: destination.id, active: true, unit: product.unit }, data: { stock: { increment: quantity } } });
          if (credit.count !== 1) throw new BadRequestException('Produto indisponível no destino');
          await tx.stockLot.create({ data: { productId: destination.id, quantity, remaining: quantity, costPrice: product.priceCost, lotNumber: `TRANSF-${transferId}` } });
          await tx.inventoryLog.create({ data: { id: transferId, productId: destination.id, type: 'transfer_in', quantity,
            origin: 'GROUP_TRANSFER', referenceId: transferId, referenceKey: body.fromTenantId, reason: 'Recebimento entre lojas do grupo' } });
        });
      } catch (error) {
        // Um timeout de commit pode esconder um recebimento confirmado. Nunca
        // devolver à origem sem consultar o recibo durável no destino.
        let receipt;
        try { receipt = await toClient.inventoryLog.findUnique({ where: { id: transferId } }); }
        catch {
          this.logger.error(`Transferência ${transferId}: confirmação pendente no destino`);
          throw new BadRequestException(`Não foi possível confirmar a transferência ${transferId}. Confira os saldos antes de repetir; a origem está reservada.`);
        }
        if (!receipt) {
          try {
            await fromClient.$transaction(async tx => {
              await tx.product.update({ where: { id: product.id }, data: { stock: { increment: quantity } } });
              for (const lot of consumed) await tx.stockLot.update({ where: { id: lot.id }, data: { remaining: { increment: lot.quantity } } });
              await tx.inventoryLog.update({ where: { id: transferId }, data: { type: 'transfer_cancelled', reason: 'Destino falhou; saldo e lotes devolvidos à origem' } });
            });
          } catch {
            this.logger.error(`Transferência ${transferId}: falha na compensação`);
            throw new BadRequestException(`Transferência ${transferId} pendente de conferência. Não repita a operação; verifique o saldo da origem.`);
          }
          throw new BadRequestException('Não foi possível receber na loja destino. O saldo da origem foi restaurado.');
        }
      }
      return { success: true, transferId };
    } finally {
      this.productsService.invalidateCache(body.fromTenantId);
      this.productsService.invalidateCache(body.toTenantId);
      await Promise.allSettled([fromClient.$disconnect(), toClient.$disconnect()]);
    }
  }

  async getRecentTransfers(groupId: string) {
    const group = await this.getGroupWithMembers(groupId);
    const transfers: any[] = [];
    const unavailableTenants: string[] = [];
    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const logs = await client.inventoryLog.findMany({ where: { type: { in: ['transfer_out', 'transfer_cancelled'] }, origin: 'GROUP_TRANSFER' }, orderBy: { createdAt: 'desc' }, take: 5, include: { product: { select: { name: true, unit: true } } } });
        for (const log of logs) {
          const target = group.members.find(m => m.tenantId === log.referenceKey);
          let status = log.type === 'transfer_cancelled' ? 'cancelled' : 'pending';
          if (target && status === 'pending') {
            const receiver = this.createTenantClient(target.tenant.databaseUrl);
            try { if (await receiver.inventoryLog.findFirst({ where: { id: log.id, type: 'transfer_in' } })) status = 'completed'; }
            catch { /* Sem confirmação, manter pendente visível ao gestor. */ }
            finally { await receiver.$disconnect(); }
          }
          transfers.push({ id: log.id, productName: log.product.name, unit: log.product.unit, quantity: Math.abs(Number(log.quantity)), createdAt: log.createdAt, status,
            fromAlias: member.alias ?? member.tenant.nomeFantasia ?? member.tenant.name,
            toAlias: target ? target.alias ?? target.tenant.nomeFantasia ?? target.tenant.name : 'Loja removida do grupo' });
        }
      } catch { unavailableTenants.push(member.tenantId); }
      finally { await client.$disconnect(); }
    }
    return { transfers: transfers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5), unavailableTenants };
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async getGroupProducts(groupId: string) {
    const group = await this.getGroupWithMembers(groupId);
    const allProducts: any[] = [];

    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const products = await client.product.findMany({
          where: { active: true },
          select: { id: true, name: true, priceSell: true, priceCost: true, unit: true, stock: true },
        });
        for (const p of products) {
          allProducts.push({
            ...p,
            priceSell: Number(p.priceSell ?? 0),
            priceCost: Number(p.priceCost ?? 0),
            stock: Number(p.stock ?? 0),
            tenantId: member.tenantId,
            tenantAlias: member.alias ?? member.tenant.nomeFantasia ?? member.tenant.name,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Products erro tenant ${member.tenantId}: ${err.message}`);
      } finally {
        await client.$disconnect();
      }
    }

    return { groupId, groupName: group.name, products: allProducts };
  }

  async createProductAllTenants(
    groupId: string,
    body: { name: string; priceSell: number; priceCost: number; unit: string; categoryName: string },
  ) {
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];

    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        // Find or create category
        let category = await client.category.findFirst({ where: { name: body.categoryName } });
        if (!category) {
          category = await client.category.create({ data: { name: body.categoryName } });
        }

        const existing = await client.product.findFirst({ where: { name: body.name, unit: body.unit } });
        const product = await client.product.upsert({
          where: { id: existing?.id ?? randomUUID() },
          update: { priceSell: body.priceSell, priceCost: body.priceCost, unit: body.unit },
          create: {
            name: body.name,
            priceSell: body.priceSell,
            priceCost: body.priceCost,
            unit: body.unit,
            categoryId: category.id,
            stock: 0,
          },
        });

        results.push({ tenantId: member.tenantId, success: true, productId: product.id });
      } catch (err: any) {
        this.logger.warn(`CreateProduct erro tenant ${member.tenantId}: ${err.message}`);
        results.push({ tenantId: member.tenantId, success: false, error: err.message });
      } finally {
        await client.$disconnect();
      }
    }

    return { groupId, results };
  }

  async updatePriceAllTenants(
    groupId: string,
    body: { productName: string; priceSell: number },
  ) {
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];

    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const updated = await client.product.updateMany({
          where: { name: body.productName },
          data: { priceSell: body.priceSell },
        });
        results.push({ tenantId: member.tenantId, success: true, updatedCount: updated.count });
      } catch (err: any) {
        this.logger.warn(`UpdatePrice erro tenant ${member.tenantId}: ${err.message}`);
        results.push({ tenantId: member.tenantId, success: false, error: err.message });
      } finally {
        await client.$disconnect();
      }
    }

    return { groupId, results };
  }

  // ── Group Owner User Management ────────────────────────────────────────────

  async createGroupOwnerUser(
    groupId: string,
    body: { name: string; email: string; password: string },
  ) {
    const group = await this.getGroupWithMembers(groupId);
    if (!group.members.length) throw new BadRequestException('Grupo sem empresas vinculadas');

    // Usa o primeiro tenant do grupo como "tenant de hospedagem" do usuário
    const hostTenantId = group.members[0].tenantId;

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await this.heartPrisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
        role: 'group_owner',
        tenantId: hostTenantId,
        groupId,
      },
      select: { id: true, name: true, email: true, role: true, groupId: true, createdAt: true },
    });

    return user;
  }

  async getGroupUsers(groupId: string) {
    await this.getGroupWithMembers(groupId);
    return this.heartPrisma.user.findMany({
      where: { groupId },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async deleteGroupUser(groupId: string, userId: string) {
    const user = await this.heartPrisma.user.findFirst({ where: { id: userId, groupId } });
    if (!user) throw new NotFoundException('Usuário não encontrado neste grupo');
    await this.heartPrisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  // ── Forecast ───────────────────────────────────────────────────────────────

  async getPurchaseForecast(groupId: string, daysToForecast: number = 15) {
    const group = await this.getGroupWithMembers(groupId);
    if (!Number.isInteger(daysToForecast) || daysToForecast < 1 || daysToForecast > 365) throw new BadRequestException('Informe um prazo entre 1 e 365 dias');
    const productAgg = new Map<string, { name: string, totalStock: number, totalSold30d: number }>();
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const member of group.members) {
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const [products, sales30d] = await Promise.all([
          client.product.findMany({ select: { id: true, name: true, unit: true, stock: true, barcode: true }, where: { active: true } }),
          client.saleItem.groupBy({
            by: ['productId'],
            where: { sale: { createdAt: { gte: thirtyDaysAgo }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] } },
            _sum: { quantity: true },
          })
        ]);

        const salesMap = new Map<string, number>(sales30d.map((s: any) => [s.productId, Number(s._sum.quantity ?? 0)]));

        const keyCounts = new Map<string, number>();
        for (const p of products) keyCounts.set(this.productKey(p), (keyCounts.get(this.productKey(p)) ?? 0) + 1);
        for (const p of products) {
          const currentStock = Number(p.stock);
          const sold = salesMap.has(p.id) ? salesMap.get(p.id)! : 0;
          
          const base = this.productKey(p);
          const key = keyCounts.get(base)! > 1 ? `${base}:${member.tenantId}:${p.id}` : base;
          if (!productAgg.has(key)) {
            productAgg.set(key, { name: p.name, totalStock: 0, totalSold30d: 0 });
          }
          const agg = productAgg.get(key)!;
          agg.totalStock += currentStock;
          agg.totalSold30d += sold;
        }

      } catch (err: any) {
        this.logger.warn(`Forecast erro tenant ${member.tenantId}: ${err.message}`);
      } finally {
        await client.$disconnect();
      }
    }

    const forecast = Array.from(productAgg.entries()).map(([productId, data]) => {
      const avgDailySales = data.totalSold30d / 30;
      const autonomyDays = avgDailySales > 0 ? Math.max(0, data.totalStock) / avgDailySales : null;
      
      const targetStock = avgDailySales * daysToForecast;
      const suggestion = targetStock - data.totalStock;

      return {
        productId,
        name: data.name,
        totalStock: data.totalStock,
        avgDailySales: Number(avgDailySales.toFixed(2)),
        autonomyDays: autonomyDays === null ? null : Number(autonomyDays.toFixed(1)),
        suggestion: avgDailySales > 0 && suggestion > 0 ? Math.ceil(suggestion) : 0,
      };
    });

    forecast.sort((a, b) => b.suggestion - a.suggestion || (a.autonomyDays ?? Number.MAX_VALUE) - (b.autonomyDays ?? Number.MAX_VALUE));

    return forecast;
  }

  // ── Tenant Detail (recent sales + critical stock) ─────────────────────────

  async getTenantDetail(groupId: string, tenantId: string) {
    const group = await this.getGroupWithMembers(groupId);
    const member = group.members.find((m) => m.tenantId === tenantId);
    if (!member) throw new NotFoundException('Tenant não faz parte deste grupo');

    const client = this.createTenantClient(member.tenant.databaseUrl);
    try {
      const [recentSales, criticalStock] = await Promise.all([
        client.sale.findMany({
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: {
            items: { include: { product: { select: { name: true } } }, take: 3 },
            payments: { select: { method: true, label: true, value: true } },
          },
        }),
        client.product.findMany({
          where: { active: true, stock: { lt: 3 } },
          select: { id: true, name: true, stock: true, unit: true },
          orderBy: { stock: 'asc' },
          take: 10,
        }),
      ]);

      return {
        tenantId,
        alias: member.alias ?? member.tenant.nomeFantasia ?? member.tenant.name,
        recentSales: recentSales.map((s) => ({
          id: s.id,
          total: Number(s.total),
          createdAt: s.createdAt,
          itemsCount: s.items.length,
          firstItems: s.items.slice(0, 3).map((i) => i.product?.name ?? 'Produto'),
          payments: s.payments.map((p) => ({
            method: p.method,
            label: p.label,
            value: Number(p.value),
          })),
        })),
        criticalStock: criticalStock.map((p) => ({
          id: p.id,
          name: p.name,
          stock: Number(p.stock),
          unit: p.unit,
        })),
      };
    } finally {
      await client.$disconnect();
    }
  }

  // ── Stock Adjust (direct quantity set) ───────────────────────────────────

  async stockAdjust(
    groupId: string,
    body: { tenantId: string; productId: string; newStock: number; expectedStock?: number },
  ) {
    if (!Number.isFinite(body.newStock) || body.newStock < 0 || body.newStock > 9999999.999 || Math.abs(body.newStock * 1000 - Math.round(body.newStock * 1000)) > 0.000001) {
      throw new BadRequestException('Informe um saldo válido com até 3 casas decimais');
    }
    const group = await this.getGroupWithMembers(groupId);
    const member = group.members.find(m => m.tenantId === body.tenantId);
    if (!member) throw new NotFoundException('Tenant não faz parte deste grupo');
    const client = this.createTenantClient(member.tenant.databaseUrl);
    try {
      await client.$transaction(async tx => {
        const product = await tx.product.findUnique({ where: { id: body.productId } });
        if (!product) throw new NotFoundException('Produto não encontrado');
        if (body.expectedStock !== undefined && body.expectedStock !== Number(product.stock)) throw new BadRequestException('O saldo mudou durante a edição. Atualize e tente novamente.');
        const changed = await tx.product.updateMany({ where: { id: product.id, stock: product.stock }, data: { stock: body.newStock } });
        if (changed.count !== 1) throw new BadRequestException('O saldo mudou durante a edição. Atualize e tente novamente.');
        const diff = body.newStock - Number(product.stock);
        if (diff > 0) await tx.stockLot.create({ data: { productId: product.id, quantity: diff, remaining: diff, costPrice: product.priceCost } });
        if (diff < 0) {
          const lots = await tx.stockLot.findMany({ where: { productId: product.id, remaining: { gt: 0 } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
          let remaining = -diff;
          for (const lot of lots) {
            if (remaining <= 0) break;
            const amount = Math.min(Number(lot.remaining), remaining);
            const changedLot = await tx.stockLot.updateMany({ where: { id: lot.id, remaining: { gte: amount } }, data: { remaining: { decrement: amount } } });
            if (changedLot.count !== 1) throw new BadRequestException('Os lotes mudaram. Atualize e tente novamente.');
            remaining = Math.round((remaining - amount) * 1000) / 1000;
          }
        }
        await tx.inventoryLog.create({ data: { productId: product.id, type: diff >= 0 ? 'IN' : 'OUT', quantity: Math.abs(diff), reason: 'Ajuste via Portal Grupo' } });
      });
      this.productsService.invalidateCache(body.tenantId);
      return { success: true, newStock: body.newStock };
    } finally { await client.$disconnect(); }
  }

  // ── Products Catalog (consolidated with prices per tenant) ────────────────

  async getProductsCatalog(groupId: string) {
    const group = await this.getGroupWithMembers(groupId);
    const catalog = new Map<string, { key: string; name: string; barcode: string | null; unit: string; tenants: Record<string, any> }>();
    const tenantLabels: Record<string, string> = {};
    for (const member of group.members) {
      tenantLabels[member.tenantId] = member.alias;
      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        const products = await client.product.findMany({ where: { active: true },
          select: { id: true, name: true, priceSell: true, priceCost: true, stock: true, unit: true, barcode: true, ncm: true, imageUrl: true } });
        const counts = new Map<string, number>();
        for (const p of products) counts.set(this.productKey(p), (counts.get(this.productKey(p)) ?? 0) + 1);
        for (const p of products) {
          const base = this.productKey(p);
          // Cadastros homônimos sem EAN não têm identidade compartilhada confiável.
          const key = counts.get(base)! > 1 ? `${base}:${member.tenantId}:${p.id}` : base;
          if (!catalog.has(key)) catalog.set(key, { key, name: p.name, barcode: p.barcode, unit: p.unit, tenants: {} });
          catalog.get(key)!.tenants[member.tenantId] = { ...p, priceSell: Number(p.priceSell), priceCost: Number(p.priceCost), stock: Number(p.stock) };
        }
      } catch (err: any) {
        this.logger.warn(`Catalog erro tenant ${member.tenantId}: ${err.message}`);
        throw new ServiceUnavailableException(`Não foi possível consultar a loja ${member.alias}. Atualize antes de alterar o catálogo.`);
      } finally { await client.$disconnect(); }
    }
    return { groupId, groupName: group.name, tenantLabels, rows: [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)) };
  }

  // ── Update price per tenant (individual or all) ───────────────────────────

  async updatePricePerTenant(
    groupId: string,
    body: { productName: string; updates: { tenantId: string; productId?: string; priceSell: number; priceCost?: number }[] },
  ) {
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];

    for (const update of body.updates) {
      const member = group.members.find((m) => m.tenantId === update.tenantId);
      if (!member) { results.push({ tenantId: update.tenantId, success: false, error: 'Tenant não no grupo' }); continue; }

      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        if (!Number.isFinite(update.priceSell) || update.priceSell < 0 || (update.priceCost !== undefined && (!Number.isFinite(update.priceCost) || update.priceCost < 0))) throw new BadRequestException('Preço inválido');
        const data: Prisma.ProductUpdateManyMutationInput = { priceSell: update.priceSell };
        if (update.priceCost !== undefined) data.priceCost = update.priceCost;
        const candidates = await client.product.findMany({ where: { ...(update.productId ? { id: update.productId } : { name: body.productName }), active: true }, select: { id: true }, take: 2 });
        if (candidates.length !== 1) throw new BadRequestException('Produto ausente ou nome ambíguo. Selecione o cadastro pelo código no catálogo.');
        const updated = await client.product.updateMany({ where: { id: candidates[0].id, active: true }, data });
        this.productsService.invalidateCache(update.tenantId);
        results.push({ tenantId: update.tenantId, success: updated.count > 0, updatedCount: updated.count, ...(updated.count === 0 ? { error: 'Produto não encontrado na loja' } : {}) });
      } catch (err: any) {
        results.push({ tenantId: update.tenantId, success: false, error: err.message });
      } finally {
        await client.$disconnect();
      }
    }
    return { groupId, results };
  }

  // ── Create product in selected tenants ────────────────────────────────────

  async createProductInTenants(
    groupId: string,
    body: {
      name: string;
      barcode?: string;
      ncm?: string;
      unit: string;
      categoryName: string;
      priceCost: number;
      tenantPrices: { tenantId: string; priceSell: number }[];
    },
  ) {
    if (!body.name?.trim() || !body.categoryName?.trim() || !body.unit?.trim() || !Number.isFinite(body.priceCost) || body.priceCost < 0 || !Array.isArray(body.tenantPrices) || !body.tenantPrices.length || body.tenantPrices.some(p => !Number.isFinite(p.priceSell) || p.priceSell < 0)) {
      throw new BadRequestException('Informe nome, categoria, unidade e preços válidos para as lojas selecionadas');
    }
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];

    for (const tp of body.tenantPrices) {
      const member = group.members.find((m) => m.tenantId === tp.tenantId);
      if (!member) { results.push({ tenantId: tp.tenantId, success: false, error: 'Tenant não no grupo' }); continue; }

      const client = this.createTenantClient(member.tenant.databaseUrl);
      try {
        let category = await client.category.findFirst({ where: { name: body.categoryName } });
        if (!category) category = await client.category.create({ data: { name: body.categoryName } });

        const matches = await client.product.findMany({ where: body.barcode ? { barcode: body.barcode } : { name: body.name, unit: body.unit, barcode: null }, take: 2 });
        if (matches.length > 1) throw new BadRequestException('Nome ambíguo. Informe um código de barras para identificar o produto.');
        const existing = matches[0];
        if (existing) throw new BadRequestException('Produto já cadastrado nesta loja. Use a edição de preços para alterar o cadastro existente.');
        const product = await client.product.create({
          data: {
            name: body.name,
            priceSell: tp.priceSell,
            priceCost: body.priceCost,
            unit: body.unit,
            categoryId: category.id,
            stock: 0,
            ...(body.barcode ? { barcode: body.barcode } : {}),
            ...(body.ncm ? { ncm: body.ncm } : {}),
          },
        });
        this.productsService.invalidateCache(tp.tenantId);
        results.push({ tenantId: tp.tenantId, success: true, productId: product.id });
      } catch (err: any) {
        results.push({ tenantId: tp.tenantId, success: false, error: err.message });
      } finally {
        await client.$disconnect();
      }
    }
    return { groupId, results };
  }

  // ── Sync Check: products present in some tenants but not others ───────────

  async getSyncStatus(groupId: string) {
    const catalog = await this.getProductsCatalog(groupId);
    const allTenantIds = Object.keys(catalog.tenantLabels);
    const missingProducts = catalog.rows.flatMap(row => {
      const presentIn = Object.keys(row.tenants);
      const missingIn = allTenantIds.filter(id => !row.tenants[id]);
      return missingIn.length ? [{ key: row.key, name: row.name, barcode: row.barcode, unit: row.unit, presentIn, missingIn,
        sourceTenantId: presentIn[0], sourceProductId: row.tenants[presentIn[0]].id, productData: row.tenants[presentIn[0]] }] : [];
    });
    return { groupId, tenantLabels: catalog.tenantLabels, hasDifferences: missingProducts.length > 0, missingProducts };
  }

  // ── Sync Products to missing tenants ─────────────────────────────────────

  async syncProductsToTenants(
    groupId: string,
    body: { products: { name: string; targetTenantIds: string[]; sourceTenantId?: string; sourceProductId?: string }[] },
  ) {
    const group = await this.getGroupWithMembers(groupId);
    const results: any[] = [];

    for (const item of body.products) {
      // Find source data (from any tenant that has the product)
      let sourceData: any = null;
      let sourceCategoryName = 'Geral';

      for (const member of group.members) {
        if (item.targetTenantIds.includes(member.tenantId) || (item.sourceTenantId && item.sourceTenantId !== member.tenantId)) continue;
        const client = this.createTenantClient(member.tenant.databaseUrl);
        try {
          const candidates = await client.product.findMany({
            where: { ...(item.sourceProductId ? { id: item.sourceProductId } : { name: item.name }), active: true },
            include: { category: { select: { name: true } } }, take: 2,
          });
          const p = candidates.length === 1 ? candidates[0] : null;
          if (p) {
            sourceData = p;
            sourceCategoryName = (p as any).category?.name ?? 'Geral';
            break;
          }
        } catch { } finally { await client.$disconnect(); }
      }

      if (!sourceData) { results.push({ name: item.name, success: false, error: 'Produto ausente ou ambíguo na origem. Atualize a seleção.' }); continue; }

      // Create in target tenants
      for (const targetTenantId of item.targetTenantIds) {
        const member = group.members.find((m) => m.tenantId === targetTenantId);
        if (!member) { results.push({ name: item.name, tenantId: targetTenantId, success: false, error: 'Loja não pertence ao grupo' }); continue; }
        const client = this.createTenantClient(member.tenant.databaseUrl);
        try {
          let category = await client.category.findFirst({ where: { name: sourceCategoryName } });
          if (!category) category = await client.category.create({ data: { name: sourceCategoryName } });
          const matches = await client.product.findMany({ where: sourceData.barcode ? { barcode: sourceData.barcode } : { name: sourceData.name, unit: sourceData.unit, barcode: null }, take: 2 });
          if (matches.length > 1) throw new BadRequestException('Mais de um cadastro sem código de barras no destino. Revise os produtos.');
          const existing = matches[0];
          if (existing) throw new BadRequestException('Produto já cadastrado no destino. Atualize o catálogo antes de sincronizar.');
          await client.product.create({
            data: {
              name: sourceData.name,
              cest: sourceData.cest, origem: sourceData.origem, emiteNfce: sourceData.emiteNfce, imageUrl: sourceData.imageUrl,
              priceSell: sourceData.priceSell,
              priceCost: sourceData.priceCost,
              unit: sourceData.unit,
              categoryId: category.id,
              stock: 0,
              ...(sourceData.barcode ? { barcode: sourceData.barcode } : {}),
              ...(sourceData.ncm ? { ncm: sourceData.ncm } : {}),
            },
          });
          this.productsService.invalidateCache(targetTenantId);
          results.push({ name: item.name, tenantId: targetTenantId, success: true });
        } catch (err: any) {
          results.push({ name: item.name, tenantId: targetTenantId, success: false, error: err.message });
        } finally {
          await client.$disconnect();
        }
      }
    }
    return { groupId, results };
  }
}
