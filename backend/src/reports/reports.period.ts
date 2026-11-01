import { BadRequestException } from '@nestjs/common';

const DAY = 86_400_000;
export function reportPeriod(startDate: unknown, endDate: unknown) {
  const parse = (value: unknown): number => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Informe as datas no formato AAAA-MM-DD.');
    }
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Data inválida.');
    }
    return time;
  };
  const start = parse(startDate);
  const end = parse(endDate);
  const days = (end - start) / DAY + 1;
  if (days < 1 || days > 92) {
    throw new BadRequestException('Selecione um período de 1 a 92 dias.');
  }
  // Mesmo dia comercial UTC-03 utilizado pelo PDV; fim exclusivo inclui milissegundos.
  return {
    startDate: startDate as string, endDate: endDate as string, days,
    timezone: 'UTC-03:00',
    start: new Date(start + 3 * 3_600_000),
    endExclusive: new Date(end + DAY + 3 * 3_600_000),
  };
}
