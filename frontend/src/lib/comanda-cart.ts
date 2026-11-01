import { useCartStore, type CartItem } from '@/store/cart';

/** Atualiza apenas os itens da comanda carregada, preservando acréscimos do caixa. */
export function syncLoadedComanda(comanda: { id: string; items: any[] }) {
  const cart = useCartStore.getState();
  if (cart.activeComandaId !== comanda.id || cart.isOperationLocked) return;
  const imported: CartItem[] = comanda.items.filter((item) => !item.status || item.status === 'active').map((item) => ({
    ...item.product,
    id: item.productId || item.product.id,
    name: item.product?.name || 'Produto',
    priceSell: Number(item.unitPrice),
    effectivePriceSell: Number(item.unitPrice),
    quantity: Number(item.quantity),
    subtotal: Number(item.totalPrice),
    stock: Number(item.product?.stock || 0),
    barcode: item.product?.barcode || null,
    shortCode: item.product?.shortCode || null,
    cartKey: `${item.productId || item.product.id}__comanda_${item.id}`,
    fromComanda: true,
    comandaItemId: item.id,
    modifiers: item.modifiers?.map((m: any) => ({
      groupId: m.optionId,
      groupName: 'Adicional',
      optionId: m.optionId,
      optionName: m.name,
      componentProductId: m.componentProductId,
      quantity: Number(m.consumedQuantity),
      priceAdjustment: Number(m.priceAdjustment),
    })),
  }));
  const items = [
    ...imported,
    ...cart.items.filter((item) => !item.fromComanda),
  ];
  useCartStore.setState({
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    cartOperationId: crypto.randomUUID(),
  });
}
