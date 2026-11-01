"use client";
import { useEffect, useState, useCallback, useDeferredValue, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { Package, Search, Edit3, Loader2, DollarSign, TrendingUp, BarChart3, AlertOctagon, Plus, PackagePlus, ShieldAlert, X, Truck, ShoppingCart, FileSpreadsheet, Save, AlertTriangle, CalendarClock, PackageOpen, Split, Check, Download, ClipboardList, FileDown, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { AddProductModal } from '@/components/AddProductModal';
import { EditProductModal } from '@/components/EditProductModal';
import { useAuthStore } from '@/store/auth';
import * as XLSX from 'xlsx';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface GrupoTributacao { nome: string }

interface Product {
  id: string;
  name: string;
  priceCost: number;
  priceSell: number;
  stock: number;
  barcode: string | null;
  shortCode: string | null;
  active: boolean;
  ncm?: string | null;
  grupoTributacaoId?: string | null;
  grupoTributacao?: GrupoTributacao | null;
  imageUrl?: string | null;
  supplierProducts?: { supplierId: string }[];
  categoryId?: string | null;
  minStock?: number | null;
}

interface Supplier {
  id: string;
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────

function SupplierSelector({ product, suppliers, onToggle }: { product: Product, suppliers: Supplier[], onToggle: (supplierId: string, isLinked: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const linkedCount = product.supplierProducts?.length || 0;

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
        left: clampedLeft
      });
      setSearchTerm('');
    }
    setIsOpen(!isOpen);
  };

  const linkedSuppliers = suppliers.filter(s => product.supplierProducts?.some(sp => sp.supplierId === s.id));

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    return suppliers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [suppliers, searchTerm]);

  return (
    <div className="flex items-center justify-center gap-2">
      {linkedSuppliers.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[250px]">
          {linkedSuppliers.slice(0, 4).map(s => (
            <span key={s.id} className="text-[10px] font-medium bg-zinc-800 border border-zinc-700/80 text-zinc-300 px-2 py-0.5 rounded-full shadow-sm text-center" title={s.name}>
              {s.name}
            </span>
          ))}
          {linkedSuppliers.length > 4 && (
            <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800/50 border border-zinc-700/50 px-1.5 py-0.5 rounded-full">
              +{linkedSuppliers.length - 4}
            </span>
          )}
        </div>
      )}
      <div className="relative inline-block text-left">
        <button
          ref={buttonRef}
          onClick={handleToggle}
          className={`h-7 px-2 rounded-lg flex items-center justify-center border transition-all ${
            linkedCount > 0 
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' 
              : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200'
          }`}
          title="Gerenciar Fornecedores"
        >
          {linkedCount > 0 ? <Edit3 size={14} /> : <Plus size={14} />}
        </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed z-[9999] w-64 rounded-xl bg-zinc-800 border border-zinc-700 shadow-2xl text-left flex flex-col overflow-hidden"
          style={{ 
            left: dropdownPos.left, 
            top: dropdownPos.top,
            transform: `translate(-50%, ${openUpwards ? '-100%' : '0'})`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2.5 border-b border-zinc-700/60 bg-zinc-800">
            <div className="flex justify-between items-center mb-1.5 px-1">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Fornecedores ({suppliers.length})
              </span>
              <button 
                type="button"
                onClick={() => setIsOpen(false)} 
                className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-zinc-700 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            {suppliers.length > 5 && (
              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="Buscar fornecedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
            )}
          </div>
          <div className="p-2 max-h-60 overflow-y-auto overscroll-contain custom-scrollbar">
            {filteredSuppliers.length === 0 ? (
              <div className="text-xs text-zinc-500 p-2 text-center">
                {suppliers.length === 0 ? 'Nenhum fornecedor cadastrado' : 'Nenhum fornecedor encontrado'}
              </div>
            ) : (
              filteredSuppliers.map(s => {
                const isLinked = product.supplierProducts?.some(sp => sp.supplierId === s.id) || false;
                return (
                  <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-zinc-700 rounded-lg cursor-pointer text-sm text-zinc-200 transition-colors">
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => onToggle(s.id, isLinked)}
                      className="rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-800 w-4 h-4 cursor-pointer"
                    />
                    <span className="truncate flex-1 select-none">{s.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );
}

export default function InventoryDashboard() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isStockist = user?.role === 'stockist';
  const navigate = useNavigate();

  const [products,            setProducts]            = useState<Product[]>([]);
  const [suppliers,           setSuppliers]           = useState<Supplier[]>([]);
  const [loading,             setLoading]             = useState(true);
  const [search,              setSearch]              = useState('');
  const [isAddOpen,           setIsAddOpen]           = useState(false);
  const [editingProduct,      setEditingProduct]      = useState<Product | null>(null);
  const [allowNegativeStock,  setAllowNegativeStock]  = useState(false);
  const [savingSettings,      setSavingSettings]      = useState(false);
  const [showLowStockAlert,   setShowLowStockAlert]   = useState(false);
  const [categories,          setCategories]          = useState<any[]>([]);
  const [selectedCategory,    setSelectedCategory]    = useState<string>('');

  // ── Auto-Order Review Modal ──
  const [isAutoOrderOpen, setIsAutoOrderOpen] = useState(false);
  const [isCreatingOrders, setIsCreatingOrders] = useState(false);
  // Each row: { productId, productName, supplierProducts, selectedSupplierId, stock, minStock, priceCost, qty }
  const [autoOrderRows, setAutoOrderRows] = useState<any[]>([]);

  const [lotModalProduct, setLotModalProduct] = useState<Product | null>(null);
  const [productLots, setProductLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);

  // ── Módulo de Validade ──
  const [enableExpiryControl, setEnableExpiryControl] = useState(false);
  const [expiryAlertDays,     setExpiryAlertDays]     = useState(30);
  const [savingExpirySettings, setSavingExpirySettings] = useState(false);
  const [expiryAlertDaysInput, setExpiryAlertDaysInput] = useState('30');

  // ── Alerta de Reposição ──
  const [lowStockAlertDefault, setLowStockAlertDefault] = useState(5);
  const [lowStockAlertInput, setLowStockAlertInput] = useState('5');
  const [savingLowStockAlert, setSavingLowStockAlert] = useState(false);
  
  const [expiryAlertCount, setExpiryAlertCount] = useState(0); // lotes expirando
  const [expiredCount,     setExpiredCount]      = useState(0); // lotes ja vencidos
  const [isExpiryModalOpen, setIsExpiryModalOpen] = useState(false);
  const [expiringLots,     setExpiringLots]      = useState<any[]>([]);
  const [loadingExpiry,    setLoadingExpiry]     = useState(false);

  // ── Edição e Divisão de Lotes ──
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editLotDate, setEditLotDate] = useState<string>('');
  const [splittingLot, setSplittingLot] = useState<any | null>(null);
  const [splitQty, setSplitQty] = useState('');
  const [splitDate, setSplitDate] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);

  // ── Registrar Lote Atual (converter estoque sem lote em lote rastreado) ──
  const [isRegisterLotOpen, setIsRegisterLotOpen] = useState(false);
  const [registerLotQty, setRegisterLotQty] = useState('');
  const [registerLotExpiry, setRegisterLotExpiry] = useState('');
  const [registerLotNumber, setRegisterLotNumber] = useState('');
  const [isRegisteringLot, setIsRegisteringLot] = useState(false);

  // ── Módulo NFC-e (controla exibição de avisos fiscais) ──
  const [nfceModuleEnabled, setNfceModuleEnabled] = useState(false);

  // ── Filtro de Ativos / Inativos e Configurações ──
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [showStockSettings, setShowStockSettings] = useState(false);

  const fetchExpiryData = useCallback((daysToUse: number) => {
    api.get(`/products/lots/expiring?days=${daysToUse}`)
      .then(lotsRes => {
        const allLots: any[] = lotsRes.data || [];
        setExpiringLots(allLots);
        setExpiredCount(allLots.filter(l => l.isExpired).length);
        setExpiryAlertCount(allLots.filter(l => !l.isExpired).length);
      }).catch(() => {});
  }, []);

  const handleUpdateLotDate = async (lotId: string) => {
    try {
      await api.patch(`/products/lots/${lotId}`, { expiresAt: editLotDate || null });
      toast.success('Validade atualizada!');
      if (lotModalProduct) {
        handleOpenLotsModal(lotModalProduct);
      }
      if (enableExpiryControl) {
        fetchExpiryData(expiryAlertDays);
      }
      setEditingLotId(null);
    } catch (err: any) {
      toast.error('Erro ao atualizar validade.');
    }
  };

  const handleSplitLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!splittingLot) return;
    try {
      setIsSplitting(true);
      await api.post(`/products/lots/${splittingLot.id}/split`, {
        splitQty: Number(splitQty),
        newExpiresAt: splitDate || undefined
      });
      toast.success('Lote dividido com sucesso!');
      if (lotModalProduct) {
        handleOpenLotsModal(lotModalProduct);
      }
      if (enableExpiryControl) {
        fetchExpiryData(expiryAlertDays);
      }
      setSplittingLot(null);
      setSplitQty('');
      setSplitDate('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao dividir lote.');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleOpenLotsModal = async (product: Product) => {
    setLotModalProduct(product);
    setLoadingLots(true);
    setProductLots([]);
    setIsRegisterLotOpen(false);
    setRegisterLotQty('');
    setRegisterLotExpiry('');
    
    // Auto-generate lot number
    const autoLot = `L${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
    setRegisterLotNumber(autoLot);
    
    try {
      const res = await api.get(`/products/${product.id}/lots`);
      setProductLots(res.data || []);
    } catch {
      toast.error('Erro ao carregar lotes de estoque.');
    } finally {
      setLoadingLots(false);
    }
  };

  const handleRegisterLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotModalProduct || !registerLotQty || Number(registerLotQty) <= 0) return;
    try {
      setIsRegisteringLot(true);
      await api.post(`/products/${lotModalProduct.id}/lots`, {
        quantity: Number(registerLotQty),
        expiresAt: registerLotExpiry || undefined,
        lotNumber: registerLotNumber || undefined
      });
      toast.success('Estoque registrado como lote com sucesso!');
      handleOpenLotsModal(lotModalProduct);
      fetchProducts();
      if (enableExpiryControl) {
        fetchExpiryData(expiryAlertDays);
      }
      setIsRegisterLotOpen(false);
      setRegisterLotQty('');
      setRegisterLotExpiry('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao registrar lote.');
    } finally {
      setIsRegisteringLot(false);
    }
  };

  const fetchProducts = useCallback(() => {
    setLoading(true);
    api.get('/products?limit=5000&includeInactive=true')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : (res.data as any).data;
        setProducts(data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchSuppliers = useCallback(() => {
    api.get('/suppliers')
      .then(res => setSuppliers(res.data || []))
      .catch(console.error);
  }, []);

  const fetchCategories = useCallback(() => {
    api.get('/categories')
      .then(res => setCategories(res.data || []))
      .catch(console.error);
  }, []);

  // Busca configurações do tenant ao montar
  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchCategories();

    // Verifica se o módulo NFC-e está ativo para este tenant
    api.get('/tenants/me')
      .then(res => {
        try {
          const modulos = res.data?.modulos;
          const parsed = modulos ? (typeof modulos === 'string' ? JSON.parse(modulos) : modulos) : {};
          setNfceModuleEnabled(parsed.nfce !== false);
        } catch (e) {
          setNfceModuleEnabled(false);
        }
      })
      .catch(() => setNfceModuleEnabled(false));

    if (isAdmin) {
      api.get<{ allowNegativeStock: boolean; enableExpiryControl: boolean; expiryAlertDays: number }>('/products/settings')
        .then(res => {
          setAllowNegativeStock(res.data.allowNegativeStock);
          const enabled = res.data.enableExpiryControl ?? false;
          const days = res.data.expiryAlertDays ?? 30;
          const lowStockDefault = (res.data as any).lowStockAlertDefault ?? 5;
          setEnableExpiryControl(enabled);
          setExpiryAlertDays(days);
          setExpiryAlertDaysInput(String(days));
          setLowStockAlertDefault(lowStockDefault);
          setLowStockAlertInput(String(lowStockDefault));

          if (enabled) {
            fetchExpiryData(days);
          }
        })
        .catch(console.error);
    }
  }, [fetchProducts, fetchSuppliers, fetchCategories, isAdmin, fetchExpiryData]);

  const handleToggleExpiryControl = async (value: boolean) => {
    setSavingExpirySettings(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl: value,
        expiryAlertDays,
      });
      setEnableExpiryControl(value);
      toast.success(value
        ? 'Módulo de Validade ATIVADO.'
        : 'Módulo de Validade desativado.'
      );
    } catch {
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSavingExpirySettings(false);
    }
  };

  const handleSaveLowStockAlert = async () => {
    const val = parseInt(lowStockAlertInput, 10);
    if (isNaN(val) || val < 0) {
      toast.error('Informe um número válido para o alerta.');
      return;
    }
    setSavingLowStockAlert(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl,
        expiryAlertDays,
        lowStockAlertDefault: val,
      });
      setLowStockAlertDefault(val);
      toast.success(`Alerta de reposição configurado para abaixo de ${val} unidades.`);
    } catch {
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSavingLowStockAlert(false);
    }
  };

  // ── Exportar Planilha de Reposição ────────────────────────────────────────
  const handleExportLowStock = () => {
    const data = lowStockProducts.map(p => {
      const threshold = (p.minStock != null) ? Number(p.minStock) : lowStockAlertDefault;
      const needed = Math.max(0, threshold - Number(p.stock));
      const estimatedCost = needed * Number(p.priceCost || 0);
      const supplierNames = (p.supplierProducts || [])
        .map((sp: any) => suppliers.find(s => s.id === sp.supplierId)?.name || sp.supplierId)
        .filter(Boolean)
        .join(', ') || 'Sem fornecedor';

      return {
        'Produto': p.name,
        'Fornecedor(es)': supplierNames,
        'Estoque Atual': Number(p.stock),
        'Estoque Mínimo': threshold,
        'Qtd. Sugerida (Reposição)': needed,
        'Custo Unit. (R$)': Number(p.priceCost || 0).toFixed(2),
        'Custo Estimado do Pedido (R$)': estimatedCost.toFixed(2),
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reposição de Estoque');
    XLSX.writeFile(wb, `alerta_reposicao_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
    toast.success('Planilha exportada com sucesso!');
  };

  // ── Abrir Modal de Revisão de Pedido Automático ───────────────────────────
  const handleOpenAutoOrder = () => {
    const rows = lowStockProducts
      .filter(p => p.supplierProducts && p.supplierProducts.length > 0)
      .map(p => {
        const threshold = (p.minStock != null) ? Number(p.minStock) : lowStockAlertDefault;
        const needed = Math.max(1, Math.ceil(threshold - Number(p.stock)));
        const defaultSupplierId = p.supplierProducts![0].supplierId;
        return {
          productId: p.id,
          productName: p.name,
          stock: Number(p.stock),
          minStock: threshold,
          priceCost: Number(p.priceCost || 0),
          supplierProducts: p.supplierProducts,
          selectedSupplierId: defaultSupplierId,
          qty: needed,
          included: true,
        };
      });

    if (rows.length === 0) {
      toast.error('Nenhum produto com alerta possui fornecedor vinculado.');
      return;
    }
    setAutoOrderRows(rows);
    setIsAutoOrderOpen(true);
  };

  // ── Confirmar criação dos pedidos automáticos ─────────────────────────────
  const handleConfirmAutoOrders = async () => {
    const includedRows = autoOrderRows.filter(r => r.included && r.qty > 0);
    if (includedRows.length === 0) {
      toast.error('Nenhum item selecionado para o pedido.');
      return;
    }
    setIsCreatingOrders(true);
    try {
      const items = includedRows.map(r => ({
        productId: r.productId,
        supplierId: r.selectedSupplierId,
        quantity: Number(r.qty),
        expectedCost: r.priceCost,
      }));
      await api.post('/purchase-orders/auto-from-low-stock', { items });
      toast.success('Pedidos criados com sucesso!');
      setIsAutoOrderOpen(false);
      navigate('/dashboard/purchase-orders');
    } catch {
      toast.error('Erro ao criar pedidos automáticos.');
    } finally {
      setIsCreatingOrders(false);
    }
  };

  const handleSaveExpiryDays = async () => {
    const days = parseInt(expiryAlertDaysInput, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      toast.error('Informe um número de dias válido (1-365).');
      return;
    }
    setSavingExpirySettings(true);
    try {
      await api.patch('/products/settings', {
        allowNegativeStock,
        enableExpiryControl,
        expiryAlertDays: days,
      });
      setExpiryAlertDays(days);
      toast.success(`Alerta configurado para ${days} dias antes do vencimento.`);
    } catch {
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSavingExpirySettings(false);
    }
  };

  const handleToggleNegativeStock = async (value: boolean) => {
    setSavingSettings(true);
    try {
      await api.patch('/products/settings', { allowNegativeStock: value });
      setAllowNegativeStock(value);
      toast.success(value
        ? 'Venda sem estoque ATIVADA — o PDV agora permite estoque negativo.'
        : 'Venda sem estoque DESATIVADA — o PDV vai bloquear quando zerar.'
      );
    } catch {
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/products/${id}`, { active: !currentStatus });
      setProducts(prev => prev.map(p => p.id === id ? { ...p, active: !currentStatus } : p));
      toast.success(currentStatus ? 'Produto inativado e oculto no PDV.' : 'Produto reativado no catálogo!');
    } catch {
      toast.error('Erro ao mudar status do produto');
    }
  };

  const handleToggleSupplier = async (productId: string, supplierId: string, isLinked: boolean) => {
    try {
      if (isLinked) {
        await api.delete(`/suppliers/${supplierId}/products/${productId}`);
        setProducts(prev => prev.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              supplierProducts: p.supplierProducts?.filter(sp => sp.supplierId !== supplierId) || []
            };
          }
          return p;
        }));
      } else {
        await api.post(`/suppliers/${supplierId}/products`, { productId });
        setProducts(prev => prev.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              supplierProducts: [...(p.supplierProducts || []), { supplierId }]
            };
          }
          return p;
        }));
      }
      toast.success(isLinked ? 'Desvinculado do fornecedor.' : 'Vinculado ao fornecedor.');
    } catch {
      toast.error('Erro ao atualizar fornecedor do produto.');
    }
  };

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1); // Resetar a paginação ao buscar
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const { displayedProducts, totalPages } = useMemo(() => {
    const normalizeStr = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    const searchTerms = normalizeStr(debouncedSearch).split(' ').filter(t => t.trim() !== '');
    
    const filtered = products.filter(p => {
      if (statusFilter === 'active' && p.active === false) return false;
      if (statusFilter === 'inactive' && p.active !== false) return false;
      if (selectedCategory && p.categoryId !== selectedCategory) return false;
      if (searchTerms.length === 0) return true;
      const searchString = normalizeStr(`${p.name} ${p.barcode || ''} ${p.shortCode || ''}`);
      return searchTerms.every(term => searchString.includes(term));
    });
    
    const totalPagesCount = Math.ceil(filtered.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);
    
    return { displayedProducts: paginated, totalPages: totalPagesCount };
  }, [products, debouncedSearch, currentPage, selectedCategory, statusFilter]);

  const { totalVarieties, totalItemsCount, totalGrossValue, totalCostValue, expectedProfit, lowStockProducts } = useMemo(() => {
    const activeProducts = products.filter(p => p.active !== false);
    const totalVarieties  = activeProducts.length;
    let totalItemsCount = 0;
    let totalGrossValue = 0;
    let totalCostValue  = 0;
    const lowStockProducts = [];

    for (const p of activeProducts) {
      const stock = Number(p.stock);
      totalItemsCount += stock;
      totalGrossValue += Number(p.priceSell) * stock;
      totalCostValue  += Number(p.priceCost || 0) * stock;
      const threshold = (p.minStock !== null && p.minStock !== undefined) ? Number(p.minStock) : lowStockAlertDefault;
      if (stock <= threshold) lowStockProducts.push(p);
    }
    const expectedProfit  = totalGrossValue - totalCostValue;

    return { totalVarieties, totalItemsCount, totalGrossValue, totalCostValue, expectedProfit, lowStockProducts };
  }, [products, lowStockAlertDefault]);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="animate-spin text-blue-500" size={48} />
    </div>
  );



  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
          <Package className="text-blue-500" size={32} /> Controle de Estoque
        </h1>
        <div className="flex overflow-x-auto w-full md:w-auto gap-2 pb-2 md:pb-0 custom-scrollbar snap-x select-none">
          <Link
            to="/dashboard/inventory/categories"
            className="snap-start shrink-0 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm"
          >
            Categorias
          </Link>
          <Link
            to="/dashboard/suppliers"
            className="snap-start shrink-0 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-600/30 text-indigo-400 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm"
          >
            <Truck size={17} /> Fornecedores
          </Link>
          <Link
            to="/dashboard/purchase-orders"
            className="snap-start shrink-0 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-600/30 text-amber-400 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm"
          >
            <ShoppingCart size={17} /> Pedidos
          </Link>
          <Link
            to="/dashboard/inventory/stock-entry"
            className="snap-start shrink-0 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm whitespace-nowrap"
          >
            <PackagePlus size={17} /> <span className="hidden sm:inline">Entrada de Estoque</span><span className="sm:hidden">Entrada</span>
          </Link>
          <Link
            to="/dashboard/inventory/purchases"
            className="snap-start shrink-0 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm whitespace-nowrap"
            title="Lançamento manual de produtos em lote"
          >
            <Plus size={17} /> <span className="hidden sm:inline">Lançamento de Produtos</span><span className="sm:hidden">Lançamento</span>
          </Link>
          <Link
            to="/dashboard/inventory/mass-edit"
            className="snap-start shrink-0 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-600/30 text-purple-300 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-sm whitespace-nowrap"
            title="Edição rápida de preços e estoque em massa"
          >
            <Save size={17} /> <span className="hidden sm:inline">Edição em Massa</span><span className="sm:hidden">Editar</span>
          </Link>
          <button
            onClick={() => setIsAddOpen(true)}
            className="snap-start shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs sm:text-sm active:scale-95 shadow-lg shadow-blue-600/20 whitespace-nowrap cursor-pointer"
          >
            <Plus size={17} /> Cadastrar Un.
          </button>
        </div>
      </div>

      {/* Alerta estoque baixo e Validades */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {lowStockProducts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => setShowLowStockAlert(!showLowStockAlert)}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold px-4 py-2 rounded-xl border border-red-500/20 transition-colors"
            >
              <AlertOctagon size={18} />
              {showLowStockAlert ? 'Ocultar Alerta de Reposição' : `Exibir Alerta de Reposição (${lowStockProducts.length} itens)`}
            </button>
            {showLowStockAlert && (
              <>
                <button
                  onClick={handleExportLowStock}
                  className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-3 py-2 rounded-xl border border-emerald-500/20 transition-colors text-sm"
                  title="Exportar lista de reposição como planilha Excel"
                >
                  <Download size={16} /> Exportar Planilha
                </button>
                <button
                  onClick={handleOpenAutoOrder}
                  className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold px-3 py-2 rounded-xl border border-blue-500/20 transition-colors text-sm"
                  title="Criar pedidos de compra automáticos para produtos com fornecedor"
                >
                  <ClipboardList size={16} /> Criar Pedidos Automáticos
                </button>
              </>
            )}
          </div>
        )}

        {enableExpiryControl && (
          <button
            onClick={() => {
              setIsExpiryModalOpen(true);
              if (!loadingExpiry && expiringLots.length === 0) {
                setLoadingExpiry(true);
                api.get(`/products/lots/expiring?days=365`)
                  .then(res => {
                    const allLots: any[] = res.data || [];
                    setExpiringLots(allLots);
                    setExpiredCount(allLots.filter(l => l.isExpired).length);
                    setExpiryAlertCount(allLots.filter(l => !l.isExpired).length);
                  })
                  .catch(console.error)
                  .finally(() => setLoadingExpiry(false));
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition font-semibold text-sm whitespace-nowrap relative ${
              expiredCount > 0
                ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25'
                : expiryAlertCount > 0
                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
                : 'text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent'
            }`}
          >
            {expiredCount > 0 ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
            Validades
            {(expiredCount + expiryAlertCount) > 0 && (
              <span className={`absolute -top-1.5 -right-1.5 text-[10px] font-black rounded-full w-4.5 h-4.5 flex items-center justify-center px-1 py-0.5 ${
                expiredCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-zinc-900'
              }`}>
                {expiredCount + expiryAlertCount}
              </span>
            )}
          </button>
        )}
      </div>

      {lowStockProducts.length > 0 && showLowStockAlert && (
        <div className="mt-3 bg-red-500/10 border-l-4 border-l-red-500 p-5 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              <h3 className="text-red-400 font-bold text-lg mb-1 flex items-center gap-2">
                Alerta Crítico: Reposição Necessária
              </h3>
              <p className="text-red-400/80 text-sm mb-3">
                Foram detectados <strong>{lowStockProducts.length}</strong> produtos com estoque abaixo do mínimo configurado.
                {lowStockProducts.filter(p => p.supplierProducts && p.supplierProducts.length > 0).length > 0 && (
                  <span className="text-blue-400/80 ml-1">
                    {lowStockProducts.filter(p => p.supplierProducts && p.supplierProducts.length > 0).length} com fornecedor vinculado (apto para pedido automático).
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {lowStockProducts.map(p => {
                  const hasSupplier = p.supplierProducts && p.supplierProducts.length > 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSearch(p.name)}
                      title={hasSupplier ? 'Clique para filtrar — tem fornecedor' : 'Clique para filtrar — sem fornecedor'}
                      className={`border px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 active:scale-95 ${
                        hasSupplier
                          ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border-blue-500/30'
                          : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30'
                      }`}
                    >
                      {p.name} <span className="bg-red-500/40 text-white px-1.5 py-0.5 rounded text-xs">{Math.round(Number(p.stock))}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      {/* Cards KPI */}
      <div className={`grid grid-cols-2 ${isStockist ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-3 md:gap-4`}>
        <div className="bg-zinc-900 border border-zinc-800 p-4 md:p-5 rounded-2xl flex flex-col justify-center">
          <div className="text-zinc-400 font-medium text-xs md:text-sm flex items-center gap-2 mb-2"><Package size={16}/> SKUs / Físico</div>
          <div className="text-xl md:text-2xl font-black text-white">{totalVarieties.toLocaleString('pt-BR')} <span className="text-xs md:text-sm font-medium text-zinc-500">tipos</span> / {Math.round(totalItemsCount).toLocaleString('pt-BR')} <span className="text-xs md:text-sm font-medium text-zinc-500">unid.</span></div>
        </div>
        {!isStockist && (
          <>
            <div className="bg-zinc-900 border border-zinc-800 p-4 md:p-5 rounded-2xl flex flex-col justify-center border-b-4 border-b-rose-500/50">
              <div className="text-zinc-400 font-medium text-xs md:text-sm flex items-center gap-2 mb-2"><BarChart3 size={16} className="text-rose-400"/> <span className="hidden sm:inline">Custo Imobilizado</span><span className="sm:hidden">Custo</span></div>
              <div className="text-xl md:text-2xl font-black text-rose-400 truncate">{totalCostValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-4 md:p-5 rounded-2xl flex flex-col justify-center border-b-4 border-b-blue-500/50">
              <div className="text-zinc-400 font-medium text-xs md:text-sm flex items-center gap-2 mb-2"><DollarSign size={16} className="text-blue-400"/> <span className="hidden sm:inline">Valor Bruto de Venda</span><span className="sm:hidden">Varejo</span></div>
              <div className="text-xl md:text-2xl font-black text-blue-400 truncate">{totalGrossValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 p-4 md:p-5 rounded-2xl flex flex-col justify-center border-b-4 border-b-emerald-500/50">
              <div className="text-zinc-400 font-medium text-xs md:text-sm flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-emerald-400"/> Lucro Projetado</div>
              <div className="text-xl md:text-2xl font-black text-emerald-400 truncate">{expectedProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
          </>
        )}
      </div>

      {/* Busca + Filtros + Configurações do Estoque */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-3.5 md:p-4 border-b border-zinc-800 bg-zinc-900/60">
          
          {/* Barra Principal (1 Linha Proporcional no Desktop / 2 Linhas no Mobile) */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 sm:gap-3">
            
            {/* Input de Busca */}
            <div className="relative flex-1 min-w-0 md:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Buscar por nome, código ou EAN..."
                className="w-full pl-9 pr-8 py-2 bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Grupo de Filtros (2 colunas no mobile, larguras elegantes no desktop) */}
            <div className="grid grid-cols-2 md:flex md:items-center gap-2 sm:gap-3">
              <div className="relative md:w-52">
                <select
                  value={selectedCategory}
                  onChange={e => {
                    setSelectedCategory(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-300 focus:outline-none focus:border-blue-500 transition cursor-pointer appearance-none truncate"
                >
                  <option value="">📁 Todas Categorias</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative md:w-44">
                <select
                  value={statusFilter}
                  onChange={e => {
                    setStatusFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-300 focus:outline-none focus:border-blue-500 transition cursor-pointer appearance-none truncate font-medium"
                >
                  <option value="active">🟢 Ativos ({products.filter(p => p.active !== false).length})</option>
                  <option value="inactive">⚪ Inativos ({products.filter(p => p.active === false).length})</option>
                  <option value="all">📋 Todos ({products.length})</option>
                </select>
              </div>
            </div>

            {/* Botão Regras + Contador (lado direito no desktop) */}
            <div className="flex items-center justify-between md:justify-end gap-3 md:ml-auto">
              <div className="text-xs text-zinc-500 font-medium">
                Exibindo <strong className="text-zinc-300">{displayedProducts.length}</strong> de <strong className="text-zinc-300">{products.length}</strong>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowStockSettings(!showStockSettings)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 shadow-sm ${
                    showStockSettings
                      ? 'bg-blue-600 border-blue-500 text-white shadow-blue-600/20'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800/80'
                  }`}
                  title="Configurações e Regras de Estoque"
                >
                  <SlidersHorizontal size={14} />
                  <span>Regras</span>
                  {showStockSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>

          </div>

          {/* Painel Retrátil de Regras do Estoque (Accordion Suave) */}
          {isAdmin && showStockSettings && (
            <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Toggle Vender sem Estoque */}
              <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                allowNegativeStock ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-950/70 border-zinc-800'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert size={16} className={allowNegativeStock ? 'text-amber-400' : 'text-zinc-500'} />
                  <span className={`text-xs font-bold truncate ${allowNegativeStock ? 'text-amber-400' : 'text-zinc-400'}`}>
                    Vender sem estoque
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleNegativeStock(!allowNegativeStock)}
                  disabled={savingSettings}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                    allowNegativeStock ? 'bg-amber-500' : 'bg-zinc-700'
                  } ${savingSettings ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    allowNegativeStock ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Toggle Controle de Validade */}
              <div className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition-all ${
                enableExpiryControl ? 'bg-blue-500/10 border-blue-500/30' : 'bg-zinc-950/70 border-zinc-800'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarClock size={16} className={enableExpiryControl ? 'text-blue-400' : 'text-zinc-500'} />
                  <span className={`text-xs font-bold truncate ${enableExpiryControl ? 'text-blue-400' : 'text-zinc-400'}`}>
                    Controle Validade
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {enableExpiryControl && (
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={expiryAlertDaysInput}
                      onChange={(e) => setExpiryAlertDaysInput(e.target.value)}
                      onBlur={handleSaveExpiryDays}
                      className="w-10 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-[11px] text-center text-white focus:outline-none focus:border-blue-500 hide-arrows"
                      title="Dias antes do vencimento"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleExpiryControl(!enableExpiryControl)}
                    disabled={savingExpirySettings}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                      enableExpiryControl ? 'bg-blue-500' : 'bg-zinc-700'
                    } ${savingExpirySettings ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      enableExpiryControl ? 'translate-x-4' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Alerta de Reposição Padrão */}
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-zinc-950/70 border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertOctagon size={16} className="text-red-400 shrink-0" />
                  <span className="text-xs font-bold text-zinc-400 truncate">
                    Alerta Reposição
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={lowStockAlertInput}
                    onChange={e => setLowStockAlertInput(e.target.value)}
                    onBlur={handleSaveLowStockAlert}
                    disabled={savingLowStockAlert}
                    className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-center text-white font-bold focus:outline-none focus:border-red-500 hide-arrows disabled:opacity-50"
                  />
                  <span className="text-[11px] text-zinc-500">un.</span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Tabela de Produtos (Desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950 text-zinc-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Produto</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Fornecedores</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Atalho</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Cód. Barras</th>
                {!isStockist && <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Custo</th>}
                {!isStockist && <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Varejo</th>}
                {!isStockist && <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">% Lucro</th>}
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Status</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Físico</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {displayedProducts.map(product => (
                <tr key={product.id} className={`hover:bg-zinc-800/40 transition-colors ${product.active === false ? 'opacity-40 grayscale' : ''}`}>
                  <td className="px-6 py-5 font-medium text-zinc-200">
                    <div className="flex items-center gap-3">
                      {product.imageUrl && (
                        <div className="w-10 h-10 shrink-0 bg-white rounded-lg flex items-center justify-center p-1 shadow-inner">
                          <img src={product.imageUrl} alt="" className="w-full h-full object-contain mix-blend-multiply" loading="lazy" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{product.name}</span>
                          {product.active === false && (
                            <span className="text-[10px] uppercase font-black tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded-md shadow-sm">
                              Inativo
                            </span>
                          )}
                        </div>
                        {nfceModuleEnabled && (!product.ncm || !product.grupoTributacaoId) && (
                          <span className="flex items-center gap-1 text-[10px] text-yellow-500/80 uppercase font-bold mt-1" title="Faltam dados fiscais para emitir NFC-e">
                            <AlertOctagon size={12} /> Faltam Dados Fiscais
                          </span>
                        )}
                        {nfceModuleEnabled && (product.ncm && product.grupoTributacaoId) && (
                          <span className="text-[10px] text-indigo-400/80 uppercase font-bold mt-1" title="Pronto para NFC-e">
                            {product.grupoTributacao?.nome || 'Fiscal OK'}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <SupplierSelector
                      product={product}
                      suppliers={suppliers}
                      onToggle={(supplierId, isLinked) => handleToggleSupplier(product.id, supplierId, isLinked)}
                    />
                  </td>
                  <td className="px-6 py-5 text-center">
                    {product.shortCode ? (
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md font-black text-sm">{product.shortCode}</span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-5 text-zinc-500 text-sm font-mono">
                    {product.barcode || 'Sem Cód.'}
                  </td>
                  {!isStockist && (
                    <td className="px-6 py-5 text-rose-400/80 font-medium text-right">
                      R$ {product.priceCost ? Number(product.priceCost).toFixed(2) : '0.00'}
                    </td>
                  )}
                  {!isStockist && (
                    <td className="px-6 py-5 text-emerald-400 font-bold text-right">
                      R$ {Number(product.priceSell).toFixed(2)}
                    </td>
                  )}
                  {!isStockist && (
                    <td className="px-6 py-5 text-amber-400 font-bold text-center">
                      {Number(product.priceSell) > 0 ? (((Number(product.priceSell) - Number(product.priceCost)) / Number(product.priceSell)) * 100).toFixed(1) + '%' : '0.0%'}
                    </td>
                  )}
                  <td className="px-6 py-5 text-center">
                    <button
                      onClick={() => handleToggleActive(product.id, product.active !== false)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${product.active !== false ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                      title={product.active !== false ? 'Clique para Inativar' : 'Clique para Ativar'}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${product.active !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <button
                      onClick={() => handleOpenLotsModal(product)}
                      className="group/lots flex items-center gap-1.5 mx-auto cursor-pointer focus:outline-none"
                      title="Ver Detalhamento de Lotes"
                    >
                      <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded text-sm font-bold border transition-colors ${Number(product.stock) <= 0 ? 'bg-red-500/10 text-red-500 border-red-500/20 group-hover/lots:bg-red-500/20' : Number(product.stock) <= 10 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover/lots:bg-amber-500/20' : 'bg-zinc-800 text-zinc-300 border-zinc-700 group-hover/lots:bg-zinc-750'}`}>
                        {Math.round(Number(product.stock))}
                      </span>
                    </button>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors inline-block"
                      title="Editar Produto"
                    >
                      <Edit3 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards de Produtos (Mobile) */}
        <div className="md:hidden flex flex-col gap-4 mb-4">
          {displayedProducts.map(product => {
            const cost = Number(product.priceCost) || 0;
            const sell = Number(product.priceSell) || 0;
            const profit = sell - cost;
            const margin = sell > 0 ? (profit / sell) * 100 : 0;
            const isProfit = profit >= 0;

            return (
              <div key={product.id} className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-lg relative ${product.active === false ? 'opacity-60 grayscale' : ''}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    {product.imageUrl ? (
                      <div className="w-14 h-14 shrink-0 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-inner">
                        <img src={product.imageUrl} alt="" className="w-full h-full object-contain mix-blend-multiply" loading="lazy" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700">
                        <Package size={24} className="text-zinc-500" />
                      </div>
                    )}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2 pr-2">
                        <div className="font-bold text-white text-base leading-tight line-clamp-2">{product.name}</div>
                        {product.active === false && (
                          <span className="shrink-0 text-[9px] uppercase font-black tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded shadow-sm">
                            Inativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-zinc-500 mt-1 truncate">{product.barcode || 'Sem cód. barras'}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {product.shortCode && (
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                            Atalho: {product.shortCode}
                          </span>
                        )}
                        {nfceModuleEnabled && (!product.ncm || !product.grupoTributacaoId) ? (
                          <span className="bg-yellow-500/10 text-yellow-500/90 border border-yellow-500/20 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"><AlertOctagon size={10}/> Faltam Dados</span>
                        ) : nfceModuleEnabled && (product.ncm && product.grupoTributacaoId) ? (
                          <span className="bg-indigo-500/10 text-indigo-400/90 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[10px] font-bold truncate">{product.grupoTributacao?.nome || 'Fiscal OK'}</span>
                        ) : null}

                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="p-1.5 text-zinc-400 hover:text-blue-400 bg-zinc-800 active:bg-blue-500/15 rounded-lg transition-colors border border-zinc-700 shadow-sm"
                      title="Editar Produto"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleActive(product.id, product.active !== false)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none shadow-inner ${product.active !== false ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${product.active !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                {/* Preços e Margem */}
                {!isStockist && (
                <div className="bg-zinc-950/80 rounded-xl border border-zinc-800 p-3 mt-1 grid grid-cols-2 gap-y-3 gap-x-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Custo</span>
                    <span className="text-zinc-300 font-semibold">R$ {cost.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Varejo</span>
                    <span className="text-emerald-400 font-bold text-lg leading-none mt-0.5">R$ {sell.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col col-span-2 pt-2 border-t border-zinc-800/80">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Lucro Estimado</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                          R$ {profit.toFixed(2)}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${isProfit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Ações e Estoque */}
                <div className="flex justify-between items-center mt-1 gap-2">
                  <div className="flex items-center bg-zinc-950/50 rounded-lg border border-zinc-800/80 p-1.5 flex-1 min-w-0">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mx-2">Forn:</span>
                    <div className="flex-1 min-w-0 flex justify-end">
                      <SupplierSelector
                        product={product}
                        suppliers={suppliers}
                        onToggle={(supplierId, isLinked) => handleToggleSupplier(product.id, supplierId, isLinked)}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenLotsModal(product)}
                    className={`flex items-center justify-center min-w-[4rem] px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer shadow-sm ${Number(product.stock) <= 0 ? 'bg-red-500/15 text-red-400 border-red-500/30 active:bg-red-500/30' : Number(product.stock) <= 10 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 active:bg-amber-500/30' : 'bg-zinc-800 text-zinc-200 border-zinc-700 active:bg-zinc-700'}`}
                    title="Ver detalhes de lotes físicos e virtuais"
                  >
                    <span className="text-[10px] uppercase tracking-wider opacity-60 mr-1.5">Qtd</span>
                    <span className="text-base leading-none">{Math.round(Number(product.stock))}</span>
                  </button>
                </div>
              </div>
            );
          })}
          {displayedProducts.length === 0 && (
            <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-2xl">
              Nenhum produto encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6 pb-6">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition border border-zinc-700"
          >
            Anterior
          </button>
          <span className="text-zinc-400 text-sm font-medium">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition border border-zinc-700"
          >
            Próxima
          </button>
        </div>
      )}

      <AddProductModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={fetchProducts} />
      <EditProductModal product={editingProduct} isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} onSuccess={fetchProducts} />

      {/* Modal de Detalhamento de Lotes (FIFO) */}
      {lotModalProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
          <div className="bg-zinc-950 border border-zinc-800 rounded-[2rem] w-full max-w-2xl shadow-[0_0_80px_rgba(59,130,246,0.08)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Rastreamento de Lotes PEPS</h3>
                <p className="text-zinc-400 text-xs mt-1">{lotModalProduct.name}</p>
              </div>
              <button
                onClick={() => setLotModalProduct(null)}
                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              {loadingLots ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                </div>
              ) : productLots.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  Nenhum lote registrado para este produto.
                </div>
              ) : (
                <div className="space-y-3">
                  {productLots.map((lot) => {
                    const isExhausted = Number(lot.remaining) <= 0;
                    const isNegative = Number(lot.remaining) < 0;

                    return (
                      <div
                        key={lot.id}
                        className={`p-4 border rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition-colors ${
                          isNegative
                            ? 'bg-red-500/5 border-red-500/20'
                            : isExhausted
                            ? 'bg-zinc-900/40 border-zinc-800/80 opacity-50'
                            : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-zinc-400 font-bold bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                              Lote: {lot.lotNumber || lot.id.split('-')[0].toUpperCase()}
                            </span>
                            {lot.supplier && (
                              <span className="text-[10px] bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 px-1.5 py-0.5 rounded">
                                {lot.supplier.name}
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">
                              {new Date(lot.createdAt).toLocaleString('pt-BR')}
                            </span>
                            
                            {/* BADGE DE VALIDADE */}
                            {editingLotId === lot.id ? (
                              <div className="flex items-center gap-1">
                                <input 
                                  type="date" 
                                  value={editLotDate} 
                                  onChange={(e) => setEditLotDate(e.target.value)}
                                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-emerald-500"
                                />
                                <button onClick={() => handleUpdateLotDate(lot.id)} className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded"><Check size={12} /></button>
                                <button onClick={() => setEditingLotId(null)} className="p-1 hover:bg-red-500/20 text-red-400 rounded"><X size={12} /></button>
                              </div>
                            ) : lot.expiresAt ? (
                              <div 
                                onClick={() => { setEditingLotId(lot.id); setEditLotDate(new Date(lot.expiresAt).toISOString().split('T')[0]); }}
                                className={`cursor-pointer flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border hover:brightness-125 transition-all ${
                                lot.isExpired 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/30' 
                                  : lot.daysUntilExpiry !== null && lot.daysUntilExpiry <= expiryAlertDays
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              }`}>
                                {lot.isExpired ? <AlertTriangle size={10} /> : <CalendarClock size={10} />}
                                {lot.isExpired 
                                  ? 'VENCIDO' 
                                  : lot.daysUntilExpiry !== null && lot.daysUntilExpiry <= expiryAlertDays
                                  ? `Vence em ${lot.daysUntilExpiry}d`
                                  : `Validade: ${new Date(lot.expiresAt).toLocaleDateString('pt-BR')}`
                                }
                              </div>
                            ) : (
                              <div 
                                onClick={() => { setEditingLotId(lot.id); setEditLotDate(''); }}
                                className="cursor-pointer flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:brightness-125 transition-all"
                              >
                                <CalendarClock size={10} /> Inserir Validade
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-zinc-300 mt-1">
                            Custo de Aquisição: <strong className="text-rose-400 font-extrabold ml-1">R$ {Number(lot.costPrice).toFixed(2)}</strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 self-end sm:self-auto">
                          <div className="text-right">
                            <div className="text-xs text-zinc-500">Saldo/Original</div>
                            <div className="font-bold text-sm text-zinc-300">
                              <span className={isNegative ? 'text-red-400' : isExhausted ? 'text-zinc-500' : 'text-emerald-400 font-extrabold'}>
                                {Number(lot.remaining).toFixed(0)}
                              </span>{' '}
                              / {Number(lot.quantity).toFixed(0)} UN
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] uppercase font-bold tracking-wider border ${
                              isNegative
                                ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                : isExhausted
                                ? 'bg-zinc-800 text-zinc-500 border-zinc-750'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}
                          >
                            {isNegative ? 'Estorno/Negativo' : isExhausted ? 'Esgotado' : 'Ativo'}
                          </span>
                          {!isNegative && !isExhausted && Number(lot.remaining) > 1 && (
                            <button
                              onClick={() => { setSplittingLot(lot); setSplitQty(''); setSplitDate(lot.expiresAt ? new Date(lot.expiresAt).toISOString().split('T')[0] : ''); }}
                              title="Dividir Lote"
                              className="p-1.5 bg-zinc-800/80 hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400 border border-zinc-700/50 hover:border-blue-500/50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Split size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 flex flex-col gap-3">
              {/* Formulário de Registro de Lote — aparece ao clicar no botão */}
              {isRegisterLotOpen && (() => {
                const totalLotRemaining = productLots.reduce((acc, lot) => acc + Number(lot.remaining), 0);
                const unassignedStock = Math.max(0, Number(lotModalProduct?.stock || 0) - totalLotRemaining);
                return (
                <form onSubmit={handleRegisterLot} className="bg-zinc-950 border border-emerald-500/20 rounded-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2 mb-1">
                    <PackagePlus size={16} className="text-emerald-400" />
                    <span className="text-sm font-bold text-white">Registrar Lote no Estoque Atual</span>
                    <span className="text-[10px] text-zinc-500 ml-auto hidden sm:inline">Disponível: {unassignedStock} un</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Quantidade <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="0.001"
                        max={unassignedStock}
                        step="any"
                        required
                        autoFocus
                        value={registerLotQty}
                        onChange={e => setRegisterLotQty(e.target.value)}
                        placeholder={`Ex: ${Math.max(1, Math.round(unassignedStock))}`}
                        className="bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white text-sm outline-none transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Data de Validade</label>
                      <input
                        type="date"
                        value={registerLotExpiry}
                        onChange={e => setRegisterLotExpiry(e.target.value)}
                        className="bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white text-sm outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Número do Lote (opcional)</label>
                    <input
                      type="text"
                      value={registerLotNumber}
                      onChange={e => setRegisterLotNumber(e.target.value)}
                      placeholder="Ex: L2025-07-001"
                      className="bg-zinc-900 border border-zinc-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-white text-sm outline-none transition-colors"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsRegisterLotOpen(false)}
                      className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold rounded-xl text-sm transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isRegisteringLot || !registerLotQty || Number(registerLotQty) <= 0 || Number(registerLotQty) > unassignedStock}
                      className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {isRegisteringLot ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
                      Registrar Lote
                    </button>
                  </div>
                </form>
                );
              })()}

              <div className="flex justify-between items-center gap-3">
                {!isRegisterLotOpen && (
                  <button
                    onClick={() => setIsRegisterLotOpen(true)}
                    className="px-4 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 font-bold rounded-xl text-sm transition-colors border border-emerald-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <PackagePlus size={16} /> Registrar Lote Atual
                  </button>
                )}
                <button
                  onClick={() => setLotModalProduct(null)}
                  className="ml-auto px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Fechar Detalhes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Divisão de Lote */}
      {splittingLot && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden p-6 animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Split size={20} className="text-blue-400" /> Dividir Lote
            </h3>
            <p className="text-sm text-zinc-400 mb-6">Lote: {splittingLot.lotNumber || splittingLot.id.split('-')[0].toUpperCase()}</p>
            
            <form onSubmit={handleSplitLot} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Qtd. a Separar (Máx: {(Number(splittingLot.remaining) - 0.001).toFixed(0)})</label>
                <input 
                  type="number" 
                  step="any"
                  max={Number(splittingLot.remaining) - 0.001}
                  required
                  value={splitQty}
                  onChange={e => setSplitQty(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Nova Validade (opcional)</label>
                <input 
                  type="date" 
                  value={splitDate}
                  onChange={e => setSplitDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setSplittingLot(null)} className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer">Cancelar</button>
                <button type="submit" disabled={isSplitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer">
                  {isSplitting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Revisão de Pedido Automático */}
      {isAutoOrderOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <ClipboardList size={22} className="text-blue-400" /> Revisão de Pedidos Automáticos
                </h3>
                <p className="text-zinc-400 text-xs mt-1">Revise os itens, ajuste quantidades e escolha o fornecedor antes de criar os pedidos.</p>
              </div>
              <button onClick={() => setIsAutoOrderOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {/* Summary by supplier */}
              {(() => {
                const grouped = autoOrderRows.reduce((acc: Record<string, any[]>, r) => {
                  const sup = suppliers.find(s => s.id === r.selectedSupplierId);
                  const key = sup?.name || r.selectedSupplierId;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(r);
                  return acc;
                }, {});
                return (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="text-xs text-zinc-500 self-center">Pedidos que serão criados:</span>
                    {Object.entries(grouped).map(([supplierName, rows]) => (
                      <span key={supplierName} className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold px-2 py-1 rounded-lg">
                        {supplierName} ({rows.filter(r => r.included).length} itens)
                      </span>
                    ))}
                  </div>
                );
              })()}

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs uppercase border-b border-zinc-800">
                    <th className="text-left py-2 px-2">✓</th>
                    <th className="text-left py-2 px-2">Produto</th>
                    <th className="text-center py-2 px-2">Estoque Atual</th>
                    <th className="text-center py-2 px-2">Mínimo</th>
                    <th className="text-center py-2 px-2">Qtd. Pedido</th>
                    <th className="text-left py-2 px-2">Fornecedor</th>
                    <th className="text-right py-2 px-2">Custo Unit.</th>
                    <th className="text-right py-2 px-2">Custo Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {autoOrderRows.map((row, idx) => (
                    <tr key={row.productId} className={`transition-colors ${row.included ? '' : 'opacity-40'}`}>
                      <td className="py-3 px-2">
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={e => {
                            const updated = [...autoOrderRows];
                            updated[idx] = { ...updated[idx], included: e.target.checked };
                            setAutoOrderRows(updated);
                          }}
                          className="w-4 h-4 accent-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-2 text-zinc-200 font-medium">{row.productName}</td>
                      <td className="py-3 px-2 text-center">
                        <span className="text-red-400 font-bold">{row.stock}</span>
                      </td>
                      <td className="py-3 px-2 text-center text-zinc-400">{row.minStock}</td>
                      <td className="py-3 px-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={row.qty}
                          onChange={e => {
                            const updated = [...autoOrderRows];
                            updated[idx] = { ...updated[idx], qty: Number(e.target.value) || 1 };
                            setAutoOrderRows(updated);
                          }}
                          className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-center text-white focus:outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="py-3 px-2">
                        {row.supplierProducts && row.supplierProducts.length > 1 ? (
                          <select
                            value={row.selectedSupplierId}
                            onChange={e => {
                              const updated = [...autoOrderRows];
                              updated[idx] = { ...updated[idx], selectedSupplierId: e.target.value };
                              setAutoOrderRows(updated);
                            }}
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                          >
                            {row.supplierProducts.map((sp: any) => {
                              const sup = suppliers.find(s => s.id === sp.supplierId);
                              return <option key={sp.supplierId} value={sp.supplierId}>{sup?.name || sp.supplierId}</option>;
                            })}
                          </select>
                        ) : (
                          <span className="text-zinc-300 text-xs">
                            {suppliers.find(s => s.id === row.selectedSupplierId)?.name || '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-400 text-xs">R$ {row.priceCost.toFixed(2)}</td>
                      <td className="py-3 px-2 text-right text-emerald-400 font-bold text-xs">
                        R$ {(row.qty * row.priceCost).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-700">
                    <td colSpan={7} className="py-3 px-2 text-right text-sm font-bold text-zinc-300">Total Estimado do Pedido:</td>
                    <td className="py-3 px-2 text-right text-emerald-400 font-black">
                      R$ {autoOrderRows.filter(r => r.included).reduce((acc, r) => acc + r.qty * r.priceCost, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {autoOrderRows.filter(r => r.included).length === 0 && (
                <p className="text-center text-zinc-500 text-sm mt-4">Nenhum item selecionado.</p>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
              <p className="text-xs text-zinc-500">
                {autoOrderRows.filter(r => r.included).length} de {autoOrderRows.length} itens selecionados. Os pedidos serão criados como <strong className="text-zinc-300">Rascunho</strong>.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setIsAutoOrderOpen(false)} className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmAutoOrders}
                  disabled={isCreatingOrders || autoOrderRows.filter(r => r.included).length === 0}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingOrders ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
                  {isCreatingOrders ? 'Criando...' : 'Confirmar e Criar Pedidos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Validades no PDV */}
      {isExpiryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setIsExpiryModalOpen(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85dvh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header do modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                {expiredCount > 0
                  ? <AlertTriangle size={22} className="text-red-400" />
                  : <CalendarClock size={22} className="text-blue-400" />
                }
                <div>
                  <h2 className="text-lg font-black text-white">Controle de Validades</h2>
                  <p className="text-xs text-zinc-500">
                    Alerta para lotes que vencem em ate {expiryAlertDays} dias
                  </p>
                </div>
              </div>
              <button onClick={() => setIsExpiryModalOpen(false)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition">
                <X size={20} />
              </button>
            </div>

            {/* Resumo */}
            {(expiredCount > 0 || expiryAlertCount > 0) && (
              <div className="flex gap-3 px-6 py-3 border-b border-zinc-800">
                {expiredCount > 0 && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-xl">
                    <AlertTriangle size={13} className="text-red-400" />
                    <span className="text-red-400 text-xs font-bold">{expiredCount} vencido(s)</span>
                  </div>
                )}
                {expiryAlertCount > 0 && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                    <CalendarClock size={13} className="text-amber-400" />
                    <span className="text-amber-400 text-xs font-bold">{expiryAlertCount} vencendo em breve</span>
                  </div>
                )}
              </div>
            )}

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingExpiry ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-blue-400" size={32} />
                </div>
              ) : expiringLots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                  <PackageOpen size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">Nenhum lote com validade proxima.</p>
                </div>
              ) : (
                expiringLots.map(lot => {
                  const days = lot.daysUntilExpiry;
                  const isExp = lot.isExpired || days < 0;
                  const isWarn = !isExp && days !== null && days <= expiryAlertDays;
                  return (
                    <div key={lot.id} className={`flex items-center gap-3 p-3 rounded-xl border ${ isExp ? 'bg-red-500/5 border-red-500/20' : isWarn ? 'bg-amber-500/5 border-amber-500/20' : 'bg-zinc-900/60 border-zinc-800'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{lot.productName}</p>
                        <p className="text-xs text-zinc-500">
                          {lot.lotNumber ? `Lote: ${lot.lotNumber}` : ''} {lot.supplierName ? `• ${lot.supplierName}` : ''}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Restante: <strong className="text-zinc-300">{Number(lot.remaining).toFixed(0)} {lot.productUnit}</strong>
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shrink-0 ${ isExp ? 'bg-red-500/10 border-red-500/30 text-red-400' : isWarn ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                        {isExp ? <AlertTriangle size={12} /> : <CalendarClock size={12} />}
                        <div className="text-[11px] font-bold leading-tight text-right">
                          <div>{isExp ? `Vencido` : `${days}d`}</div>
                          <div className="opacity-60 font-normal">{lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('pt-BR') : ''}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-800 flex justify-end">
              <button onClick={() => setIsExpiryModalOpen(false)} className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
