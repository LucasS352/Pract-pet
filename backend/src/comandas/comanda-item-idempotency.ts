import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export function validateComandaItemKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(value)) {
    throw new BadRequestException('Envie Idempotency-Key (8 a 128 caracteres) ao lançar itens. Atualize a tela se necessário.');
  }
  return value;
}

export function fingerprintComandaItems(items: unknown): string {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex');
}
