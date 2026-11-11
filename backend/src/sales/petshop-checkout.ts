import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function recordAddedServiceCommissions(tx: any, appointment: any, tenantId: string, at: Date) {
  const history = Array.isArray(appointment.stageHistory) ? appointment.stageHistory : [];
  const entries = history.filter((entry: any) => entry?.kind === 'service_added' && entry.operatorId && entry.commissionRuleId);
  if (!entries.length) return;
  const services = await tx.petAppointmentService.findMany({ where: { appointmentId: appointment.id, id: { in: entries.map((entry: any) => entry.appointmentServiceId) } } });
  const byId = new Map<string, any>(services.map((service: any) => [service.id, service]));
  for (const entry of entries) {
    const service = byId.get(entry.appointmentServiceId);
    if (!service) continue; // Serviço retirado antes da cobrança.
    const rule = await tx.petCommissionRule.findUnique({ where: { id: entry.commissionRuleId } });
    if (!rule || rule.serviceId !== service.serviceId || !['FIXED', 'PERCENT'].includes(rule.kind)) throw new BadRequestException('Regra de comissão do adicional inválida. Revise o cadastro antes de cobrar.');
    const base = new Prisma.Decimal(service.priceSnapshot);
    const amount = (rule.kind === 'FIXED' ? new Prisma.Decimal(rule.value) : base.mul(rule.value).div(100))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await tx.petCommission.createMany({ data: [{
      tenantId, appointmentId: appointment.id, appointmentServiceId: service.id,
      operatorId: entry.operatorId, stageKey: 'service_added', executedAt: at,
      baseAmount: base, ruleId: rule.id, ruleVersion: rule.version,
      ruleKind: rule.kind, ruleValue: rule.value, amount,
    }], skipDuplicates: true });
  }
}

export function appointmentFromComanda(notes?: string | null): string | null {
  if (!notes) return null;
  const prefix = notes.startsWith('PET2:') ? 'PET2:' : notes.startsWith('PETSHOP_LINK_V1:') ? 'PETSHOP_LINK_V1:' : null;
  if (!prefix) return null;
  try {
    const value = JSON.parse(notes.slice(prefix.length));
    const id = prefix === 'PET2:' ? value.a : value.appointment?.id;
    if (typeof id === 'string' && id) return id;
  } catch { /* A broken pet link must never silently become an ordinary sale. */ }
  throw new BadRequestException('Vínculo do atendimento inválido. Reabra a cobrança pela Agenda.');
}

export async function claimPetshopCheckout(tx: any, data: any, comanda: any) {
  const linkedId = appointmentFromComanda(comanda?.notes);
  const requestedId = data.petshopAppointmentId ? String(data.petshopAppointmentId) : null;
  if (!linkedId && !requestedId) return null;
  if (!linkedId || (requestedId && requestedId !== linkedId)) {
    throw new BadRequestException('Cobrança deve usar a comanda vinculada ao atendimento. Reabra pela Agenda.');
  }
  await tx.$queryRaw`SELECT id FROM pet_appointments WHERE id = ${linkedId} FOR UPDATE`;
  const appointment = await tx.petAppointment.findUnique({ where: { id: linkedId } });
  if (!appointment) throw new BadRequestException('Atendimento não encontrado.');
  if (appointment.status === 'delivered' || appointment.completedAt) {
    throw new ConflictException('Atendimento já cobrado e concluído. Cobrança em duplicidade bloqueada.');
  }
  if (Array.isArray(appointment.stageHistory) && appointment.stageHistory.some((event: any) => event?.kind === 'prepayment')) {
    const activePayment = await tx.comanda.findFirst({ where: { notes: { contains: linkedId }, status: 'closed', sale: { is: { status: 'completed' } } }, select: { id: true } });
    if (activePayment) throw new ConflictException('Agendamento já pago antecipadamente. Cobrança em duplicidade bloqueada.');
  }
  if (data.petshopPrepayment) {
    if (!['requested', 'scheduled'].includes(appointment.status)) throw new BadRequestException('Pagamento antecipado permitido somente antes do início do atendimento.');
  } else if (appointment.status !== 'ready') throw new BadRequestException('Conclua os cuidados antes de cobrar o atendimento.');
  return linkedId;
}

export async function completePetshopCheckout(tx: any, appointmentId: string | null, actorId: string | null, tenantId: string, prepayment = false) {
  if (!appointmentId) return;
  const appointment = await tx.petAppointment.findUnique({ where: { id: appointmentId } });
  const now = new Date();
  if (prepayment) {
    await tx.petAppointment.update({ where: { id: appointmentId }, data: {
      stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
        kind: 'prepayment', status: appointment.status, label: 'Pagamento antecipado no agendamento', at: now.toISOString(), userId: actorId,
      }],
    } });
    return;
  }
  await recordAddedServiceCommissions(tx, appointment, tenantId, now);
  await tx.petAppointment.update({ where: { id: appointmentId }, data: {
    status: 'delivered', completedAt: now,
    stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
      status: 'delivered', label: 'Concluído no caixa', at: now.toISOString(), userId: actorId, skipped: false,
    }],
  } });
}
