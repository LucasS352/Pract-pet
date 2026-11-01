import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  PackagePlus, Search, Loader2, Plus, CheckCircle2,
  CalendarClock, Package, Trash2, ArrowRight, Truck, Box
} from 'lucide-react';
import { CatalogTabs, PageHeader, pageClass, primaryButton, secondaryButton, inputClass } from './ui';
import ManagePackagingsModal, { PackagingItem } from '@/components/ManagePackagingsModal';

interface Product {
  id: string;
  name: string;
  stock: number;
  unit: string;
  priceCost: number;
  category?: { name: string };
  shortCode?: string | null;
  imageUrl?: string | null;
}

interface StockRow {
  product: Product;
  qty: string;
  costPrice: string;
  lotNumber: string;
  expiresAt: string;
  supplierId: string;
  unitName?: string;
  unitMultiplier?: number;
  saving: boolean;
  saved: boolean;
}

export default function PetshopStockEntryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [packagings, setPackagings] = useState<PackagingItem[]>([]);
  const [showPackagingsModal, setShowPackagingsModal] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const fetchPackagings = useCallback(async () => {
    try {
      const { data } = await api.get('/purchase-orders/packagings/all');
      setPackagings(data || []);
    } catch {
      // ignore
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, supRes, packRes] = await Promise.all([
        api.get('/products?limit=2000'),
        api.get('/suppliers'),
        api.get('/purchase-orders/packagings/all').catch(() => ({ data: [] })),
      ]);
      const list = prodRes.data?.data ?? prodRes.data ?? [];
      setProducts(list.filter((p: any) => p !== null));
      setSuppliers(supRes.data || []);
      setPackagings(packRes.data || []);
    } catch {
      toast.error('Erro ao carregar catálogo para entrada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const deferredSearch = useDeferredValue(search);

  const searchResults = useMemo(() => {
    if (!deferredSearch.trim()) return [];
    const term = deferredSearch.toLowerCase().trim();
    return products
      .filter(p => `${p.name} ${p.shortCode || ''}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [products, deferredSearch]);

  const addToEntry = (product: Product) => {
    if (rows.find(r => r.product.id === product.id)) {
      toast.info('Produto já adicionado na lista de entrada abaixo.');
      return;
    }
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const suggestedLot = `LT-${datePart}-${randomPart}`;

    setRows(prev => [
      ...prev,
      {
        product,
        qty: '',
        costPrice: product.priceCost ? String(product.priceCost) : '',
        lotNumber: suggestedLot,
        expiresAt: '',
        supplierId: suppliers[0]?.id || '',
        unitName: 'UN',
        unitMultiplier: 1,
        saving: false,
        saved: false,
      },
    ]);
    setSearch('');
  };

  const removeRow = (productId: string) => {
    setRows(prev => prev.filter(r => r.product.id !== productId));
  };

  const updateRow = (productId: string, patch: Partial<StockRow>) => {
    setRows(prev => prev.map(r => (r.product.id === productId ? { ...r, ...patch } : r)));
  };

  const confirmSingleEntry = async (productId: string) => {
    const row = rows.find(r => r.product.id === productId);
    if (!row) return;

    const numQty = parseFloat(row.qty);
    if (isNaN(numQty) || numQty <= 0) {
      toast.error(`Informe uma quantidade válida para "${row.product.name}".`);
      return;
    }

    const multiplier = row.unitMultiplier || 1;
    const finalQuantity = numQty * multiplier;
    const numCost = parseFloat(row.costPrice) || 0;

    updateRow(productId, { saving: true });
    try {
      await api.post(`/products/add-stock/${productId}`, {
        quantity: finalQuantity,
        costPrice: numCost,
        lotNumber: row.lotNumber?.trim() || undefined,
        expiresAt: row.expiresAt ? row.expiresAt : undefined,
        supplierId: row.supplierId || undefined,
      });

      updateRow(productId, { saving: false, saved: true });
      toast.success(`Entrada de +${finalQuantity} ${row.product.unit || 'un'} confirmada!`);

      // Atualiza o saldo local
      setProducts(prev =>
        prev.map(p =>
          p.id === productId ? { ...p, stock: Number(p.stock || 0) + finalQuantity } : p
        )
      );

      setTimeout(() => removeRow(productId), 1800);
    } catch (error: any) {
      updateRow(productId, { saving: false });
      toast.error(error?.response?.data?.message || 'Erro ao registrar entrada de estoque.');
    }
  };

  const confirmAllEntries = async () => {
    const pending = rows.filter(r => !r.saved);
    if (pending.length === 0) {
      toast.info('Nenhuma entrada pendente para confirmar.');
      return;
    }

    for (const r of pending) {
      const q = parseFloat(r.qty);
      if (isNaN(q) || q <= 0) {
        toast.error(`Informe a quantidade para "${r.product.name}".`);
        return;
      }
    }

    setSavingAll(true);
    for (const r of pending) {
      await confirmSingleEntry(r.product.id);
    }
    setSavingAll(false);
  };

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Rastreabilidade e Validade"
        title="Entrada de Estoque & Lotes"
        description="Dê entrada rápida em mercadorias recebidas, registrando número de lote, validade, fornecedor e embalagem."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPackagingsModal(true)}
              className={`${secondaryButton} flex items-center gap-2`}
            >
              <Box size={16} />
              <span>Embalagens</span>
            </button>
            <button
              type="button"
              onClick={confirmAllEntries}
              disabled={savingAll || rows.length === 0}
              className={`${primaryButton} flex items-center gap-2 disabled:opacity-50`}
            >
              {savingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Registrando…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmar Todas as Entradas ({rows.length})</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <CatalogTabs />

      {/* Caixa de Busca de Produtos para Entrada */}
      <div className="relative mb-6">
        <label className="mb-1.5 block text-xs font-semibold text-[var(--pc-text-secondary)]">
          Selecione o produto para registrar entrada:
        </label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--pc-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Digite o nome, código ou código de barras do produto…"
            className={`${inputClass} pl-10`}
          />
        </div>

        {/* Dropdown de sugestões */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white shadow-xl">
            {searchResults.map(prod => (
              <button
                key={prod.id}
                type="button"
                onClick={() => addToEntry(prod)}
                className="flex w-full items-center justify-between border-b border-[var(--pc-border)] px-4 py-3 text-left transition hover:bg-[var(--pc-action-soft)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {prod.imageUrl ? (
                    <img src={prod.imageUrl} alt="" className="h-9 w-9 rounded-lg border border-[var(--pc-border)] object-cover" />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--pc-surface-subtle)] text-[var(--pc-text-secondary)]">
                      <Package size={16} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--pc-text)]">{prod.name}</p>
                    <p className="text-xs text-[var(--pc-text-muted)]">
                      Estoque atual: <strong>{prod.stock} {prod.unit}</strong>
                      {prod.category?.name ? ` · ${prod.category.name}` : ''}
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-[var(--pc-action)]">
                  <Plus size={15} /> Adicionar
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista de Produtos em Entrada */}
      <section className="space-y-4" aria-label="Lista de entrada">
        {rows.length === 0 ? (
          <div className="pc-panel flex min-h-60 flex-col items-center justify-center p-8 text-center">
            <PackagePlus size={40} className="mb-3 text-[var(--pc-border-strong)]" />
            <h3 className="text-base font-semibold text-[var(--pc-text)]">Nenhum produto selecionado para entrada</h3>
            <p className="mt-1 max-w-md text-xs text-[var(--pc-text-muted)]">
              Use o campo de busca acima para selecionar rações, petiscos, medicamentos ou outros itens recebidos do fornecedor.
            </p>
          </div>
        ) : (
          rows.map(row => (
            <article
              key={row.product.id}
              className={`pc-panel p-4 sm:p-5 transition-all ${
                row.saved ? 'border-emerald-300 bg-emerald-50/40' : 'bg-white'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                {/* Produto Info */}
                <div className="flex items-center gap-3.5 min-w-[260px]">
                  {row.product.imageUrl ? (
                    <img
                      src={row.product.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded-xl border border-[var(--pc-border)] object-cover"
                    />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--pc-surface-subtle)] text-[var(--pc-text-secondary)]">
                      <Package size={20} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--pc-text)]">{row.product.name}</h3>
                    <p className="text-xs text-[var(--pc-text-muted)]">
                      Estoque atual: <strong className="text-[var(--pc-text)]">{row.product.stock} {row.product.unit}</strong>
                    </p>
                  </div>
                </div>

                {/* Campos de Entrada */}
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
                  {/* Embalagem */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--pc-text-secondary)]">
                      Embalagem
                    </label>
                    <select
                      value={`${row.unitName || 'UN'}|${row.unitMultiplier || 1}`}
                      onChange={e => {
                        const [name, mult] = e.target.value.split('|');
                        updateRow(row.product.id, { unitName: name, unitMultiplier: Number(mult) });
                      }}
                      disabled={row.saving || row.saved}
                      className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2.5 py-1.5 text-xs text-[var(--pc-text)] outline-none focus:border-[var(--pc-action)]"
                    >
                      <option value="UN|1">Unidade (1 {row.product.unit || 'un'})</option>
                      {packagings.map(p => (
                        <option key={p.id} value={`${p.name}|${p.multiplier}`}>
                          {p.name} ({p.multiplier} un)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantidade */}
                  <div>
                    <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--pc-text-secondary)]">
                      <span>Quantidade</span>
                      {row.unitMultiplier && row.unitMultiplier > 1 && row.qty && (
                        <span className="text-[10px] font-bold text-[var(--pc-action)]">
                          = {Number(row.qty) * row.unitMultiplier} {row.product.unit}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      placeholder="0"
                      value={row.qty}
                      onChange={e => updateRow(row.product.id, { qty: e.target.value })}
                      disabled={row.saving || row.saved}
                      className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2.5 py-1.5 text-center text-sm font-bold tabular-nums text-[var(--pc-action)] outline-none focus:border-[var(--pc-action)]"
                    />
                  </div>

                  {/* Custo Unitário */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--pc-text-secondary)]">
                      Custo Unit. (R$)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={row.costPrice}
                      onChange={e => updateRow(row.product.id, { costPrice: e.target.value })}
                      disabled={row.saving || row.saved}
                      className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2.5 py-1.5 text-right text-xs font-semibold tabular-nums text-[var(--pc-text)] outline-none focus:border-[var(--pc-action)]"
                    />
                  </div>

                  {/* Número do Lote */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--pc-text-secondary)]">
                      Nº do Lote
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: LT-2610-A1"
                      value={row.lotNumber}
                      onChange={e => updateRow(row.product.id, { lotNumber: e.target.value })}
                      disabled={row.saving || row.saved}
                      className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2.5 py-1.5 text-xs text-[var(--pc-text)] outline-none focus:border-[var(--pc-action)]"
                    />
                  </div>

                  {/* Data de Validade */}
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--pc-text-secondary)]">
                      Data Validade
                    </label>
                    <input
                      type="date"
                      value={row.expiresAt}
                      onChange={e => updateRow(row.product.id, { expiresAt: e.target.value })}
                      disabled={row.saving || row.saved}
                      className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1.5 text-xs text-[var(--pc-text)] outline-none focus:border-[var(--pc-action)]"
                    />
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void confirmSingleEntry(row.product.id)}
                    disabled={row.saving || row.saved}
                    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition ${
                      row.saved
                        ? 'bg-[var(--pc-success-soft)] text-[var(--pc-success)]'
                        : 'bg-[var(--pc-action)] text-white hover:bg-[var(--pc-action-hover)]'
                    }`}
                  >
                    {row.saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : row.saved ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    <span>{row.saved ? 'Confirmado' : 'Confirmar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeRow(row.product.id)}
                    disabled={row.saving || row.saved}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pc-border)] text-[var(--pc-text-muted)] transition hover:bg-[var(--pc-danger-soft)] hover:text-[var(--pc-danger)]"
                    title="Remover produto da lista"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {/* Modal de Gerenciamento de Embalagens */}
      {showPackagingsModal && (
        <ManagePackagingsModal
          isOpen={showPackagingsModal}
          onClose={() => {
            setShowPackagingsModal(false);
            void fetchPackagings();
          }}
        />
      )}
    </div>
  );
}
