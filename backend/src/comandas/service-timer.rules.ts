import { BadRequestException } from '@nestjs/common';

export function serviceSnapshot(product: {
  requiresCarvoaria?: boolean; serviceTimerMinutes?: number | null; assetTrackingTotal?: number | null;
}, assetNumber: unknown, quantity: number, enabled: boolean) {
  if (product.requiresCarvoaria && !enabled) throw new BadRequestException('Carvoaria não está ativa nesta loja.');
  if (!product.requiresCarvoaria) {
    if (assetNumber != null) throw new BadRequestException('Este produto não possui rastreamento de equipamento.');
    return {};
  }
  const total = product.assetTrackingTotal;
  if (total) {
    if (quantity !== 1) throw new BadRequestException('Lance cada equipamento separadamente, com quantidade 1.');
    if (!Number.isInteger(assetNumber) || Number(assetNumber) < 1 || Number(assetNumber) > total)
      throw new BadRequestException(`Escolha um equipamento entre 1 e ${total}.`);
  } else if (assetNumber != null) throw new BadRequestException('Este produto não possui equipamentos cadastrados.');
  return { assetNumber: total ? Number(assetNumber) : null, timerMinutes: product.serviceTimerMinutes ?? null };
}

export function extendTimer(dueAt: Date, minutes: number, now: Date) {
  if (![15, 20, 30].includes(minutes)) throw new BadRequestException('Prorrogação permitida: 15, 20 ou 30 minutos.');
  return new Date(Math.max(dueAt.getTime(), now.getTime()) + minutes * 60_000);
}

/** Dentro da mesma transação do fechamento/cancelamento. Não altera preço/estoque. */
export async function releaseComandaAssets(tx: any, comandaId: string, now = new Date()) {
  await tx.comandaItem.updateMany({
    where: { comandaId, assetReturnedAt: null, OR: [{ assetNumber: { not: null } }, { timerMinutes: { not: null } }] },
    data: { assetReturnedAt: now },
  });
  await tx.comandaAssetReservation.deleteMany({ where: { item: { comandaId } } });
}
