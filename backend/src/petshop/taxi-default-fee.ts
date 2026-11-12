import { BadRequestException } from '@nestjs/common';

export const TAXI_DEFAULT_FEE_SETTINGS_ID = 'petshop_taxi_default_fee';
export const TAXI_DEFAULT_FEE_FALLBACK = 40;

export function parseTaxiDefaultFee(value: unknown): number {
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee < 0 || fee > 10000 || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new BadRequestException('Informe um valor entre R$ 0,00 e R$ 10.000,00 com até duas casas decimais.');
  }
  return fee;
}

export async function readTaxiDefaultFee(prisma: any): Promise<number> {
  const row = await prisma.tenantSettings.findUnique({
    where: { id: TAXI_DEFAULT_FEE_SETTINGS_ID }, select: { paymentMethodsConfig: true },
  });
  const stored = (row?.paymentMethodsConfig as { fee?: unknown } | null)?.fee;
  return stored == null ? TAXI_DEFAULT_FEE_FALLBACK : parseTaxiDefaultFee(stored);
}
