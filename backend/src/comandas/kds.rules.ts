import { BadRequestException } from '@nestjs/common';

export function initialKds(
  product: { requiresKitchen?: boolean; requiresBar?: boolean; requiresCarvoaria?: boolean; barStation?: string },
  enabled: boolean,
  serveImmediately?: boolean,
  carvoariaEnabled = false,
) {
  if (serveImmediately !== undefined && typeof serveImmediately !== 'boolean') {
    throw new BadRequestException('Servir agora deve ser verdadeiro ou falso.');
  }
  if (!enabled && !(carvoariaEnabled && product.requiresCarvoaria)) return {};
  const destination = product.requiresCarvoaria && carvoariaEnabled ? 'CARVOARIA' : product.requiresKitchen
    ? 'KITCHEN'
    : product.requiresBar
      ? (['BAR_1', 'BAR_2'].includes(product.barStation || '') ? product.barStation! : 'BAR')
      : null;
  // Clientes antigos não enviam a preferência: itens comuns continuam fora do KDS.
  if (!destination && serveImmediately === undefined) return {};
  const now = new Date();
  return {
    kdsDestination: destination || 'SERVICE',
    kdsStatus: !destination ? 'READY' : 'PENDING',
    kdsSentAt: now,
    kdsReadyAt: !destination ? now : null,
    serveImmediately:
      destination === 'KITCHEN' || destination === 'CARVOARIA' ? false : serveImmediately === true,
  };
}

export function assertKdsTransition(from: string | null, to: string) {
  const next: Record<string, string> = {
    PENDING: 'PREPARING',
    PREPARING: 'READY',
    READY: 'DELIVERED',
  };
  if (!from || next[from] !== to)
    throw new BadRequestException(
      'O pedido mudou de estado. Atualize a tela antes de continuar.',
    );
}
