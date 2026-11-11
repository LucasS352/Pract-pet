import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertOctagon, Box, CalendarClock, Check, ChevronDown, ChevronUp, Edit3, Package, PackageCheck, PackageX, Pencil, Plus, Power, PowerOff, Search, ShieldAlert, SlidersHorizontal, TriangleAlert, Truck, X
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AddProductModal } from '@/components/AddProductModal';
import { EditProductModal } from '@/components/EditProductModal';
import { PetshopProductLotsModal } from './PetshopProductLotsModal';
import { CatalogTabs, EmptyState, inputClass, ListSkeleton, pageClass, PageHeader, primaryButton, SearchField, secondaryButton } from './ui';
import { money } from './types';
import { isPetshopServiceCategory } from './product-catalog';

type Supplier = {
  id: string;
  name: string;
  whatsapp?: string | null;
  email?: string | null;
  cnpjCpf?: string | null;
};

type Product = {
  id: string;
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  unit: string;
  active: boolean;
  imageUrl?: string | null;
  priceSell: string | number;
  priceCost: string | number;
  stock: string | number;
  minStock?: string | number | null;
  category?: { id: string; name: string } | null;
  supplierProducts?: { supplierId: string }[];
};

type StockFilter = 'all' | 'ok' | 'low' | 'out';
type StatusFilter = 'active' | 'inactive' | 'all';

const numeric = (value: string | number | null | undefined) => Number(value || 0);

function PetshopSupplierSelector({
  product,
  suppliers,
  onToggle,
}: {
  product: Product;
  suppliers: Supplier[];
  onToggle: (supplierId: string, isLinked: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const linkedSuppliers = suppliers.filter(s => product.supplierProducts?.some(sp => sp.supplierId === s.id));
  const linkedCount = linkedSuppliers.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleScroll = (event: Event) => {
      if (dropdownRef.current && event.target instanceof Node && dropdownRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const willOpenUpwards = spaceBelow < 300;
      setOpenUpwards(willOpenUpwards);
      const clampedLeft = Math.max(140, Math.min(window.innerWidth - 140, rect.left + rect.width / 2));
      setDropdownPos({
        top: willOpenUpwards ? rect.top - 8 : rect.bottom + 8,
        left: clampedLeft,
      });
      setSearchTerm('');
    }
    setIsOpen(!isOpen);
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    const term = searchTerm.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(term));
  }, [suppliers, searchTerm]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {linkedSuppliers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
          {linkedSuppliers.slice(0, 2).map(s => (
            <span
              key={s.id}
              className="text-[11px] font-medium bg-teal-50 border border-teal-200 text-teal-800 px-2 py-0.5 rounded-md truncate max-w-[120px]"
              title={s.name}
            >
              {s.name}
            </span>
          ))}
          {linkedSuppliers.length > 2 && (
            <span
              className="text-[10px] font-bold text-teal-700 bg-teal-100/70 border border-teal-200 px-1.5 py-0.5 rounded-md"
              title={linkedSuppliers.slice(2).map(s => s.name).join(', ')}
            >
              +{linkedSuppliers.length - 2}
            </span>
          )}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`h-7 px-2 rounded-lg flex items-center justify-center gap-1 border text-xs font-semibold transition-all cursor-pointer ${
          linkedCount > 0
            ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
            : 'bg-zinc-100 text-zinc-500 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-800'
        }`}
        title={linkedCount > 0 ? 'Gerenciar Fornecedores' : 'Vincular Fornecedor (+)'}
      >
        {linkedCount > 0 ? <Edit3 size={13} /> : <Plus size={14} />}
        {linkedCount === 0 && <span className="hidden sm:inline text-[11px]">Fornecedor</span>}
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-72 rounded-xl bg-white border border-zinc-200 shadow-2xl text-left flex flex-col overflow-hidden text-zinc-800 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: dropdownPos.left,
            top: dropdownPos.top,
            transform: `translate(-50%, ${openUpwards ? '-100%' : '0'})`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-zinc-100 bg-zinc-50/80">
            <div className="flex justify-between items-center mb-1 px-1">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                <Truck size={14} className="text-teal-600" />
                Fornecedores ({suppliers.length})
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-md hover:bg-zinc-200/60 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            {suppliers.length > 4 && (
              <div className="relative mt-2">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar fornecedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>
            )}
          </div>
          <div className="p-2 max-h-60 overflow-y-auto overscroll-contain custom-scrollbar">
            {filteredSuppliers.length === 0 ? (
              <div className="text-xs text-zinc-500 p-4 text-center">
                {suppliers.length === 0 ? (
                  <div className="space-y-2">
                    <p>Nenhum fornecedor cadastrado.</p>
                    <a
                      href="/petshop/fornecedores"
                      className="inline-block text-xs font-semibold text-teal-600 hover:underline"
                    >
                      Cadastrar fornecedores →
                    </a>
                  </div>
                ) : (
                  'Nenhum fornecedor encontrado'
                )}
              </div>
            ) : (
              filteredSuppliers.map(s => {
                const isLinked = product.supplierProducts?.some(sp => sp.supplierId === s.id) || false;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                      isLinked ? 'bg-teal-50/70 text-teal-900 font-medium' : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => onToggle(s.id, isLinked)}
                      className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer accent-teal-600"
                    />
                    <div className="truncate flex-1 select-none">
                      <span className="block truncate">{s.name}</span>
                      {s.whatsapp && <span className="block text-[10px] text-zinc-400">{s.whatsapp}</span>}
                    </div>
                    {isLinked && <Check size={14} className="text-teal-600 shrink-0" />}
                  </label>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function PetshopProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedLotsProduct, setSelectedLotsProduct] = useState<Product | null>(null);

  // Regras de Estoque
  const [showStockSettings, setShowStockSettings] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [enableExpiryControl, setEnableExpiryControl] = useState(false);
  const [expiryAlertDays, setExpiryAlertDays] = useState(30);
  const [expiryAlertDaysInput, setExpiryAlertDaysInput] = useState('30');
  const [lowStockAlertDefault, setLowStockAlertDefault] = useState(5);
  const [lowStockInput, setLowStockInput] = useState('5');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingExpirySettings, setSavingExpirySettings] = useState(false);
  const [savingLowStock, setSavingLowStock] = useState(false);

  useEffect(() => {
    api.get('/products/settings')
      .then((res: any) => {
        if (!res.data) return;
        setAllowNegativeStock(Boolean(res.data.allowNegativeStock));
        const expiryEnabled = Boolean(res.data.enableExpiryControl);
        setEnableExpiryControl(expiryEnabled);
        const days = res.data.expiryAlertDays ?? 30;
        setExpiryAlertDays(days);
        setExpiryAlertDaysInput(String(days));
        const lowDef = res.data.lowStockAlertDefault ?? 5;
        setLowStockAlertDefault(lowDef);
        setLowStockInput(String(lowDef));
      })
      .catch(console.error);
  }, []);

  const handleToggleNegativeStock = async (value: boolean) => {
    setSavingSettings(true);
    try {
      await api.patch('/products/settings', { allowNegativeStock: value });
      setAllowNegativeStock(value);
      toast.success(value
        ? 'Venda sem estoque ATIVADA: o PDV agora permite vender mesmo com saldo zerado.'
        : 'Venda sem estoque DESATIVADA: o PDV bloqueará vendas quando o saldo zerar.'
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao alterar regra de estoque.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleExpiryControl = async (value: boolean) => {
    setSavingExpirySettings(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl: value,
        expiryAlertDays,
      });
      setEnableExpiryControl(value);
      toast.success(value ? 'Controle de validade ativado.' : 'Controle de validade desativado.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar controle de validade.');
    } finally {
      setSavingExpirySettings(false);
    }
  };

  const handleSaveExpiryDays = async () => {
    const days = parseInt(expiryAlertDaysInput, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      setExpiryAlertDaysInput(String(expiryAlertDays));
      return;
    }
    if (days === expiryAlertDays) return;
    setSavingExpirySettings(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl,
        expiryAlertDays: days,
      });
      setExpiryAlertDays(days);
      toast.success(`Alerta de validade ajustado para ${days} dias.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar dias de validade.');
    } finally {
      setSavingExpirySettings(false);
    }
  };

  const handleSaveLowStock = async () => {
    const val = parseInt(lowStockInput, 10);
    if (isNaN(val) || val < 0) {
      setLowStockInput(String(lowStockAlertDefault));
      return;
    }
    if (val === lowStockAlertDefault) return;
    setSavingLowStock(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl,
        expiryAlertDays,
        lowStockAlertDefault: val,
      });
      setLowStockAlertDefault(val);
      toast.success(`Estoque mínimo padrão ajustado para ${val} UN.`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar estoque mínimo.');
    } finally {
      setSavingLowStock(false);
    }
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [prodRes, supRes] = await Promise.all([
        api.get('/products', { params: { limit: 5000, includeInactive: true }, signal }),
        api.get('/suppliers', { signal }).catch(() => ({ data: [] })),
      ]);
      const catalog = Array.isArray(prodRes.data) ? prodRes.data : prodRes.data?.data || [];
      setItems(catalog.filter((item: Product) => !isPetshopServiceCategory(item.category?.name)));
      setSuppliers(Array.isArray(supRes.data) ? supRes.data : []);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED') toast.error('Não foi possível carregar os produtos.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const toggleActive = async (item: Product) => {
    const nextActive = item.active === false;
    setTogglingId(item.id);
    try {
      await api.patch(`/products/${item.id}`, { active: nextActive });
      setItems(prev => prev.map(product => (product.id === item.id ? { ...product, active: nextActive } : product)));
      toast.success(nextActive ? 'Produto reativado com sucesso.' : 'Produto desativado e ocultado da lista ativa.');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível alterar o status do produto.');
    } finally {
      setTogglingId('');
    }
  };

  const handleToggleSupplier = async (productId: string, supplierId: string, isLinked: boolean) => {
    try {
      if (isLinked) {
        await api.delete(`/suppliers/${supplierId}/products/${productId}`);
        setItems(prev => prev.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              supplierProducts: p.supplierProducts?.filter(sp => sp.supplierId !== supplierId) || [],
            };
          }
          return p;
        }));
        toast.success('Fornecedor desvinculado do produto.');
      } else {
        await api.post(`/suppliers/${supplierId}/products`, { productId });
        setItems(prev => prev.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              supplierProducts: [...(p.supplierProducts || []), { supplierId }],
            };
          }
          return p;
        }));
        toast.success('Fornecedor vinculado com sucesso!');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível atualizar o vínculo do fornecedor.');
    }
  };

  const summary = useMemo(() => {
    const active = items.filter(item => item.active !== false);
    const inactive = items.length - active.length;
    const out = active.filter(item => numeric(item.stock) <= 0).length;
    const low = active.filter(item => numeric(item.stock) > 0 && numeric(item.stock) <= numeric(item.minStock ?? 5)).length;
    return { active: active.length, inactive, out, low };
  }, [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return items.filter(item => {
      const isItemActive = item.active !== false;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? isItemActive : !isItemActive);
      const stock = numeric(item.stock);
      const minimum = numeric(item.minStock ?? 5);
      const matchesSearch = !term || `${item.name} ${item.shortCode || ''} ${item.barcode || ''} ${item.category?.name || ''}`.toLocaleLowerCase('pt-BR').includes(term);
      const matchesStock = stockFilter === 'all' || (stockFilter === 'out' ? stock <= 0 : stockFilter === 'low' ? stock > 0 && stock <= minimum : stock > minimum);
      return matchesStatus && matchesSearch && matchesStock;
    });
  }, [items, search, stockFilter, statusFilter]);

  return <div className={`${pageClass} petcare-product-crud`}>
    <PageHeader eyebrow="Catálogo compartilhado com o PDV" title="Produtos" description="Mercadorias vendidas no balcão, como shampoo, rações e acessórios. Serviços e pacotes ficam nas suas respectivas áreas." action={<button type="button" onClick={() => setAddOpen(true)} className={`${primaryButton} flex items-center justify-center gap-2`}><Plus aria-hidden="true" size={17} />Novo produto</button>} />

    <CatalogTabs />

    <section aria-label="Resumo do estoque" className="mb-5 grid overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white sm:grid-cols-3">
      <button type="button" onClick={() => { setStatusFilter('active'); setStockFilter('all'); }} className="flex min-h-16 items-center gap-3 px-4 py-4 text-left transition hover:bg-[var(--pc-action-soft)]/50 sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--pc-action-soft)] text-[var(--pc-action)]"><PackageCheck aria-hidden="true" size={18} /></span><div><strong className="text-xl font-semibold tabular-nums">{summary.active}</strong><p className="text-xs text-[var(--pc-text-secondary)]">produtos ativos{summary.inactive > 0 ? ` · ${summary.inactive} inativo(s)` : ''}</p></div></button>
      <button type="button" onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')} aria-pressed={stockFilter === 'low'} className="flex min-h-16 items-center gap-3 border-t border-[var(--pc-border)] px-4 py-4 text-left transition hover:bg-[var(--pc-warning-soft)] sm:border-l sm:border-t-0 sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--pc-warning-soft)] text-[var(--pc-warning)]"><TriangleAlert aria-hidden="true" size={18} /></span><div><strong className="text-xl font-semibold tabular-nums">{summary.low}</strong><p className="text-xs text-[var(--pc-text-secondary)]">estoque baixo</p></div></button>
      <button type="button" onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')} aria-pressed={stockFilter === 'out'} className="flex min-h-16 items-center gap-3 border-t border-[var(--pc-border)] px-4 py-4 text-left transition hover:bg-[var(--pc-danger-soft)] sm:border-l sm:border-t-0 sm:px-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--pc-danger-soft)] text-[var(--pc-danger)]"><PackageX aria-hidden="true" size={18} /></span><div><strong className="text-xl font-semibold tabular-nums">{summary.out}</strong><p className="text-xs text-[var(--pc-text-secondary)]">sem estoque</p></div></button>
    </section>

    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <div className="min-w-0 flex-1"><SearchField value={search} onChange={setSearch} label="Buscar produtos" placeholder="Buscar produto, categoria ou código" /></div>
      <label className="sm:w-52"><span className="sr-only">Situação do estoque</span><select value={stockFilter} onChange={event => setStockFilter(event.target.value as StockFilter)} className={inputClass}><option value="all">Todos os estoques</option><option value="ok">Estoque normal</option><option value="low">Estoque baixo</option><option value="out">Sem estoque</option></select></label>
      <label className="sm:w-48"><span className="sr-only">Status do produto</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className={inputClass}><option value="active">Somente ativos ({summary.active})</option><option value="inactive">Inativos ({summary.inactive})</option><option value="all">Todos ({items.length})</option></select></label>
      
      {/* Botão Regras de Estoque */}
      <button
        type="button"
        onClick={() => setShowStockSettings(!showStockSettings)}
        className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 shadow-2xs ${
          showStockSettings
            ? 'bg-teal-600 border-teal-600 text-white shadow-teal-600/20'
            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300'
        }`}
        title="Configurações e Regras de Estoque"
      >
        <SlidersHorizontal size={14} className={showStockSettings ? 'text-white' : 'text-teal-700'} />
        <span>Regras</span>
        {showStockSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
    </div>

    {/* Painel Retrátil de Regras do Estoque no Design System Pract Pet */}
    {showStockSettings && (
      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between mb-3 border-b border-zinc-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <SlidersHorizontal size={14} />
            </span>
            <div>
              <h3 className="text-xs font-bold text-zinc-900">Configurações e Regras de Estoque</h3>
              <p className="text-[11px] text-zinc-500">Defina políticas de venda sem estoque, validade e reposição mínima.</p>
            </div>
          </div>
          {allowNegativeStock && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200/60">
              <ShieldAlert size={12} />
              Venda sem estoque ativa
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Vender sem estoque */}
          <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
            allowNegativeStock ? 'bg-amber-50/70 border-amber-300 text-amber-950' : 'bg-zinc-50/70 border-zinc-200 text-zinc-700'
          }`}>
            <div className="min-w-0 flex items-center gap-2.5">
              <ShieldAlert size={18} className={allowNegativeStock ? 'text-amber-600 shrink-0' : 'text-zinc-400 shrink-0'} />
              <div>
                <strong className="text-xs font-bold block">Vender sem estoque</strong>
                <span className="text-[10px] text-zinc-500 block">
                  {allowNegativeStock ? 'PDV permite saldo negativo' : 'PDV bloqueia produto zerado'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleNegativeStock(!allowNegativeStock)}
              disabled={savingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                allowNegativeStock ? 'bg-amber-500' : 'bg-zinc-300'
              } ${savingSettings ? 'opacity-50 cursor-wait' : ''}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                allowNegativeStock ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Card 2: Controle de Validade */}
          <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
            enableExpiryControl ? 'bg-teal-50/70 border-teal-300 text-teal-950' : 'bg-zinc-50/70 border-zinc-200 text-zinc-700'
          }`}>
            <div className="min-w-0 flex items-center gap-2.5">
              <CalendarClock size={18} className={enableExpiryControl ? 'text-teal-700 shrink-0' : 'text-zinc-400 shrink-0'} />
              <div>
                <strong className="text-xs font-bold block">Controle Validade</strong>
                <span className="text-[10px] text-zinc-500 block">Alertar vencimento prévio</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {enableExpiryControl && (
                <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-teal-200">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={expiryAlertDaysInput}
                    onChange={e => setExpiryAlertDaysInput(e.target.value)}
                    onBlur={handleSaveExpiryDays}
                    className="w-8 text-center text-xs font-bold text-teal-900 outline-none"
                    title="Dias antes do vencimento"
                  />
                  <span className="text-[10px] text-zinc-400 font-medium">dias</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleToggleExpiryControl(!enableExpiryControl)}
                disabled={savingExpirySettings}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                  enableExpiryControl ? 'bg-teal-600' : 'bg-zinc-300'
                } ${savingExpirySettings ? 'opacity-50 cursor-wait' : ''}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                  enableExpiryControl ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>

          {/* Card 3: Alerta de Reposição Padrão */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 text-zinc-700">
            <div className="min-w-0 flex items-center gap-2.5">
              <AlertOctagon size={18} className="text-rose-500 shrink-0" />
              <div>
                <strong className="text-xs font-bold block">Alerta Reposição</strong>
                <span className="text-[10px] text-zinc-500 block">Estoque mínimo padrão</span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-zinc-200">
              <input
                type="number"
                min="0"
                max="9999"
                value={lowStockInput}
                onChange={e => setLowStockInput(e.target.value)}
                onBlur={handleSaveLowStock}
                className="w-10 text-center text-xs font-bold text-zinc-800 outline-none"
                title="Estoque mínimo padrão para alerta de reposição"
              />
              <span className="text-[10px] text-zinc-400 font-medium">UN</span>
            </div>
          </div>
        </div>
      </div>
    )}

    <section className="pc-panel overflow-hidden" aria-label="Produtos cadastrados">
      {loading ? <ListSkeleton rows={5} /> : filtered.length === 0 ? <EmptyState icon={Package} title={items.length ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description={items.length ? 'Revise a busca ou altere os filtros de estoque e status.' : 'Cadastre os itens vendidos no balcão, como rações, petiscos, higiene e acessórios.'} action={!items.length && <button type="button" onClick={() => setAddOpen(true)} className={`${primaryButton} inline-flex items-center gap-2`}><Plus aria-hidden="true" size={16} />Cadastrar primeiro produto</button>} /> : <div className="divide-y divide-[var(--pc-border)]">{filtered.map(item => {
        const stock = numeric(item.stock);
        const minimum = numeric(item.minStock ?? 5);
        const stockTone = stock <= 0 ? 'bg-[var(--pc-danger-soft)] text-[var(--pc-danger)]' : stock <= minimum ? 'bg-[var(--pc-warning-soft)] text-[var(--pc-warning)]' : 'bg-[var(--pc-success-soft)] text-[var(--pc-success)]';
        const stockLabel = stock <= 0 ? 'Sem estoque' : stock <= minimum ? 'Estoque baixo' : 'Disponível';
        const isActive = item.active !== false;
        return <article key={item.id} className={`pc-row grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[48px_minmax(180px,1.2fr)_minmax(140px,1fr)_120px_120px_110px_110px_auto] lg:items-center ${!isActive ? 'opacity-60' : ''}`}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-11 w-11 rounded-lg border border-[var(--pc-border)] object-cover" loading="lazy" /> : <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--pc-surface-subtle)] text-[var(--pc-text-secondary)]"><Box size={18} /></span>}
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold">{item.name}</h2>{!isActive && <span className="pc-status pc-status--neutral">Inativo</span>}</div><p className="mt-1 truncate text-xs text-[var(--pc-text-muted)]">{item.category?.name || 'Sem categoria'}{item.shortCode ? ` · Cód. ${item.shortCode}` : ''}{item.barcode ? ` · ${item.barcode}` : ''}</p></div>
          <div>
            <p className="text-xs text-[var(--pc-text-muted)] mb-1">Fornecedores</p>
            <PetshopSupplierSelector product={item} suppliers={suppliers} onToggle={(supplierId, isLinked) => handleToggleSupplier(item.id, supplierId, isLinked)} />
          </div>
          <div><p className="text-xs text-[var(--pc-text-muted)]">Preço de custo</p><strong className="mt-0.5 block text-sm font-semibold tabular-nums text-[var(--pc-text-secondary)]">{money(item.priceCost)}</strong></div>
          <div><p className="text-xs text-[var(--pc-text-muted)]">Preço de venda</p><strong className="mt-0.5 block text-sm font-semibold tabular-nums">{money(item.priceSell)}</strong></div>
          <button
            type="button"
            onClick={() => setSelectedLotsProduct(item)}
            className="group/stock -m-1.5 p-1.5 text-left rounded-lg transition hover:bg-[var(--pc-action-soft)] cursor-pointer"
            title="Clique para ver os lotes e validades deste produto"
          >
            <p className="text-xs text-[var(--pc-text-muted)] group-hover/stock:text-[var(--pc-action)] flex items-center gap-1 font-medium">
              <span>Saldo atual</span>
              <span className="text-[10px] text-[var(--pc-action)] opacity-0 group-hover/stock:opacity-100 transition-opacity">↗</span>
            </p>
            <strong className="mt-0.5 block text-sm font-bold tabular-nums text-[var(--pc-text)] group-hover/stock:text-[var(--pc-action)] underline decoration-dotted decoration-[var(--pc-border-strong)] underline-offset-4">
              {stock.toLocaleString('pt-BR')} {item.unit}
            </strong>
          </button>
          <span className={`pc-status w-fit ${stockTone}`}>{stockLabel}</span>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap lg:justify-end">
            <button type="button" onClick={() => setEditingProduct(item)} className={`${secondaryButton} flex items-center justify-center gap-2 whitespace-nowrap px-3`}><Pencil aria-hidden="true" size={15} />Editar</button>
            <button
              type="button"
              onClick={() => void toggleActive(item)}
              disabled={togglingId === item.id}
              title={isActive ? 'Desativar produto para ocultar da lista' : 'Reativar produto no catálogo'}
              className={`min-h-11 cursor-pointer rounded-lg border px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition disabled:cursor-wait disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                isActive
                  ? 'border-[var(--pc-border-strong)] bg-white text-[var(--pc-text-secondary)] hover:border-[var(--pc-danger)]/35 hover:bg-[var(--pc-danger-soft)] hover:text-[var(--pc-danger)]'
                  : 'border-[var(--pc-action)]/30 bg-[var(--pc-action-soft)] text-[var(--pc-action)] hover:bg-[var(--pc-action)] hover:text-white'
              }`}
            >
              {isActive ? <PowerOff aria-hidden="true" size={14} /> : <Power aria-hidden="true" size={14} />}
              {togglingId === item.id ? 'Salvando…' : isActive ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </article>;
      })}</div>}
    </section>

    {addOpen && <AddProductModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSuccess={() => void load()} variant="petshop" />}
    {editingProduct && <EditProductModal isOpen={Boolean(editingProduct)} product={editingProduct as any} onClose={() => setEditingProduct(null)} onSuccess={() => void load()} variant="petshop" />}
    {selectedLotsProduct && <PetshopProductLotsModal isOpen={Boolean(selectedLotsProduct)} product={selectedLotsProduct} onClose={() => setSelectedLotsProduct(null)} onUpdate={() => void load()} />}
  </div>;
}
