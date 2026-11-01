import { create } from 'zustand';

export type Product = { 
  id: string; name: string; priceSell: number; stock: number; 
  salesCount?: number; barcode: string | null; shortCode: string | null; 
  active?: boolean; imageUrl?: string | null; 
  isComposite?: boolean; modifierGroups?: any[];
};

export type CartItemModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  componentProductId: string;
  quantity: number;
  priceAdjustment: number;
};

export type CartItem = Product & { 
  quantity: number; 
  subtotal: number; 
  cartKey: string;
  modifiers?: CartItemModifier[];
  effectivePriceSell: number;
  fromComanda?: boolean;
  comandaItemId?: string;
};

interface CartState {
  scope: string | null;
  selectScope: (tenantId: string, operatorId: string) => void;
  items: CartItem[];
  cartOperationId: string;
  isOperationLocked: boolean;
  setOperationLocked: (locked: boolean) => void;
  getOrCreateOperationId: () => string;
  addItem: (product: Product, quantity?: number, modifiers?: CartItemModifier[], fromComanda?: boolean) => void;
  removeItem: (cartKey: string) => boolean;
  updateQuantity: (cartKey: string, quantity: number) => boolean;
  clearCart: () => void;
  total: number;
  activeComandaId: string | null;
  activeComandaNumber: string | null;
  setActiveComanda: (id: string | null, number: string | null) => void;
}

function buildCartKey(productId: string, modifiers?: CartItemModifier[], fromComanda?: boolean): string {
  const comandaSuffix = fromComanda ? '__comanda' : '';
  if (!modifiers || modifiers.length === 0) return `${productId}${comandaSuffix}`;
  const modKey = modifiers
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map(m => `${m.groupId}:${m.optionId}`)
    .join('|');
  return `${productId}__${modKey}${comandaSuffix}`;
}

export const useCartStore = create<CartState>((set, get) => ({
  scope: null,
  selectScope: (tenantId, operatorId) => {
    const scope = tenantId && operatorId ? `7bar-cart-v2:${tenantId}:${operatorId}` : null;
    if (scope === get().scope) return;
    let saved: any = null;
    try { saved = scope ? JSON.parse(sessionStorage.getItem(scope) || 'null') : null; } catch { /* empty draft */ }
    const items = Array.isArray(saved?.items) ? saved.items : [];
    set({ scope, items, total: items.reduce((sum: number, item: CartItem) => sum + item.subtotal, 0),
      cartOperationId: saved?.cartOperationId || crypto.randomUUID(),
      activeComandaId: saved?.activeComandaId || null, activeComandaNumber: saved?.activeComandaNumber || null,
      isOperationLocked: false });
  },
  items: [],
  total: 0,
  cartOperationId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
  isOperationLocked: false,
  setOperationLocked: (locked) => set({ isOperationLocked: locked }),
  getOrCreateOperationId: () => {
    const curr = get().cartOperationId;
    if (curr) return curr;
    const next = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    set({ cartOperationId: next });
    return next;
  },
  activeComandaId: null,
  activeComandaNumber: null,
  setActiveComanda: (id, number) => {
    if (!get().isOperationLocked) set({ activeComandaId: id, activeComandaNumber: number });
  },
  addItem: (product, quantity = 1, modifiers, fromComanda = false) => {
    if (get().isOperationLocked) {
      console.warn('[useCartStore] Operação em andamento — carrinho bloqueado para alterações.');
      return;
    }
    const { items } = get();
    const priceAdjustment = (modifiers || []).reduce((acc, m) => acc + Number(m.priceAdjustment || 0), 0);
    const effectivePriceSell = Number(product.priceSell) + priceAdjustment;
    const cartKey = buildCartKey(product.id, modifiers, fromComanda);
    const existing = items.find(i => i.cartKey === cartKey);

    let newItems;
    if (existing) {
      newItems = items.map(i => i.cartKey === cartKey 
        ? { ...i, quantity: i.quantity + quantity, subtotal: (i.quantity + quantity) * i.effectivePriceSell } 
        : i
      );
    } else {
      newItems = [...items, { 
        ...product, quantity, 
        subtotal: quantity * effectivePriceSell, 
        cartKey, 
        modifiers,
        effectivePriceSell,
        fromComanda
      }];
    }
    set({ items: newItems, total: newItems.reduce((acc, i) => acc + i.subtotal, 0) });
  },
  removeItem: (cartKey) => {
    if (get().isOperationLocked) {
      console.warn('[useCartStore] Operação em andamento — carrinho bloqueado.');
      return false;
    }
    const item = get().items.find(i => i.cartKey === cartKey);
    if (item?.fromComanda) {
      return false; // bloqueia remoção direta no carrinho
    }
    const newItems = get().items.filter(i => i.cartKey !== cartKey);
    set({ items: newItems, total: newItems.reduce((acc, i) => acc + i.subtotal, 0) });
    return true;
  },
  updateQuantity: (cartKey, quantity) => {
    if (get().isOperationLocked) {
      console.warn('[useCartStore] Operação em andamento — carrinho bloqueado.');
      return false;
    }
    const item = get().items.find(i => i.cartKey === cartKey);
    if (item?.fromComanda) {
      return false; // bloqueia alteração de quantidade direta no carrinho
    }
    if (quantity <= 0) {
      return get().removeItem(cartKey);
    }
    const newItems = get().items.map(i => i.cartKey === cartKey ? { ...i, quantity, subtotal: quantity * i.effectivePriceSell } : i);
    set({ items: newItems, total: newItems.reduce((acc, i) => acc + i.subtotal, 0) });
    return true;
  },
  clearCart: () => {
    if (get().isOperationLocked) {
      console.warn('[useCartStore] Operação em andamento — bloqueado clearCart.');
      return;
    }
    const nextId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    set({
      items: [],
      total: 0,
      activeComandaId: null,
      activeComandaNumber: null,
      cartOperationId: nextId,
      isOperationLocked: false,
    });
  }
}));

// Drafts are per shop/operator and per tab. Submitted snapshots live in IndexedDB, not here.
useCartStore.subscribe(state => {
  if (!state.scope) return;
  try {
    sessionStorage.setItem(state.scope, JSON.stringify({
      items: state.items, cartOperationId: state.cartOperationId,
      activeComandaId: state.activeComandaId, activeComandaNumber: state.activeComandaNumber,
    }));
  } catch { console.warn('Não foi possível preservar o rascunho do carrinho nesta aba.'); }
});
