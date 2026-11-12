import { BadRequestException } from '@nestjs/common';

export type TaxiMode = 'round_trip' | 'pickup_only' | 'dropoff_only';
export type PetTransport = {
  enabled: true;
  mode: TaxiMode;
  fee: number;
  coveredByPackage: boolean;
  street: string | null;
  neighborhood: string | null;
  address: string;
  reference: string | null;
  notes: string | null;
};

const modes: Record<string, TaxiMode> = {
  both: 'round_trip',
  round_trip: 'round_trip',
  pickup: 'pickup_only',
  pickup_only: 'pickup_only',
  dropoff: 'dropoff_only',
  dropoff_only: 'dropoff_only',
};

export function normalizeTransport(input: any): PetTransport | null {
  if (!input?.enabled) return null;
  const mode = modes[String(input.mode || 'round_trip')];
  if (!mode) throw new BadRequestException('Modalidade do Táxi Dog inválida.');
  const text = (value: any) => String(value || '').trim();
  const street = text(input.street);
  const neighborhood = text(input.neighborhood);
  const address = text(input.address) || [street, neighborhood].filter(Boolean).join(' - ');
  if (!address) throw new BadRequestException('Informe o endereço do Táxi Dog.');
  const fee = Number(input.fee || 0);
  if (!Number.isFinite(fee) || fee < 0) throw new BadRequestException('Taxa do Táxi Dog inválida.');
  return {
    enabled: true, mode, fee, coveredByPackage: Boolean(input.coveredByPackage),
    street: street || null, neighborhood: neighborhood || null, address,
    reference: text(input.reference) || null, notes: text(input.notes) || null,
  };
}

export function parseAppointmentTransport(checkInNotes?: string | null): PetTransport | null {
  if (!checkInNotes?.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(checkInNotes);
    if (parsed?.transport?.enabled) return normalizeTransport(parsed.transport);
  } catch {}
  return null;
}

export function serializeAppointmentTransport(transport: PetTransport | null): string | null {
  return transport ? JSON.stringify({ transport }) : null;
}

export function hasTaxiPickup(mode: TaxiMode): boolean {
  return mode === 'round_trip' || mode === 'pickup_only';
}

export function hasTaxiDropoff(mode: TaxiMode): boolean {
  return mode === 'round_trip' || mode === 'dropoff_only';
}

export function taxiNotificationText(
  triggerType: 'APPOINTMENT_CONFIRMED' | 'BEFORE_APPOINTMENT' | 'PET_READY',
  transport: PetTransport | null,
  vars: { tutor: string; pet: string; service: string; date: string; time: string; shop: string; minutesBefore?: number | null; portalLink?: string },
): string | null {
  if (!transport) return null;
  const greeting = `Olá, ${vars.tutor}!`;
  const detail = `*${vars.pet}* (${vars.service}) no dia *${vars.date}* às *${vars.time}*`;
  const pickup = hasTaxiPickup(transport.mode);
  const dropoff = hasTaxiDropoff(transport.mode);
  if (triggerType === 'APPOINTMENT_CONFIRMED') {
    const route = pickup && dropoff ? 'buscar no seu endereço e levar de volta após o atendimento' : pickup ? 'buscar no seu endereço; a retirada na loja ficará por sua conta' : 'receber o pet na loja e levá-lo de volta ao seu endereço';
    return `${greeting} Confirmamos o atendimento de ${detail} na *${vars.shop}*. O Táxi Dog está combinado para ${route}. Endereço: ${transport.address}.`;
  }
  if (triggerType === 'BEFORE_APPOINTMENT') {
    const timing = vars.minutesBefore && vars.minutesBefore >= 1440 ? 'amanhã' : 'em breve';
    const action = pickup
      ? `Nosso Táxi Dog está programado para buscar ${vars.pet} em ${transport.address}. Por favor, deixe o pet pronto. Avisaremos quando o motorista sair.`
      : `Traga ${vars.pet} à loja no horário combinado. Após o atendimento, nosso Táxi Dog fará a entrega em ${transport.address}.`;
    return `${greeting} Lembrete do atendimento de ${detail} na *${vars.shop}* (${timing}). ${action}`;
  }
  if (dropoff) return `${greeting} *${vars.pet}* está pronto(a) na *${vars.shop}*. A entrega pelo Táxi Dog em ${transport.address} está prevista; avisaremos quando o motorista sair.`;
  return `${greeting} *${vars.pet}* está pronto(a) para você retirar na *${vars.shop}*.`;
}
