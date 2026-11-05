import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PetshopPricingService } from './petshop-pricing.service';
import { pinVersion } from '../auth/operator-session';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const ZERO = D(0);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const ADMIN_ROLES = new Set(['admin', 'superadmin']);
const currentPeriod = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
};

@Injectable()
export class PetshopCommissionsService {
  constructor(private readonly tenants: TenantConnectionManager, private readonly context: TenantContextService, private readonly jwt: JwtService, private readonly pricing: PetshopPricingService) {}

  private async db() {
    const { tenantId, databaseUrl } = this.context.get();
    return this.tenants.getTenantClient(tenantId, databaseUrl);
  }

  assertAdmin(req: any) {
    if (req?.user?.type || !ADMIN_ROLES.has(req?.user?.role)) throw new ForbiddenException('Acesso financeiro restrito à administração.');
  }

  async sessionOperator(req: any, databaseUrl?: string) {
    const token = req?.headers?.['x-operator-token'];
    let payload: any;
    try { payload = this.jwt.verify(token); } catch { throw new UnauthorizedException({ message: 'Identifique o colaborador com PIN.', errorSource: 'operator_token' }); }
    if (payload?.type !== 'op' || payload?.tenantId !== req.user?.tenantId || payload.context !== 'petshop') {
      throw new ForbiddenException('Sessão operacional inválida.');
    }
    const db = databaseUrl ? await this.tenants.getTenantClient(req.user.tenantId, databaseUrl) : await this.db();
    const operator = await db.operator.findFirst({ where: { id: payload.opId, active: true }, select: { id: true, name: true, pin: true, isManager: true } });
    if (!operator) throw new ForbiddenException('Colaborador inativo.');
    if (!payload.pinVersion || payload.pinVersion !== pinVersion(operator.pin, process.env.JWT_SECRET!)) throw new UnauthorizedException({ message: 'PIN alterado. Identifique-se novamente.', errorSource: 'operator_token' });
    return { id: operator.id, name: operator.name, isManager: operator.isManager };
  }

  private validateRule(body: any) {
    const stageKey = String(body?.stageKey || '').trim();
    const serviceId = body?.serviceId ? String(body.serviceId) : null;
    const operatorId = body?.operatorId ? String(body.operatorId) : null;
    const kind = String(body?.kind || 'NONE').toUpperCase();
    if (!/^[a-z0-9_-]{2,60}$/.test(stageKey)) throw new BadRequestException('Etapa inválida.');
    if (!['NONE', 'PERCENT', 'FIXED'].includes(kind)) throw new BadRequestException('Tipo de comissão inválido.');
    const raw = String(body?.value ?? '0').trim();
    if (!/^\d+(\.\d{1,4})?$/.test(raw)) throw new BadRequestException('Valor deve ser decimal positivo com até quatro casas.');
    const value = D(raw);
    if (kind === 'PERCENT' && value.gt(100)) throw new BadRequestException('Percentual deve ser no máximo 100.');
    if (kind === 'FIXED' && value.decimalPlaces() > 2) throw new BadRequestException('Valor fixo deve ter até duas casas decimais.');
    if (kind === 'NONE' && !value.isZero()) throw new BadRequestException('Regra sem comissão deve ter valor zero.');
    return { stageKey, serviceId, operatorId, kind, value };
  }

  async saveRule(req: any, body: any) {
    this.assertAdmin(req);
    const input = this.validateRule(body);
    const db = await this.db();
    const stageSettings = await db.tenantSettings.findUnique({ where: { id: 'petshop_stages' } });
    const stages = (stageSettings?.paymentMethodsConfig as any)?.stages || [];
    if (!stages.some((stage: any) => stage.key === input.stageKey && stage.trackProfessional)) throw new BadRequestException('Ative o rastreamento desta etapa antes de configurar comissão.');
    if (input.serviceId && !await db.petService.findUnique({ where: { id: input.serviceId }, select: { id: true } })) throw new BadRequestException('Serviço inválido.');
    if (input.operatorId && !await db.operator.findUnique({ where: { id: input.operatorId }, select: { id: true } })) throw new BadRequestException('Colaborador inválido.');
    return db.$transaction(async tx => {
      const latest = await tx.petCommissionRule.findFirst({ where: { stageKey: input.stageKey, serviceId: input.serviceId, operatorId: input.operatorId }, orderBy: { version: 'desc' } });
      if (latest?.active) await tx.petCommissionRule.update({ where: { id: latest.id }, data: { active: false } });
      return tx.petCommissionRule.create({ data: { ...input, scopeKey: `${input.stageKey}:${input.serviceId || '*'}:${input.operatorId || '*'}`, version: (latest?.version || 0) + 1, createdById: (req.user.sub || req.user.id) } });
    });
  }

  async listRules(req: any) {
    this.assertAdmin(req);
    const db = await this.db();
    return db.petCommissionRule.findMany({ where: { active: true }, orderBy: [{ stageKey: 'asc' }, { serviceId: 'asc' }, { operatorId: 'asc' }] });
  }

  // Precedência: serviço+profissional > profissional > serviço > etapa geral.
  private resolveRule(rules: any[], serviceId: string, operatorId: string) {
    return rules.filter(r => (!r.serviceId || r.serviceId === serviceId) && (!r.operatorId || r.operatorId === operatorId))
      .sort((a, b) => (Number(Boolean(b.serviceId)) + Number(Boolean(b.operatorId)) * 2) - (Number(Boolean(a.serviceId)) + Number(Boolean(a.operatorId)) * 2))[0];
  }

  // A receita do combo reside exclusivamente no item pai. Distribuição proporcional
  // aos preços individuais congelados na criação; último filho recebe o resíduo.
  private bases(services: any[]): Map<string, Prisma.Decimal> {
    const result = new Map<string, Prisma.Decimal>();
    for (const item of services) if (!item.isCombo && !item.comboParentId) {
      const packageBase = ['reserved', 'consumed'].includes(item.coverageStatus) && item.customerPackageItem
        ? D(item.customerPackageItem.unitValueSnapshot) : null;
      result.set(item.id, money(packageBase ?? D(item.priceSnapshot)));
    }
    for (const parent of services.filter(s => s.isCombo)) {
      const children = services.filter(s => s.comboParentId === parent.id);
      if (!children.length) continue;
      const packageBase = ['reserved', 'consumed'].includes(parent.coverageStatus) && parent.customerPackageItem
        ? D(parent.customerPackageItem.unitValueSnapshot) : null;
      const total = money(packageBase ?? D(parent.priceSnapshot));
      const weights = children.map(s => D(s.commissionWeightSnapshot ?? s.service?.price ?? 0));
      const sum = weights.reduce((a, b) => a.plus(b), ZERO);
      let allocated = ZERO;
      children.forEach((child, index) => {
        const part = index === children.length - 1 ? total.minus(allocated) : money(sum.gt(0) ? total.mul(weights[index]).div(sum) : total.div(children.length));
        result.set(child.id, part);
        allocated = allocated.plus(part);
      });
    }
    return result;
  }

  async recordExecution(tx: Prisma.TransactionClient, appointment: any, stageKey: string, operatorId: string, at: Date) {
    const rules = await tx.petCommissionRule.findMany({ where: { stageKey, active: true } });
    const bases = this.bases(appointment.services);
    for (const item of appointment.services) {
      const base = bases.get(item.id);
      if (!base) continue;
      const configured = Array.isArray(item.service?.customStages) && item.service.customStages.length
        ? item.service.customStages : this.pricing.suggestStages(item.service?.name || item.nameSnapshot, item.service?.category);
      if (!configured.some((stage: any) => (typeof stage === 'string' ? stage : stage.key) === stageKey)) continue;
      const rule = this.resolveRule(rules, item.serviceId, operatorId);
      if (!rule) continue;
      const amount = rule.kind === 'PERCENT' ? money(base.mul(rule.value).div(100)) : rule.kind === 'FIXED' ? money(D(rule.value)) : ZERO;
      await tx.petCommission.createMany({ data: [{ tenantId: this.context.get().tenantId, appointmentId: appointment.id, appointmentServiceId: item.id, operatorId, stageKey, executedAt: at, baseAmount: base, ruleId: rule.id, ruleVersion: rule.version, ruleKind: rule.kind, ruleValue: rule.value, amount }], skipDuplicates: true });
    }
  }

  async reverseAppointmentInTx(tx: Prisma.TransactionClient, appointmentId: string, actorId: string, reason: string) {
    const rows = await tx.petCommission.findMany({ where: { appointmentId, state: { not: 'REVERSED' } } });
    for (const row of rows) {
      const changed = await tx.petCommission.updateMany({ where: { id: row.id, state: row.state }, data: { state: 'REVERSED', reversedAt: new Date(), reversedById: actorId, reversalReason: reason } });
      if (changed.count) await tx.petCommissionAdjustment.create({ data: { commissionId: row.id, amount: row.state === 'PAID' ? row.amount.negated() : ZERO, reason, actorId } });
    }
  }

  private periodRange(period: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException('Período deve estar no formato AAAA-MM.');
    const [year, month] = period.split('-').map(Number);
    return { gte: new Date(Date.UTC(year, month - 1, 1, 3)), lt: new Date(Date.UTC(year, month, 1, 3)) };
  }

  private inconsistency(row: { baseAmount: Prisma.Decimal; ruleKind: string; ruleValue: Prisma.Decimal; amount: Prisma.Decimal }) {
    const expected = row.ruleKind === 'PERCENT' ? money(D(row.baseAmount).mul(row.ruleValue).div(100))
      : row.ruleKind === 'FIXED' ? money(D(row.ruleValue)) : ZERO;
    if (D(row.baseAmount).lt(0)) return 'Base negativa';
    if (!expected.eq(row.amount)) return `Valor esperado ${expected.toFixed(2)}, registrado ${D(row.amount).toFixed(2)}`;
    return null;
  }

  async report(req: any, query: any) {
    this.assertAdmin(req);
    const db = await this.db();
    const period = String(query.period || currentPeriod());
    const where: any = { executedAt: this.periodRange(period) };
    if (query.operatorId) where.operatorId = String(query.operatorId);
    if (query.state) where.state = String(query.state);
    if (query.serviceId) where.appointmentService = { serviceId: String(query.serviceId) };
    const rows = await db.petCommission.findMany({ where, include: { operator: { select: { id: true, name: true } }, appointment: { select: { id: true, startsAt: true, pet: { select: { name: true } }, customer: { select: { name: true } } } }, appointmentService: { select: { serviceId: true, nameSnapshot: true } }, adjustments: true }, orderBy: [{ executedAt: 'desc' }, { id: 'desc' }] });
    const adjustments = await db.petCommissionAdjustment.findMany({ where: { createdAt: this.periodRange(period), ...(query.state ? { state: String(query.state) } : {}), commission: { ...(query.operatorId ? { operatorId: String(query.operatorId) } : {}), ...(query.serviceId ? { appointmentService: { serviceId: String(query.serviceId) } } : {}) } }, include: { commission: { include: { operator: { select: { id: true, name: true } }, appointment: { select: { id: true, startsAt: true, pet: { select: { name: true } }, customer: { select: { name: true } } } }, appointmentService: { select: { serviceId: true, nameSnapshot: true } } } } }, orderBy: { createdAt: 'desc' } });
    const totals = { generated: ZERO, pending: ZERO, approved: ZERO, paid: ZERO, reversed: ZERO };
    const byOperator = new Map<string, { id: string; name: string; procedures: number; amount: Prisma.Decimal }>();
    const byService = new Map<string, { serviceId: string; name: string; procedures: number; amount: Prisma.Decimal }>();
    for (const row of rows) {
      const adjusted = D(row.amount);
      if (row.state !== 'REVERSED') totals.generated = totals.generated.plus(adjusted);
      const bucket = row.state.toLowerCase() as 'pending' | 'approved' | 'paid' | 'reversed';
      totals[bucket] = totals[bucket].plus(adjusted);
      const op = byOperator.get(row.operatorId) || { id: row.operatorId, name: row.operator.name, procedures: 0, amount: ZERO };
      op.procedures++; if (row.state !== 'REVERSED') op.amount = op.amount.plus(adjusted); byOperator.set(row.operatorId, op);
      const service = byService.get(row.appointmentService.serviceId) || { serviceId: row.appointmentService.serviceId, name: row.appointmentService.nameSnapshot, procedures: 0, amount: ZERO };
      service.procedures++; if (row.state !== 'REVERSED') service.amount = service.amount.plus(adjusted); byService.set(service.serviceId, service);
    }
    for (const adjustment of adjustments) {
      const amount = D(adjustment.amount);
      totals.generated = totals.generated.plus(amount);
      totals[adjustment.state.toLowerCase() as 'pending' | 'approved' | 'paid'] = totals[adjustment.state.toLowerCase() as 'pending' | 'approved' | 'paid'].plus(amount);
      const original = adjustment.commission;
      const op = byOperator.get(original.operatorId) || { id: original.operatorId, name: original.operator.name, procedures: 0, amount: ZERO };
      op.amount = op.amount.plus(amount); byOperator.set(op.id, op);
      const item = original.appointmentService;
      const service = byService.get(item.serviceId) || { serviceId: item.serviceId, name: item.nameSnapshot, procedures: 0, amount: ZERO };
      service.amount = service.amount.plus(amount); byService.set(service.serviceId, service);
    }
    const inconsistencies = rows.map(row => ({ commissionId: row.id, reason: this.inconsistency(row) })).filter(item => item.reason);
    return { period, totals, procedures: rows.length, commissionableProcedures: rows.filter(r => r.amount.gt(0) && r.state !== 'REVERSED').length, byOperator: [...byOperator.values()], byService: [...byService.values()], rows, adjustments, inconsistencies };
  }

  async closings(req: any) { this.assertAdmin(req); const db = await this.db(); return db.petCommissionClosing.findMany({ orderBy: { period: 'desc' }, include: { _count: { select: { commissions: true } } } }); }

  async approve(req: any, period: string) {
    this.assertAdmin(req);
    const db = await this.db();
    const range = this.periodRange(period);
    if (period >= currentPeriod()) throw new BadRequestException('O fechamento mensal pode ser aprovado após o fim do mês.');
    return db.$transaction(async tx => {
      const pendingRows = await tx.petCommission.findMany({ where: { executedAt: range, state: 'PENDING' } });
      if (pendingRows.some(row => this.inconsistency(row))) throw new ConflictException('Há cálculos inconsistentes. Confira o extrato antes de aprovar.');
      const closing = await tx.petCommissionClosing.upsert({ where: { period }, create: { period }, update: {} });
      if (closing.state === 'PAID') throw new ConflictException('Fechamento já pago.');
      await tx.petCommission.updateMany({ where: { executedAt: range, state: 'PENDING' }, data: { state: 'APPROVED', closingId: closing.id, approvedAt: new Date(), approvedById: (req.user.sub || req.user.id) } });
      await tx.petCommissionAdjustment.updateMany({ where: { createdAt: range, state: 'PENDING' }, data: { state: 'APPROVED', closingId: closing.id, approvedAt: new Date(), approvedById: (req.user.sub || req.user.id) } });
      const rows = await tx.petCommission.findMany({ where: { closingId: closing.id, state: 'APPROVED' }, include: { adjustments: true } });
      const adjustmentRows = await tx.petCommissionAdjustment.findMany({ where: { closingId: closing.id, state: 'APPROVED' } });
      const approvedAmount = rows.reduce((sum, row) => sum.plus(row.amount), ZERO).plus(adjustmentRows.reduce((sum, row) => sum.plus(row.amount), ZERO));
      await tx.petCommissionClosing.update({ where: { id: closing.id }, data: { state: 'APPROVED', approvedAt: new Date(), approvedById: (req.user.sub || req.user.id), approvedAmount } });
      return tx.petCommissionClosing.findUnique({ where: { id: closing.id }, include: { commissions: true } });
    });
  }

  async pay(req: any, period: string, reference: string) {
    this.assertAdmin(req);
    const db = await this.db();
    const range = this.periodRange(period);
    if (period >= currentPeriod()) throw new BadRequestException('O pagamento mensal pode ser registrado após o fim do mês.');
    if (!reference?.trim()) throw new BadRequestException('Informe a referência do pagamento.');
    return db.$transaction(async tx => {
      const closing = await tx.petCommissionClosing.findUnique({ where: { period } });
      if (!closing || closing.state !== 'APPROVED') throw new ConflictException('Fechamento deve estar aprovado e ainda não pago.');
      const pending = await tx.petCommission.count({ where: { executedAt: range, state: 'PENDING' } });
      const pendingAdjustments = await tx.petCommissionAdjustment.count({ where: { createdAt: range, state: 'PENDING' } });
      if (pending || pendingAdjustments) throw new ConflictException('Há lançamentos pendentes neste período.');
      const approvedRows = await tx.petCommission.findMany({ where: { closingId: closing.id, state: 'APPROVED' } });
      const approvedAdjustments = await tx.petCommissionAdjustment.findMany({ where: { closingId: closing.id, state: 'APPROVED' } });
      const paidAmount = approvedRows.reduce((sum, row) => sum.plus(row.amount), ZERO).plus(approvedAdjustments.reduce((sum, row) => sum.plus(row.amount), ZERO));
      const changed = await tx.petCommissionClosing.updateMany({ where: { id: closing.id, state: 'APPROVED' }, data: { state: 'PAID', paidAt: new Date(), paidById: (req.user.sub || req.user.id), paymentRef: reference.trim(), paidAmount } });
      if (changed.count !== 1) throw new ConflictException('Pagamento já registrado.');
      await tx.petCommission.updateMany({ where: { closingId: closing.id, state: 'APPROVED' }, data: { state: 'PAID', paidAt: new Date(), paidById: (req.user.sub || req.user.id) } });
      await tx.petCommissionAdjustment.updateMany({ where: { closingId: closing.id, state: 'APPROVED' }, data: { state: 'PAID', paidAt: new Date(), paidById: (req.user.sub || req.user.id) } });
      return tx.petCommissionClosing.findUnique({ where: { id: closing.id } });
    });
  }

  async reverse(req: any, id: string, reason: string) {
    this.assertAdmin(req);
    if (!reason?.trim()) throw new BadRequestException('Informe o motivo do estorno.');
    const db = await this.db();
    return db.$transaction(async tx => {
      const row = await tx.petCommission.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Comissão não encontrada.');
      if (row.state === 'REVERSED') throw new ConflictException('Comissão já estornada.');
      const updated = await tx.petCommission.updateMany({ where: { id, state: row.state }, data: { state: 'REVERSED', reversedAt: new Date(), reversedById: (req.user.sub || req.user.id), reversalReason: reason.trim() } });
      if (updated.count !== 1) throw new ConflictException('Comissão alterada simultaneamente.');
      await tx.petCommissionAdjustment.create({ data: { commissionId: id, amount: row.state === 'PAID' ? row.amount.negated() : ZERO, reason: reason.trim(), actorId: (req.user.sub || req.user.id) } });
      return tx.petCommission.findUnique({ where: { id }, include: { adjustments: true } });
    });
  }

  async correct(req: any, id: string, body: any) {
    this.assertAdmin(req);
    const raw = String(body?.amount ?? '').trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(raw) || D(raw).isZero()) throw new BadRequestException('Informe um ajuste em reais, com até duas casas decimais.');
    const reason = String(body?.reason || '').trim();
    if (!reason) throw new BadRequestException('Informe o motivo da correção.');
    const db = await this.db();
    const commission = await db.petCommission.findUnique({ where: { id } });
    if (!commission) throw new NotFoundException('Comissão não encontrada.');
    if (commission.state === 'REVERSED') throw new ConflictException('Comissão estornada.');
    return db.petCommissionAdjustment.create({ data: { commissionId: id, amount: D(raw), reason, actorId: (req.user.sub || req.user.id) } });
  }
}
