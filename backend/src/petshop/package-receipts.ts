import { BadRequestException } from '@nestjs/common';

export const PACKAGE_PAYMENT_METHODS = ['pix', 'dinheiro', 'credito', 'debito'] as const;
export type PackagePayment = { method: string; amount: number };
export type PackageReceipt = {
  receivedAt: string;
  payments: PackagePayment[];
  discountAmount?: number;
  discountAuthorizedBy?: { userId: string; name?: string };
};
const MAX_MONEY = 99_999_999.99;

export function moneyCents(value: unknown, label = 'Valor'): number {
  if (typeof value !== 'number' && typeof value !== 'string') throw new BadRequestException(`${label} inválido.`);
  if (String(value).trim() === '') throw new BadRequestException(`${label} inválido.`);
  const number = Number(value);
  const cents = Math.round(number * 100);
  if (!Number.isFinite(number) || number < 0 || number > MAX_MONEY || Math.abs(number * 100 - cents) > 0.00001) {
    throw new BadRequestException(`${label} deve estar entre 0 e 99.999.999,99, com até duas casas decimais.`);
  }
  return cents;
}

export function normalizePackagePayments(input: unknown, total: number, legacyMethod = 'pix'): PackagePayment[] {
  const expected = moneyCents(total, 'Total');
  if (input !== undefined && !Array.isArray(input)) throw new BadRequestException('Informe as formas de pagamento.');
  const rows = input === undefined ? (expected ? [{ method: legacyMethod, amount: total }] : []) : input as any[];
  if (rows.length > 12 || (expected > 0 && !rows.length)) throw new BadRequestException('Informe de 1 a 12 pagamentos.');
  const amounts = new Map<string, number>();
  for (const row of rows) {
    const method = String(row?.method || '').trim().toLowerCase();
    if (!PACKAGE_PAYMENT_METHODS.includes(method as any)) throw new BadRequestException('Forma de pagamento inválida.');
    const cents = moneyCents(row?.amount, 'Valor do pagamento');
    if (!cents) throw new BadRequestException('Cada pagamento deve ser maior que zero.');
    amounts.set(method, (amounts.get(method) || 0) + cents);
  }
  if ([...amounts.values()].reduce((sum, value) => sum + value, 0) !== expected) {
    throw new BadRequestException('A soma dos pagamentos deve ser igual ao total do pacote.');
  }
  return [...amounts].map(([method, cents]) => ({ method, amount: cents / 100 }));
}

/** Split a family receipt without losing or duplicating a cent or payment method. */
export function allocatePackagePayments(payments: PackagePayment[], totals: number[]): PackagePayment[][] {
  const remaining = payments.map(p => ({ method: p.method, cents: moneyCents(p.amount) }));
  const allocated = totals.map(total => {
    let needed = moneyCents(total);
    const rows: PackagePayment[] = [];
    for (const payment of remaining) {
      const take = Math.min(needed, payment.cents);
      if (take) rows.push({ method: payment.method, amount: take / 100 });
      payment.cents -= take;
      needed -= take;
    }
    if (needed) throw new BadRequestException('Pagamentos insuficientes para o grupo.');
    return rows;
  });
  if (remaining.some(p => p.cents)) throw new BadRequestException('Pagamentos excedem o total do grupo.');
  return allocated;
}

/** Allocate a receipt discount across family contracts, preserving every cent. */
export function allocatePackageDiscount(discount: number, totals: number[]): number[] {
  const discountCents = moneyCents(discount, 'Desconto');
  const prices = totals.map(total => moneyCents(total, 'Total'));
  const gross = prices.reduce((sum, cents) => sum + cents, 0);
  if (discountCents > gross) throw new BadRequestException('Desconto maior que o total do pacote.');
  if (!gross) return prices.map(() => 0);
  const shares = prices.map((cents, index) => {
    const product = BigInt(cents) * BigInt(discountCents);
    return { index, cents: Number(product / BigInt(gross)), remainder: product % BigInt(gross) };
  });
  let remaining = discountCents - shares.reduce((sum, share) => sum + share.cents, 0);
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!remaining) break;
    if (share.cents < prices[share.index]) { share.cents += 1; remaining -= 1; }
  }
  if (remaining) throw new BadRequestException('Não foi possível distribuir o desconto entre os pacotes.');
  return shares.map(share => share.cents / 100);
}

export function packageReceivedAmount(contract: { finalPrice?: unknown; notes?: string | null }): number {
  const receipt = contractMetadata(contract.notes).receipt;
  if (Array.isArray(receipt?.payments)) {
    return receipt.payments.reduce((sum: number, payment: PackagePayment) => sum + moneyCents(payment.amount), 0) / 100;
  }
  return Number(contract.finalPrice || 0);
}

export function contractMetadata(notes: unknown): Record<string, any> {
  if (typeof notes === 'string' && notes.trim().startsWith('{')) {
    try { const value = JSON.parse(notes); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch { /* legacy free text */ }
  }
  return { userNotes: typeof notes === 'string' ? notes : null };
}

export function receiptNotes(notes: string | null, receipt: PackageReceipt): string {
  return JSON.stringify({ ...contractMetadata(notes), receipt });
}

export function packageReceiptDate(contract: { notes?: string | null; createdAt?: Date | string }): Date | undefined {
  const receivedAt = contractMetadata(contract.notes).receipt?.receivedAt;
  return receivedAt ? new Date(receivedAt) : contract.createdAt ? new Date(contract.createdAt) : undefined;
}

export function receivedInPeriod(contract: { notes?: string | null; createdAt?: Date | string }, start: Date, end: Date): boolean {
  const date = packageReceiptDate(contract);
  return !date || (date >= start && date <= end);
}

export function packageReceiptWindow(start: Date, end: Date) {
  return { OR: [
    { createdAt: { gte: start, lte: end } },
    { ledgerEvents: { some: { eventType: 'PAYMENT_RECEIVED', createdAt: { gte: start, lte: end } } } },
  ] };
}
