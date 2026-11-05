import { BadRequestException, ConflictException } from '@nestjs/common';

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
  if (appointment.status !== 'ready') throw new BadRequestException('Conclua os cuidados antes de cobrar o atendimento.');
  return linkedId;
}

export async function completePetshopCheckout(tx: any, appointmentId: string | null, actorId: string | null) {
  if (!appointmentId) return;
  const appointment = await tx.petAppointment.findUnique({ where: { id: appointmentId } });
  const now = new Date();
  await tx.petAppointment.update({ where: { id: appointmentId }, data: {
    status: 'delivered', completedAt: now,
    stageHistory: [...(Array.isArray(appointment.stageHistory) ? appointment.stageHistory : []), {
      status: 'delivered', label: 'Concluído no caixa', at: now.toISOString(), userId: actorId, skipped: false,
    }],
  } });
}
