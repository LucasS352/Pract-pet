import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const serviceIdFromNote = (note: unknown) => typeof note === 'string' && note.startsWith('Serviço Pet Shop:')
  ? note.slice('Serviço Pet Shop:'.length) : null;
export const chargedServiceIds = (comanda: any): string[] => (comanda?.items || [])
  .map((item: any) => serviceIdFromNote(item.notes)).filter((id: string | null): id is string => Boolean(id));
const hasTaxiChargeLine = (comanda: any): boolean => (comanda?.items || []).some(
  (item: any) => item?.notes === 'Táxi Dog Pet Shop' || item?.productId === 'petshop-taxi-dog-fee',
);

export async function recordAddedServiceCommissions(tx: any, appointment: any, tenantId: string, at: Date, serviceIds?: string[], activatePending = false) {
  const history = Array.isArray(appointment.stageHistory) ? appointment.stageHistory : [];
  const entries = history.filter((entry: any) => entry?.kind === 'service_added' && entry.operatorId && entry.commissionRuleId &&
    (!serviceIds || serviceIds.includes(entry.appointmentServiceId)));
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
    const existing = tx.petCommission.findUnique ? await tx.petCommission.findUnique({
      where: { appointmentServiceId_stageKey: { appointmentServiceId: service.id, stageKey: 'service_added' } },
    }) : null;
    if (existing) {
      if (existing.state === 'AWAITING_PAYMENT' && activatePending) await tx.petCommission.update({ where: { id: existing.id }, data: { state: 'PENDING', executedAt: at } });
      if (existing.state === 'REVERSED' && activatePending) await tx.petCommission.update({ where: { id: existing.id }, data: {
        state: 'PENDING', executedAt: at, closingId: null, approvedAt: null, approvedById: null,
        paidAt: null, paidById: null, reversedAt: null, reversedById: null, reversalReason: null,
      } });
      continue;
    }
    await tx.petCommission.createMany({ data: [{
      tenantId, appointmentId: appointment.id, appointmentServiceId: service.id,
      operatorId: entry.operatorId, stageKey: 'service_added', executedAt: at,
      baseAmount: base, ruleId: rule.id, ruleVersion: rule.version,
      ruleKind: rule.kind, ruleValue: rule.value, amount,
    }], skipDuplicates: true });
  }
}

export function appointmentLinkFromComanda(notes?: string | null): { appointmentId: string; isAddon: boolean } | null {
  if (!notes) return null;
  const prefix = notes.startsWith('PET2:') ? 'PET2:' : notes.startsWith('PETSHOP_LINK_V1:') ? 'PETSHOP_LINK_V1:' : null;
  if (!prefix) return null;
  try {
    const value = JSON.parse(notes.slice(prefix.length));
    const id = prefix === 'PET2:' ? value.a : value.appointment?.id;
    if (typeof id === 'string' && id) {
      return { appointmentId: id, isAddon: value?.addon === 1 || value?.addon === true };
    }
  } catch { /* A broken pet link must never silently become an ordinary sale. */ }
  throw new BadRequestException('Vínculo do atendimento inválido. Reabra a cobrança pela Agenda.');
}

export function appointmentFromComanda(notes?: string | null): string | null {
  return appointmentLinkFromComanda(notes)?.appointmentId ?? null;
}

export async function claimPetshopCheckout(tx: any, data: any, comanda: any) {
  const link = appointmentLinkFromComanda(comanda?.notes);
  const linkedId = link?.appointmentId ?? null;
  const isAddon = Boolean(link?.isAddon);
  const requestedId = data.petshopAppointmentId ? String(data.petshopAppointmentId) : null;
  if (!linkedId && !requestedId) return null;
  if (!linkedId || (requestedId && requestedId !== linkedId)) {
    throw new BadRequestException('Cobrança deve usar a comanda vinculada ao atendimento. Reabra pela Agenda.');
  }
  await tx.$queryRaw`SELECT id FROM pet_appointments WHERE id = ${linkedId} FOR UPDATE`;
  const appointment = await tx.petAppointment.findUnique({ where: { id: linkedId } });
  if (!appointment) throw new BadRequestException('Atendimento não encontrado.');

  if (['cancelled', 'no_show'].includes(appointment.status)) {
    throw new ConflictException('Atendimento cancelado não pode ser cobrado.');
  }

  const activePayment = tx.comanda?.findFirst
    ? await tx.comanda.findFirst({ where: { notes: { contains: linkedId }, status: 'closed', sale: { is: { status: 'completed' } } }, select: { id: true } })
    : null;
  if (isAddon && activePayment) {
    const serviceIds = chargedServiceIds(comanda);
    const hasTaxi = hasTaxiChargeLine(comanda);
    if (!serviceIds.length && !hasTaxi) throw new ConflictException('Adicional sem serviços novos para cobrar.');
    if (serviceIds.length) {
      if (new Set(serviceIds).size !== serviceIds.length) throw new ConflictException('Adicional sem serviços novos para cobrar.');
      const available = await tx.petAppointmentService.count({ where: { id: { in: serviceIds }, appointmentId: linkedId,
        chargedSaleId: null, coverageStatus: { notIn: ['reserved', 'consumed'] }, priceSnapshot: { gt: 0 } } });
      if (available !== serviceIds.length) throw new ConflictException('Serviço adicional já cobrado. Reabra a Agenda.');
    }
  }

  if (appointment.status === 'delivered' || appointment.completedAt) {
    if (!(isAddon && !data.petshopPrepayment)) {
      throw new ConflictException('Atendimento já cobrado e concluído. Cobrança em duplicidade bloqueada.');
    }
    return linkedId;
  }
  if (Array.isArray(appointment.stageHistory) && appointment.stageHistory.some((event: any) => event?.kind === 'prepayment')) {
    if (activePayment && isAddon && !data.petshopPrepayment) return linkedId;
    if (activePayment) throw new ConflictException('Agendamento já pago antecipadamente. Cobrança em duplicidade bloqueada.');
  }
  if (data.petshopPrepayment) {
    if (!['requested', 'scheduled'].includes(appointment.status)) throw new BadRequestException('Pagamento antecipado permitido somente antes do início do atendimento.');
  } else if (isAddon && !activePayment && ['requested', 'scheduled', 'checked_in', 'bathing', 'grooming', 'finishing', 'ready'].includes(appointment.status)) {
    const serviceIds = chargedServiceIds(comanda);
    const hasTaxi = hasTaxiChargeLine(comanda);
    if (!serviceIds.length && !hasTaxi) throw new ConflictException('Adicional sem serviços novos para cobrar.');
    if (serviceIds.length && tx.petAppointmentService?.count) {
      const available = await tx.petAppointmentService.count({
        where: {
          id: { in: serviceIds },
          appointmentId: linkedId,
          chargedSaleId: null,
          coverageStatus: { notIn: ['reserved', 'consumed'] },
          priceSnapshot: { gt: 0 },
        },
      });
      if (available !== serviceIds.length) throw new ConflictException('Serviço adicional já cobrado. Reabra a Agenda.');
    }
    return linkedId;
  } else if (appointment.status !== 'ready') throw new BadRequestException('Conclua os cuidados antes de cobrar o atendimento.');
  return linkedId;
}

export async function completePetshopCheckout(tx: any, appointmentId: string | null, actorId: string | null, tenantId: string, prepayment = false, saleId?: string, comanda?: any) {
  if (!appointmentId) return;
  const appointment = await tx.petAppointment.findUnique({ where: { id: appointmentId } });
  const now = new Date();
  if (prepayment) {
    await tx.petAppointment.update({ where: { id: appointmentId }, data: {
      stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
        kind: 'prepayment', status: appointment.status, label: 'Pagamento antecipado no agendamento', at: now.toISOString(), userId: actorId, saleId,
      }],
    } });
    return;
  }
  const serviceIds = chargedServiceIds(comanda);
  const isAddon = appointmentLinkFromComanda(comanda?.notes)?.isAddon === true;
  if (saleId && tx.petAppointmentService?.updateMany) await tx.petAppointmentService.updateMany({
    where: {
      appointmentId,
      chargedSaleId: null,
      comboParentId: null,
      coverageStatus: { notIn: ['reserved', 'consumed'] },
      ...(serviceIds.length ? { id: { in: serviceIds } } : {}),
    },
    data: { chargedSaleId: saleId },
  });
  if (isAddon) {
    await recordAddedServiceCommissions(tx, appointment, tenantId, now, isAddon && serviceIds.length ? serviceIds : undefined, true);
    await tx.petAppointment.update({ where: { id: appointmentId }, data: {
      stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
        kind: 'additional_charge', status: appointment.status, label: 'Adicional cobrado no caixa', at: now.toISOString(), userId: actorId, serviceIds, saleId, skipped: false,
      }],
    } });
    return;
  }
  await recordAddedServiceCommissions(tx, appointment, tenantId, now, serviceIds.length ? serviceIds : undefined, true);
  await tx.petAppointment.update({ where: { id: appointmentId }, data: {
    status: 'delivered', completedAt: now,
    stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
      status: 'delivered', label: 'Concluído no caixa', at: now.toISOString(), userId: actorId, skipped: false,
    }],
  } });
}
