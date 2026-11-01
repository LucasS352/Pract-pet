"use client";
import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, PackagePlus, Search, Loader2, Plus, CheckCircle2, AlertTriangle, CalendarClock, Package } from 'lucide-react';
import ManagePackagingsModal, { PackagingItem } from '@/components/ManagePackagingsModal';

// ── Tipos ────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

export default function StockEntryPage() {
  const location = useLocation();
  const backPath = location.pathname.startsWith('/petshop') ? '/petshop/produtos' : '/dashboard/inventory';
  const backLabel = location.pathname.startsWith('/petshop') ? 'Voltar para Produtos Pet' : 'Voltar ao Catálogo';
  const [products,   setProducts]   = useState<Product[]>([]);
  const [rows,       setRows]       = useState<StockRow[]>([]);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [suppliers,  setSuppliers]  = useState<{ id: string; name: string }[]>([]);

  // Embalagens cadastradas
  const [packagings, setPackagings] = useState<PackagingItem[]>([]);
  const [showPackagingsModal, setShowPackagingsModal] = useState(false);

  // Verifica se o módulo de validade está ativo
  const [expiryEnabled, setExpiryEnabled] = useState(false);

  const fetchPackagings = useCallback(async () => {
    try {
      const { data } = await api.get('/purchase-orders/packagings/all');
      setPackagings(data || []);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, supRes, settingsRes, packRes] = await Promise.all([
        api.get('/products?limit=2000'),
        api.get('/suppliers'),
        api.get('/products/settings'),
        api.get('/purchase-orders/packagings/all').catch(() => ({ data: [] })),
      ]);
      const list = (prodRes.data as any)?.data ?? prodRes.data ?? [];
      setProducts((list as Product[]).filter(p => p !== null));
      setSuppliers(supRes.data || []);
      setExpiryEnabled(settingsRes.data?.enableExpiryControl ?? false);
      setPackagings(packRes.data || []);
    } catch {
      toast.error('Erro ao carregar dados de entrada de estoque.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // ── Filtro de busca inteligente ───────────────────────────────────────────
  const deferredSearch = useDeferredValue(search);
  
  const filtered = useMemo(() => {
    const normalizeStr = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const searchTerms = normalizeStr(deferredSearch).split(' ').filter(t => t.trim() !== '');
    return products.filter(p => {
      if (searchTerms.length === 0) return true;
      const searchString = normalizeStr(`${p.name} ${p.shortCode || ''}`);
      return searchTerms.every(term => searchString.includes(term));
    });
  }, [products, deferredSearch]);

  // ── Gerenciar linhas de entrada ───────────────────────────────────────────

  /** Adiciona produto à lista de entrada se não estiver lá */
  const addToEntry = (product: Product) => {
    if (rows.find(r => r.product.id === product.id)) return; // já na lista
    
    // Gera um numero de lote sugerido (ex: LT-260710-X8J3)
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const suggestedLot = `LT-${datePart}-${randomPart}`;

    setRows(prev => [...prev, {
      product,
      qty: '',
      costPrice: product.priceCost?.toString() || '',
      lotNumber: suggestedLot,
      expiresAt: '',
      supplierId: '',
      unitName: 'UN',
      unitMultiplier: 1,
      saving: false,
      saved: false,
    }]);
    setSearch(''); // limpa busca ao adicionar
  };

  const updateQty = (productId: string, qty: string) => {
    setRows(prev => prev.map(r => r.product.id === productId ? { ...r, qty, saved: false } : r));
  };

  const updatePackaging = (productId: string, unitName: string, unitMultiplier: number) => {
    setRows(prev => prev.map(r => r.product.id === productId ? { ...r, unitName, unitMultiplier, saved: false } : r));
  };

  const updateCostPrice = (productId: string, costPrice: string) => {
    setRows(prev => prev.map(r => r.product.id === productId ? { ...r, costPrice, saved: false } : r));
  };

  const updateLotField = (productId: string, field: 'lotNumber' | 'expiresAt' | 'supplierId', value: string) => {
    setRows(prev => prev.map(r => r.product.id === productId ? { ...r, [field]: value, saved: false } : r));
  };

  const removeRow = (productId: string) => {
    setRows(prev => prev.filter(r => r.product.id !== productId));
  };

  /** Confirma a entrada de um item específico com suporte à conversão de embalagem */
  const confirmEntry = async (productId: string) => {
    const row = rows.find(r => r.product.id === productId);
    if (!row) return;

    const rawQty = parseInt(row.qty, 10);
    if (!rawQty || rawQty <= 0) {
      toast.error('Informe uma quantidade válida (número inteiro maior que zero).');
      return;
    }

    const multiplier = Number(row.unitMultiplier) || 1;
    const totalQty = rawQty * multiplier;

    const costNum = parseFloat(row.costPrice);
    if (isNaN(costNum) || costNum < 0) {
      toast.error('Informe um preço de custo válido.');
      return;
    }

    setRows(prev => prev.map(r => r.product.id === productId ? { ...r, saving: true } : r));

    try {
      const reason = multiplier > 1
        ? `Entrada de Estoque — Reposição (${rawQty}x ${row.unitName || 'Embalagem'} = ${totalQty} un)`
        : 'Entrada de Estoque — Reposição via App';

      await api.post(`/products/add-stock/${productId}`, {
        quantity: totalQty,
        costPrice: costNum,
        reason,
        ...(expiryEnabled && row.lotNumber    ? { lotNumber: row.lotNumber }  : {}),
        ...(expiryEnabled && row.expiresAt    ? { expiresAt: row.expiresAt }  : {}),
        ...(expiryEnabled && row.supplierId   ? { supplierId: row.supplierId } : {}),
      });

      const packLabel = multiplier > 1 ? ` (${rawQty}x ${row.unitName})` : '';
      toast.success(`+${totalQty} unidades adicionadas a "${row.product.name}"!${packLabel}`);

      setRows(prev => prev.map(r =>
        r.product.id === productId
          ? { 
              ...r, 
              saving: false, 
              saved: true, 
              qty: '', 
              product: { 
                ...r.product, 
                stock: Number(r.product.stock) + totalQty,
                priceCost: costNum
              } 
            }
          : r
      ));

      // Atualiza o estoque local e custo imediatamente
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, stock: Number(p.stock) + totalQty, priceCost: costNum } : p
      ));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Erro ao registrar entrada.');
      setRows(prev => prev.map(r => r.product.id === productId ? { ...r, saving: false } : r));
    }
  };

  /** Confirma todas as entradas de uma vez */
  const confirmAll = async () => {
    const pending = rows.filter(r => parseInt(r.qty, 10) > 0 && !r.saved);
    if (pending.length === 0) {
      toast.warning('Nenhuma quantidade preenchida para confirmar.');
      return;
    }
    for (const row of pending) {
      await confirmEntry(row.product.id);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link to={backPath} className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors">
            <ArrowLeft size={16} /> {backLabel}
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <PackagePlus className="text-emerald-500" size={32} /> Entrada de Estoque
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Busque o produto e informe a quantidade recebida. A operação soma ao estoque existente de forma segura.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setShowPackagingsModal(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-xl font-bold transition border border-zinc-700 text-sm whitespace-nowrap flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
            title="Gerenciar formatos de embalagem (fardo, caixa, etc.)"
          >
            <Package size={17} className="text-zinc-400" />
            <span>Gerenciar Embalagens</span>
          </button>

          {rows.some(r => parseFloat(r.qty) > 0 && !r.saved) && (
            <button
              onClick={confirmAll}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 text-sm whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 size={18} /> Confirmar Todos
            </button>
          )}
        </div>
      </div>

      {/* Busca de produtos */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <label className="text-sm font-bold text-zinc-400 mb-3 block">
          Buscar produto para adicionar à lista de entrada:
        </label>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Nome ou código curto do produto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 pl-10 text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Resultados da busca */}
        {search.length > 0 && (
          <div className="mt-3 border border-zinc-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="animate-spin text-emerald-500" size={24} />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm p-4 text-center">Nenhum produto encontrado.</p>
            ) : (
              filtered.slice(0, 10).map(product => (
                <button
                  key={product.id}
                  onClick={() => addToEntry(product)}
                  disabled={rows.some(r => r.product.id === product.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/60 transition-colors border-b border-zinc-800/50 last:border-0 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <div className="w-10 h-10 shrink-0 bg-white rounded-lg flex items-center justify-center p-0.5 shadow-sm">
                        <img src={product.imageUrl} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 shrink-0 bg-zinc-800 rounded-lg flex items-center justify-center shadow-sm">
                        <PackagePlus size={18} className="text-zinc-500" />
                      </div>
                    )}
                    <div>
                      <p className="text-white font-semibold text-sm">{product.name}</p>
                      <p className="text-zinc-500 text-xs">{product.category?.name} • Estoque atual: <span className={`font-bold ${Number(product.stock) <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>{Number(product.stock)}</span> {product.unit}</p>
                    </div>
                  </div>
                  <Plus size={20} className="text-emerald-400 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Lista de entradas */}
      {rows.length > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
            <h2 className="font-bold text-white">Lista de Entrada ({rows.length} {rows.length === 1 ? 'item' : 'itens'})</h2>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {rows.map(row => (
              <div key={row.product.id} className={`px-4 lg:px-6 py-4 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6 transition-colors ${row.saved ? 'bg-emerald-950/20' : 'hover:bg-zinc-800/30'}`}>

                {/* Info do produto */}
                <div className="flex items-center justify-between w-full lg:w-auto lg:flex-1 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                  {row.product.imageUrl ? (
                    <div className="w-12 h-12 shrink-0 bg-white rounded-lg flex items-center justify-center p-1 shadow-sm">
                      <img src={row.product.imageUrl} alt="" className="w-full h-full object-contain mix-blend-multiply" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 shrink-0 bg-zinc-800/50 border border-zinc-800 rounded-lg flex items-center justify-center">
                      <PackagePlus size={20} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{row.product.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      Estoque atual: <span className={`font-bold ${Number(row.product.stock) <= 0 ? 'text-red-400' : 'text-zinc-300'}`}>{Number(row.product.stock)}</span> {row.product.unit}
                    </p>
                  </div>
                  </div>
                  <button
                    onClick={() => removeRow(row.product.id)}
                    className="lg:hidden text-zinc-500 hover:text-red-400 p-2 rounded-lg bg-zinc-900/50"
                  >
                    <AlertTriangle size={16} />
                  </button>
                </div>

                {/* Inputs de Entrada (Embalagem, Quantidade, Custo e Validade) */}
                <div className="flex flex-col gap-3 w-full lg:flex-1 bg-zinc-900/30 lg:bg-transparent p-3 lg:p-0 rounded-xl">
                  <div className="grid grid-cols-1 sm:grid-cols-3 items-end gap-3 lg:gap-4">
                    {/* Seletor de Embalagem */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">Embalagem:</label>
                      <select
                        value={`${row.unitName || 'UN'}|${row.unitMultiplier || 1}`}
                        onChange={e => {
                          const [name, multiplier] = e.target.value.split('|');
                          updatePackaging(row.product.id, name, Number(multiplier));
                        }}
                        disabled={row.saving || row.saved}
                        className="w-full bg-zinc-950 border border-zinc-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-xs font-medium text-white outline-none transition-colors disabled:opacity-50"
                      >
                        <option value="UN|1">Unidade (1 {row.product.unit || 'un'})</option>
                        {packagings.map(p => (
                          <option key={p.id} value={`${p.name}|${p.multiplier}`}>
                            {p.name} ({p.multiplier} un)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Campo de quantidade com indicador de conversão */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">
                          Qtd ({row.unitMultiplier && row.unitMultiplier > 1 ? 'Embalagem' : 'Unidades'}):
                        </label>
                        {row.unitMultiplier && row.unitMultiplier > 1 && row.qty && parseInt(row.qty, 10) > 0 && (
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded animate-in fade-in duration-200 truncate">
                            = {parseInt(row.qty, 10) * row.unitMultiplier} un
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="0"
                        value={row.qty}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          updateQty(row.product.id, val);
                        }}
                        onKeyDown={e => e.key === 'Enter' && confirmEntry(row.product.id)}
                        disabled={row.saving || row.saved}
                        className="w-full bg-zinc-950 border-2 border-zinc-700 focus:border-emerald-500 rounded-xl px-2 py-2 text-emerald-400 font-black text-lg text-center focus:outline-none transition-colors disabled:opacity-50"
                      />
                    </div>

                    {/* Campo de custo de aquisição */}
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">Custo Unitário:</label>
                      <div className="relative w-full">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={row.costPrice}
                          onChange={e => updateCostPrice(row.product.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && confirmEntry(row.product.id)}
                          disabled={row.saving || row.saved}
                          className="w-full bg-zinc-950 border-2 border-zinc-700 focus:border-emerald-500 rounded-xl pl-7 pr-2 py-2 text-rose-400 font-black text-lg text-center focus:outline-none transition-colors disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Campos opcionais de validade */}
                  {expiryEnabled && !row.saved && (
                    <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-end gap-3 pt-3 lg:pt-1 border-t border-zinc-800/60 mt-1 lg:mt-0">
                      <div className="col-span-2 lg:hidden flex items-center gap-2 mb-1">
                        <CalendarClock size={14} className="text-blue-400" />
                        <span className="text-xs font-bold text-blue-400">Rastreabilidade</span>
                      </div>
                      <CalendarClock size={14} className="hidden lg:block text-blue-400 shrink-0" />

                      {/* Número do lote */}
                      <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-1.5">
                        <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">Nº Lote:</label>
                        <input
                          type="text"
                          placeholder="LT-001"
                          value={row.lotNumber}
                          onChange={e => updateLotField(row.product.id, 'lotNumber', e.target.value)}
                          disabled={row.saving}
                          className="w-full lg:w-24 bg-zinc-950 border border-zinc-700 focus:border-blue-500 rounded-lg px-2 py-1.5 text-blue-300 text-sm font-mono focus:outline-none transition-colors disabled:opacity-50"
                        />
                      </div>

                      {/* Data de validade */}
                      <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-1.5">
                        <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">Validade:</label>
                        <input
                          type="date"
                          value={row.expiresAt}
                          onChange={e => updateLotField(row.product.id, 'expiresAt', e.target.value)}
                          disabled={row.saving}
                          className="w-full lg:w-auto bg-zinc-950 border border-zinc-700 focus:border-blue-500 rounded-lg px-2 py-1.5 text-blue-300 text-sm focus:outline-none transition-colors disabled:opacity-50"
                        />
                      </div>

                      {/* Fornecedor */}
                      <div className="col-span-2 flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-1.5 mt-1 lg:mt-0">
                        <label className="text-zinc-500 text-xs font-semibold whitespace-nowrap">Fornecedor:</label>
                        <select
                          value={row.supplierId}
                          onChange={e => updateLotField(row.product.id, 'supplierId', e.target.value)}
                          disabled={row.saving}
                          className="w-full lg:w-auto bg-zinc-950 border border-zinc-700 focus:border-blue-500 rounded-lg px-2 py-1.5 text-blue-300 text-sm focus:outline-none transition-colors disabled:opacity-50"
                        >
                          <option value="">Sem fornecedor</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between lg:justify-end gap-3 w-full lg:w-auto pt-2 lg:pt-0">
                  {/* Botão confirmar */}
                  {row.saved ? (
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm whitespace-nowrap w-full lg:w-auto justify-center bg-emerald-950/40 lg:bg-transparent py-2 rounded-xl lg:py-0">
                      <CheckCircle2 size={18} /> Salvo!
                    </span>
                  ) : (
                    <button
                      onClick={() => confirmEntry(row.product.id)}
                      disabled={row.saving || !row.qty || parseInt(row.qty, 10) <= 0}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 lg:py-2 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap w-full lg:w-auto cursor-pointer"
                    >
                      {row.saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Confirmar
                    </button>
                  )}

                  {/* Remover linha (Desktop) */}
                  <button
                    onClick={() => removeRow(row.product.id)}
                    className="hidden lg:block text-zinc-600 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-500/10 shrink-0 cursor-pointer"
                    title="Remover da lista"
                  >
                    <AlertTriangle size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
          <PackagePlus size={48} className="mb-4 opacity-30" />
          <p className="text-lg">Busque um produto acima para começar a entrada.</p>
          <p className="text-sm mt-1 opacity-70">Você pode adicionar vários produtos antes de confirmar.</p>
        </div>
      )}

      {/* Modal Gerenciar Embalagens */}
      <ManagePackagingsModal
        isOpen={showPackagingsModal}
        onClose={() => setShowPackagingsModal(false)}
        onPackagingsChange={fetchPackagings}
      />
    </div>
  );
}
