export type KdsStatus = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED';
export const kdsLabels: Record<KdsStatus, string> = {
  PENDING: 'Pendente',
  PREPARING: 'Em preparo',
  READY: 'Pronto para levar',
  DELIVERED: 'Entregue',
};
export interface KdsTicket {
  id: string;
  comandaId: string;
  quantity: number;
  notes?: string;
  kdsStatus: KdsStatus;
  kdsDestination: 'KITCHEN' | 'BAR' | 'BAR_1' | 'BAR_2' | 'SERVICE' | 'CARVOARIA';
  kdsSentAt: string;
  serveImmediately: boolean;
  assetNumber?: number | null;
  product: { name: string; preparationIngredients?: string | null };
  createdBy?: { name: string };
  comanda: { id: string; number: string; responsibleWaiter?: { name: string } };
  modifiers?: Array<{ id: string; name: string }>;
}
export function waitsForKitchen(
  item: Pick<KdsTicket, 'comandaId' | 'serveImmediately' | 'kdsDestination'>,
  items: Array<Pick<KdsTicket, 'comandaId' | 'kdsDestination' | 'kdsStatus'>>,
) {
  return (
    !item.serveImmediately &&
    item.kdsDestination !== 'KITCHEN' &&
    item.kdsDestination !== 'CARVOARIA' &&
    items.some(
      (other) =>
        other.comandaId === item.comandaId &&
        other.kdsDestination === 'KITCHEN' &&
        ['PENDING', 'PREPARING'].includes(other.kdsStatus),
    )
  );
}
