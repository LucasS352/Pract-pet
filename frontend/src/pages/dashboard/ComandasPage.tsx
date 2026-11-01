import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { getComandaItemAttempt, clearComandaItemAttempt } from '@/lib/comanda-item-attempt';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { syncLoadedComanda } from '@/lib/comanda-cart';
import { useAuthStore } from '@/store/auth';
import { 
  User, Search, Plus, Trash2, CheckCircle2, AlertCircle, 
  ChevronRight, Calendar, DollarSign, X, Loader2, ArrowLeft, RefreshCw,
  UtensilsCrossed, Printer, ShoppingBag, Receipt, Clock, KeyRound
} from 'lucide-react';
import { CompositeModifierModal } from '@/components/CompositeModifierModal';


interface OperatorConsumption {
  id: string;
  name: string;
  jobTitle?: string | null;
  pendingBalance: number;
}

interface ConsumptionItem {
  id: string;
  name: string;
  quantity: number;
  priceUnit: number;
  subtotal: number;
  settled?: boolean;
  settledAt?: string | null;
}

interface ConsumptionRecord {
  id: string;
  saleId: string;
  total: number;
  settled: boolean;
  settledAt: string | null;
  createdAt: string;
  items: ConsumptionItem[];
}

interface Product {
  id: string;
  name: string;
  priceSell: number;
  stock: number;
  barcode?: string | null;
  shortCode?: string | null;
  active: boolean;
  isComposite?: boolean;
  modifierGroups?: Array<{
    id: string;
    name: string;
    minSelected: number;
    maxSelected: number;
    options: Array<{
      id: string;
      name: string;
      componentProductId: string;
      quantity: number;
      priceAdjustment: number;
    }>;
  }>;
}


interface ComandaItem {
  id: string;
  comandaId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
  status?: 'active' | 'removed' | 'cancelled';
  removalReason?: string | null;
  createdAt: string;
  product?: Product;
}

interface Comanda {
  id: string;
  number: string;
  customerName?: string | null;
  status: 'open' | 'closed' | 'cancelled';
  total: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: ComandaItem[];
  responsibleWaiter?: { id: string; name: string; jobTitle?: string | null } | null;
}

export function ComandasPage() {
  const navigate = useNavigate();
  const { clearCart, addItem, setActiveComanda } = useCartStore();
  const token = useAuthStore((state) => state.token);
  const [isComandasEnabled, setIsComandasEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    setIsComandasEnabled(false);
    if (token) {
      api.get('/tenants/me').then(({ data }) => {
        const modules = typeof data.modulos === 'string' ? JSON.parse(data.modulos) : data.modulos;
        if (active) {
          const enabled = modules?.comandas === true;
          setIsComandasEnabled(enabled);
          setActiveTab(enabled ? 'cliente' : 'funcionario');
        }
      }).catch(() => {
        if (active) toast.error('Não foi possível consultar os módulos da loja.');
      });
    }
    return () => { active = false; };
  }, [token]);
  const [activeTab, setActiveTab] = useState<'cliente' | 'funcionario'>(() => isComandasEnabled ? 'cliente' : 'funcionario');

  useEffect(() => {
    if (!isComandasEnabled) {
      setActiveTab('funcionario');
    }
  }, [isComandasEnabled]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // ── ESTADOS DE COMANDAS DE CLIENTES ───────────────────────────────────────
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loadingComandas, setLoadingComandas] = useState(true);
  const [comandaSearch, setComandaSearch] = useState('');
  const [comandaStatusFilter, setComandaStatusFilter] = useState<'open' | 'cancelled'>('open');
  
  // Modal de Nova Comanda
  const [isNewComandaModalOpen, setIsNewComandaModalOpen] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creatingComanda, setCreatingComanda] = useState(false);

  // Modal de Detalhes / Lançamento de Itens
  const [selectedComanda, setSelectedComanda] = useState<Comanda | null>(null);
  const [addingProductId, setAddingProductId] = useState('');
  const [addingQuantity, setAddingQuantity] = useState(1);
  const [addingItem, setAddingItem] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  // Produto composto aguardando seleção de modificadores para lançamento em comanda
  const [compositeProductForComanda, setCompositeProductForComanda] = useState<Product | null>(null);
  const [sensitiveAction, setSensitiveAction] = useState<{ type: 'remove_item' | 'cancel_comanda'; item?: ComandaItem } | null>(null);
  const [sensitivePin, setSensitivePin] = useState('');
  const [sensitiveReason, setSensitiveReason] = useState('');
  const [sensitiveLoading, setSensitiveLoading] = useState(false);


  // ── ESTADOS DE CONSUMO DE FUNCIONÁRIOS ────────────────────────────────────
  const [operators, setOperators] = useState<OperatorConsumption[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(true);
  const [operatorSearch, setOperatorSearch] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<OperatorConsumption | null>(null);
  const [history, setHistory] = useState<ConsumptionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showOnlyPending, setShowOnlyPending] = useState(true);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedItemsToSettle, setSelectedItemsToSettle] = useState<string[]>([]);
  const [settling, setSettling] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [launchProductId, setLaunchProductId] = useState('');
  const [launchQuantity, setLaunchQuantity] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState('');
  const [partialSettleAmount, setPartialSettleAmount] = useState('');

  // Fetch Comandas
  const fetchComandas = async () => {
    setLoadingComandas(true);
    try {
      const res = await api.get(`/v1/comandas?status=${comandaStatusFilter}`);
      setComandas(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar comandas.');
    } finally {
      setLoadingComandas(false);
    }
  };

  // Fetch Operators
  const fetchOperators = async (currentOpId?: string) => {
    setLoadingOperators(true);
    try {
      const res = await api.get('/operators/consumptions');
      const ops = res.data || [];
      setOperators(ops);

      const targetId = currentOpId || selectedOperator?.id;
      if (targetId) {
        const updatedOp = ops.find((o: any) => o.id === targetId);
        if (updatedOp) {
          setSelectedOperator(updatedOp);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOperators(false);
    }
  };

  // Fetch Products
  const fetchProducts = async () => {
    try {
      const res = await api.get('/products?limit=1000');
      setProducts(res.data?.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchComandas();
    fetchOperators();
    fetchProducts();
  }, [comandaStatusFilter]);

  // Recarregar detalhes da comanda selecionada
  const refreshSelectedComanda = async (id: string) => {
    try {
      const res = await api.get(`/v1/comandas/${id}`);
      setSelectedComanda(res.data);
      // Atualizar na lista geral também
      fetchComandas();
    } catch (err) {
      console.error(err);
    }
  };

  // Criar Comanda
  const handleCreateComanda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) {
      toast.error('Informe o número ou identificador da comanda.');
      return;
    }
    setCreatingComanda(true);
    try {
      const res = await api.post('/v1/comandas', {
        number: newNumber.trim(),
        customerName: newCustomer.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      toast.success(`Comanda #${res.data.number} aberta com sucesso!`);
      setNewNumber('');
      setNewCustomer('');
      setNewNotes('');
      setIsNewComandaModalOpen(false);
      fetchComandas();
      setSelectedComanda(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao criar comanda.';
      toast.error(msg);
    } finally {
      setCreatingComanda(false);
    }
  };

  // Adicionar Item a Comanda
  const handleAddItemToComanda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComanda) return;
    if (!addingProductId) {
      toast.error('Selecione um produto.');
      return;
    }

    const product = products.find(p => p.id === addingProductId);
    if (!product) {
      toast.error('Produto não encontrado.');
      return;
    }

    // Produto composto → abrir modal de seleção de adicionais
    if (product.isComposite && product.modifierGroups && product.modifierGroups.length > 0) {
      setCompositeProductForComanda(product);
      return;
    }

    // Produto simples → lançar direto
    await doAddItemToComanda(product, addingQuantity, []);
  };

  // Função interna que efetivamente lança o item (simples ou composto após modal)
  const doAddItemToComanda = async (
    product: Product,
    quantity: number,
    modifiers: Array<{ optionId: string }>,
  ) => {
    if (!selectedComanda) return;
    setAddingItem(true);
    try {
      const body = {
        items: [{
          productId: product.id,
          quantity,
          ...(modifiers.length > 0 ? { modifiers } : {}),
        }],
      };
      const attemptScope = `dashboard:${selectedComanda.id}`;
      const attemptKey = getComandaItemAttempt(attemptScope, body);
      await api.post(`/v1/comandas/${selectedComanda.id}/items`, body, { headers: { 'Idempotency-Key': attemptKey } });
      clearComandaItemAttempt(attemptScope);
      toast.success('Item adicionado à comanda!');
      setAddingProductId('');
      setAddingQuantity(1);
      setProductSearch('');
      refreshSelectedComanda(selectedComanda.id);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao adicionar item.';
      toast.error(msg);
    } finally {
      setAddingItem(false);
    }
  };



  // Remover Item da Comanda
  const submitSensitiveAction = async () => {
    if (!selectedComanda || !sensitiveAction) return;
    if (sensitivePin.length < 4) { toast.error('Informe o PIN de autorização.'); return; }
    if (sensitiveReason.trim().length < 3) { toast.error('Informe o motivo da ação.'); return; }
    setSensitiveLoading(true);
    try {
      const authorization = await api.post(`/v1/comandas/${selectedComanda.id}/authorize`, {
        action: sensitiveAction.type, itemId: sensitiveAction.item?.id, pin: sensitivePin,
      });
      const response = sensitiveAction.type === 'remove_item'
        ? await api.post(`/v1/comandas/${selectedComanda.id}/items/${sensitiveAction.item!.id}/remove`, { authorizationToken: authorization.data.authorizationToken, reason: sensitiveReason.trim() })
        : await api.post(`/v1/comandas/${selectedComanda.id}/cancel`, { authorizationToken: authorization.data.authorizationToken, reason: sensitiveReason.trim() });
      setSensitiveAction(null); setSensitivePin(''); setSensitiveReason('');
      if (sensitiveAction.type === 'cancel_comanda') {
        setSelectedComanda(response.data);
        toast.success('Comanda cancelada e preservada no histórico.');
      } else {
        setSelectedComanda(response.data);
        syncLoadedComanda(response.data);
        toast.success('Item removido com autorização.');
      }
      fetchComandas();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível concluir a ação protegida.');
    } finally {
      setSensitiveLoading(false);
    }
  };

  // Cobrar / Fechar Comanda -> Carrega no Carrinho do PDV
  const handleChargeComanda = (comanda: Comanda) => {
    if (!comanda.items?.some(item => !item.status || item.status === 'active')) {
      toast.error('A comanda não possui itens para cobrar.');
      return;
    }

    clearCart();
    setActiveComanda(comanda.id, comanda.number);

    syncLoadedComanda({ ...comanda, items: comanda.items || [] });

    toast.info(`Itens da Comanda #${comanda.number} carregados no caixa!`, { duration: 3000 });
    navigate('/dashboard');
  };

  // Extrato de Impressão da Comanda
  const handlePrintExtrato = (comanda: Comanda) => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;

    const itemsHtml = (comanda.items || []).map(i => `
      <tr>
        <td style="padding: 4px 0;">${i.quantity}x ${i.product?.name || 'Item'}</td>
        <td style="text-align: right; padding: 4px 0;">R$ ${Number(i.totalPrice).toFixed(2)}</td>
      </tr>
    `).join('');

    win.document.write(`
      <html>
        <head>
          <title>Extrato Comanda #${comanda.number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: 80mm auto; margin: 4mm 3mm; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 13px; font-weight: 600; width: 74mm; padding: 4px; margin: 0 auto; color: #000; background: #fff; line-height: 1.35; }
            h2 { text-align: center; margin: 0 0 6px 0; font-size: 16px; font-weight: bold; }
            p { margin: 2px 0; font-size: 11.5px; font-weight: normal; }
            hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 4px 0; }
            td { padding: 3px 0; }
            .total { font-size: 16.5px; font-weight: bold; text-align: right; margin-top: 6px; }
            .footer-note { text-align: center; margin-top: 12px; font-size: 11px; }
            @media print { html, body { width: 80mm; } }
          </style>
        </head>
        <body>
          <h2>EXTRATO DE CONSUMO</h2>
          <p style="text-align:center;">Comanda / Mesa: <strong>#${comanda.number}</strong></p>
          ${comanda.customerName ? `<p style="text-align:center;">Cliente: <strong>${comanda.customerName}</strong></p>` : ''}
          <p style="text-align:center;">Data: ${new Date(comanda.createdAt).toLocaleString('pt-BR')}</p>
          <hr />
          <table>
            <tbody>${itemsHtml}</tbody>
          </table>
          <hr />
          <div class="total">TOTAL: R$ ${Number(comanda.total).toFixed(2)}</div>
          <p class="footer-note">Não é documento fiscal</p>
          <script>window.print(); setTimeout(() => window.close(), 1000);</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  // ── CONSUMO FUNCIONÁRIOS HELPERS ──────────────────────────────────────────
  const fetchOperatorHistory = async (operatorId: string) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/operators/consumptions/${operatorId}`);
      setHistory(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar extrato de consumo.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Real-time calculated pending balance from history for instantaneous UI updates
  const currentOperatorPendingBalance = useMemo(() => {
    if (!history || history.length === 0) return selectedOperator?.pendingBalance || 0;
    return history.reduce((sum, rec) => {
      const recordPending = rec.items
        .filter(item => !item.settled)
        .reduce((itemSum, item) => itemSum + Number(item.subtotal), 0);
      return sum + recordPending;
    }, 0);
  }, [history, selectedOperator?.pendingBalance]);

  // Baixa / Quitar Consumo de Colaborador (Total, por itens ou abatimento parcial)
  const handleSettleOperator = async (operatorId: string, itemIds?: string[]) => {
    setSettling(true);
    try {
      await api.post(`/operators/consumptions/${operatorId}/settle`, { itemIds });
      toast.success(itemIds && itemIds.length > 0 ? 'Itens selecionados quitados com sucesso!' : 'Baixa total realizada com sucesso!');
      setSelectedItemsToSettle([]);
      fetchOperatorHistory(operatorId);
      fetchOperators();
      setIsSettleModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao dar baixa no consumo.');
    } finally {
      setSettling(false);
    }
  };

  // Abatimento de valor parcial em R$ (ex: colaborador devendo R$ 14,00 e paga R$ 10,00)
  const handlePartialSettleByAmount = async () => {
    if (!selectedOperator) return;
    const amount = parseFloat(partialSettleAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Informe um valor de abatimento válido.');
      return;
    }

    setSettling(true);
    try {
      await api.post(`/operators/consumptions/${selectedOperator.id}/settle`, { amount });
      toast.success(`Abatimento de R$ ${amount.toFixed(2)} realizado com sucesso!`);
      setPartialSettleAmount('');
      fetchOperatorHistory(selectedOperator.id);
      fetchOperators();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao realizar abatimento.');
    } finally {
      setSettling(false);
    }
  };

  // Cancelar / Excluir Lançamento de Consumo de Colaborador
  const handleDeleteOperatorConsumption = async (consumptionId: string) => {
    if (!confirm('Deseja realmente cancelar este lançamento de consumo? O estoque dos produtos será estornado.')) return;
    try {
      await api.delete(`/operators/consumptions/${consumptionId}`);
      toast.success('Lançamento cancelado e estoque estornado!');
      if (selectedOperator) {
        fetchOperatorHistory(selectedOperator.id);
        fetchOperators();
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cancelar lançamento.');
    }
  };

  useEffect(() => {
    if (selectedOperator) {
      fetchOperatorHistory(selectedOperator.id);
    }
  }, [selectedOperator]);

  const totalComandasAccrued = useMemo(() => {
    return comandas.reduce((acc, c) => acc + Number(c.total || 0), 0);
  }, [comandas]);

  const filteredComandas = useMemo(() => {
    return comandas.filter(c => 
      c.number.toLowerCase().includes(comandaSearch.toLowerCase()) ||
      (c.customerName && c.customerName.toLowerCase().includes(comandaSearch.toLowerCase()))
    );
  }, [comandas, comandaSearch]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 10);
    return products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 15);
  }, [products, productSearch]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900/60 border border-zinc-800 p-6 rounded-3xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              {isComandasEnabled ? <UtensilsCrossed size={24} /> : <User size={24} />}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">
                {isComandasEnabled ? 'Comandas & Mesas' : 'Consumo de Colaboradores'}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                {isComandasEnabled 
                  ? 'Gerencie o consumo em aberto de clientes e colaboradores' 
                  : 'Gerencie os lançamentos e acertos de consumo dos funcionários'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs Selection (Exibido apenas se o módulo de comandas de clientes estiver ativo) */}
        {isComandasEnabled && (
          <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 w-full md:w-auto">
            <button
              onClick={() => setActiveTab('cliente')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'cliente' ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/10' : 'text-zinc-400 hover:text-white'}`}
            >
              <UtensilsCrossed size={16} /> Comandas / Mesas ({comandas.length})
            </button>
            <button
              onClick={() => setActiveTab('funcionario')}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${activeTab === 'funcionario' ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/10' : 'text-zinc-400 hover:text-white'}`}
            >
              <User size={16} /> Funcionários ({operators.length})
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: COMANDAS DE CLIENTES & MESAS */}
      {activeTab === 'cliente' && (
        <div className="space-y-6">
          
          {/* KPI Bar & Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex justify-between items-center">
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{comandaStatusFilter === 'open' ? 'Comandas Abertas' : 'Comandas Canceladas'}</p>
                <p className="text-2xl font-black text-white mt-1">{comandas.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                <UtensilsCrossed size={20} />
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex justify-between items-center">
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{comandaStatusFilter === 'open' ? 'Consumo Total Acumulado' : 'Valor histórico não faturado'}</p>
                <p className={`text-2xl font-black mt-1 ${comandaStatusFilter === 'open' ? 'text-emerald-400' : 'text-red-300'}`}>R$ {totalComandasAccrued.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                <DollarSign size={20} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsNewComandaModalOpen(true)}
                className="w-full h-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black p-4 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10 active:scale-95 text-sm"
              >
                <Plus size={20} /> Abrir Nova Comanda / Mesa
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setComandaStatusFilter('open')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${comandaStatusFilter === 'open' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Em atendimento</button>
            <button onClick={() => setComandaStatusFilter('cancelled')} className={`px-3 py-2 rounded-xl text-xs font-bold transition ${comandaStatusFilter === 'cancelled' ? 'bg-red-400 text-zinc-950' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Histórico cancelado</button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Buscar por número da mesa ou nome do cliente..."
              value={comandaSearch}
              onChange={e => setComandaSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Grid de Cards de Comandas */}
          {loadingComandas ? (
            <div className="py-16 text-center text-zinc-500">
              <Loader2 className="animate-spin mx-auto mb-2 text-amber-500" size={28} />
              <p className="text-xs font-bold">Carregando comandas abertas...</p>
            </div>
          ) : filteredComandas.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-3xl p-12 text-center">
              <UtensilsCrossed className="mx-auto text-zinc-600 mb-3" size={40} />
              <h3 className="text-white font-bold text-base">{comandaStatusFilter === 'open' ? 'Nenhuma comanda aberta encontrada' : 'Nenhuma comanda cancelada encontrada'}</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                {comandaSearch ? 'Nenhum resultado corresponde à sua pesquisa.' : 'Nenhuma mesa ou comanda está em consumo no momento. Clique no botão acima para abrir uma nova.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredComandas.map(c => (
                <div key={c.id} className="bg-zinc-900/60 border border-zinc-800/80 hover:border-amber-500/40 rounded-3xl p-5 flex flex-col justify-between space-y-4 transition shadow-xl group">
                  <div>
                    {/* Header Card */}
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div>
                        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg inline-block">
                          MESA / COMANDA #{c.number}
                        </span>
                        {c.customerName && (
                          <h3 className="text-white font-bold text-base mt-2 truncate">{c.customerName}</h3>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase block">Acumulado</span>
                        <span className={`text-lg font-black ${c.status === 'cancelled' ? 'text-red-300' : 'text-emerald-400'}`}>R$ {Number(c.total || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono mb-3">
                      <span className="flex items-center gap-1">
                        <Clock size={13} /> {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>•</span>
                      <span>{c.items?.length || 0} item(ns)</span>
                    </div>

                    {/* Resumo de itens (primeiros 3) */}
                    <div className="bg-zinc-950/60 rounded-xl p-3 space-y-1 text-xs border border-zinc-800/50">
                      {c.items && c.items.length > 0 ? (
                        c.items.slice(0, 3).map(item => (
                          <div key={item.id} className="flex justify-between items-center text-zinc-300">
                            <span className="truncate max-w-[170px]">{Number(item.quantity)}x {item.product?.name || 'Item'}</span>
                            <span className="font-mono text-zinc-400">R$ {Number(item.totalPrice).toFixed(2)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-zinc-600 text-[11px] italic">Sem itens lançados ainda</p>
                      )}
                      {c.items && c.items.length > 3 && (
                        <p className="text-[10px] text-amber-400/80 font-bold pt-1 text-center">
                          + {c.items.length - 3} outros item(ns)...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Card */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/60">
                    <button
                      onClick={() => setSelectedComanda(c)}
                      className="px-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      title={c.status === 'cancelled' ? 'Ver auditoria da comanda cancelada' : 'Ver e adicionar itens'}
                    >
                      <Plus size={14} /> {c.status === 'cancelled' ? 'Ver' : 'Lançar'}
                    </button>
                    <button
                      onClick={() => handlePrintExtrato(c)}
                      className="px-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Imprimir extrato de consumo"
                    >
                      <Printer size={14} /> Extrato
                    </button>
                    <button
                      onClick={() => handleChargeComanda(c)}
                      disabled={c.status === 'cancelled'}
                      className="px-2 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Carregar itens no caixa do PDV para cobrar"
                    >
                      <ShoppingBag size={14} /> Cobrar
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* TAB 2: CONSUMO DE FUNCIONÁRIOS (EXISTENTE) */}
      {activeTab === 'funcionario' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
            <Search className="text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Buscar colaborador por nome..."
              value={operatorSearch}
              onChange={e => setOperatorSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
          </div>

          {loadingOperators ? (
            <div className="py-12 text-center text-zinc-500">Carregando colaboradores...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {operators
                .filter(op => op.name.toLowerCase().includes(operatorSearch.toLowerCase()))
                .map(op => (
                  <div
                    key={op.id}
                    onClick={() => setSelectedOperator(op)}
                    className="bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 cursor-pointer transition flex justify-between items-center group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center font-bold">
                        {op.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm group-hover:text-amber-400 transition">{op.name}</h4>
                        <p className="text-xs text-zinc-500">{op.jobTitle || 'Colaborador'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block">Pendente</span>
                      <span className="text-sm font-black text-amber-400">R$ {Number(op.pendingBalance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE NOVA COMANDA */}
      {isNewComandaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative text-left">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <UtensilsCrossed className="text-amber-400" size={20} /> Abrir Nova Comanda / Mesa
              </h3>
              <button 
                onClick={() => setIsNewComandaModalOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateComanda} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Número / Identificação da Mesa *</label>
                <input
                  type="text"
                  placeholder="Ex: 01, Mesa 05, Sinuca 1..."
                  value={newNumber}
                  onChange={e => setNewNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white font-bold placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Nome do Cliente (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: João da Sinuca, Grupo do Bar..."
                  value={newCustomer}
                  onChange={e => setNewCustomer(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">Observações (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Fica na mesa de sinuca dos fundos..."
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsNewComandaModalOpen(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 rounded-xl font-bold transition text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingComanda}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold px-5 py-2.5 rounded-xl transition text-xs flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {creatingComanda ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  Abrir Comanda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES E LANÇAMENTO DE ITENS DA COMANDA */}
      {selectedComanda && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative text-left my-8">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <div>
                <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold px-2.5 py-1 rounded-lg inline-block">
                  MESA / COMANDA #{selectedComanda.number}
                </span>
                <h3 className="text-xl font-black text-white mt-1">
                  {selectedComanda.customerName || 'Cliente Consumidor'}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Aberta em: {new Date(selectedComanda.createdAt).toLocaleString('pt-BR')}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-zinc-400">
                  {selectedComanda.responsibleWaiter?.name && <span>Garçom: {selectedComanda.responsibleWaiter.name}</span>}
                  {selectedComanda.notes && <span>Obs.: {selectedComanda.notes}</span>}
                  <span className={selectedComanda.status === 'cancelled' ? 'text-red-300 font-bold uppercase' : 'text-emerald-400 font-bold uppercase'}>{selectedComanda.status === 'cancelled' ? 'Comanda cancelada' : selectedComanda.status}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Total Atual</span>
                  <span className="text-xl font-black text-emerald-400">R$ {Number(selectedComanda.total || 0).toFixed(2)}</span>
                </div>
                <button 
                  onClick={() => setSelectedComanda(null)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2 rounded-xl transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Form de Adicionar Item Direto na Comanda */}
            {selectedComanda.status !== 'cancelled' && <form onSubmit={handleAddItemToComanda} className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 mb-5 space-y-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Lançar Novo Produto na Comanda:</span>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 relative">
                  <input
                    type="text"
                    placeholder="Pesquisar produto pelo nome..."
                    value={productSearch}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setAddingProductId('');
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  {productSearch && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl max-h-40 overflow-y-auto z-20 shadow-xl">
                      {filteredProducts.map(p => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setAddingProductId(p.id);
                            setProductSearch(p.name);
                          }}
                          className="p-2.5 hover:bg-zinc-800 cursor-pointer text-xs text-white flex justify-between border-b border-zinc-800/50 last:border-0"
                        >
                          <span>{p.name}</span>
                          <span className="text-emerald-400 font-bold">R$ {Number(p.priceSell).toFixed(2)}</span>
                        </div>
                      ))}
                      {filteredProducts.length === 0 && (
                        <div className="p-3 text-xs text-zinc-500 text-center">Nenhum produto encontrado</div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={addingQuantity}
                    onChange={e => setAddingQuantity(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white text-center font-bold focus:outline-none focus:border-amber-500"
                    placeholder="Qtd"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={addingItem || !addingProductId}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold py-2 px-3 rounded-xl transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {addingItem ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                    Adicionar
                  </button>
                </div>
              </div>
            </form>}

            {/* Extrato / Lista de Itens Lançados */}
            <div className="space-y-2 mb-6">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Itens Lançados nesta Comanda:</span>
              
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                {selectedComanda.items && selectedComanda.items.length > 0 ? (
                  selectedComanda.items.map(item => (
                    <div key={item.id} className={`bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex justify-between items-center text-xs ${item.status && item.status !== 'active' ? 'opacity-55' : ''}`}>
                      <div>
                        <p className="font-bold text-white text-sm">{item.product?.name || 'Produto'} {item.status === 'removed' && <span className="text-[10px] text-red-300 uppercase">· removido</span>}{item.status === 'cancelled' && <span className="text-[10px] text-red-300 uppercase">· cancelado</span>}</p>
                        <p className="text-zinc-500 font-mono text-[11px] mt-0.5">
                          {Number(item.quantity)} x R$ {Number(item.unitPrice).toFixed(2)}
                        </p>
                        {item.removalReason && <p className="text-red-300 mt-1">Motivo: {item.removalReason}</p>}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-emerald-400 text-sm">R$ {Number(item.totalPrice).toFixed(2)}</span>
                        {selectedComanda.status !== 'cancelled' && (!item.status || item.status === 'active') && <button
                          onClick={() => { setSensitiveAction({ type: 'remove_item', item }); setSensitivePin(''); setSensitiveReason(''); }}
                          className="text-zinc-600 hover:text-red-400 p-1 transition"
                          title="Remover item da comanda"
                        >
                          <Trash2 size={16} />
                        </button>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-zinc-500 text-xs italic bg-zinc-950/40 rounded-xl border border-zinc-800/40">
                    Nenhum item foi lançado nesta comanda ainda.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => handlePrintExtrato(selectedComanda)}
                className="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2.5 rounded-xl font-bold transition text-xs flex items-center justify-center gap-2"
              >
                <Printer size={16} /> Imprimir Extrato
              </button>

              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setSelectedComanda(null)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 rounded-xl font-bold transition text-xs"
                >
                  Fechar
                </button>

                {selectedComanda.status !== 'cancelled' && <button
                  onClick={() => { setSensitiveAction({ type: 'cancel_comanda' }); setSensitivePin(''); setSensitiveReason(''); }}
                  className="border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-bold px-4 py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 size={15} /> Cancelar comanda
                </button>}

                <button
                  onClick={() => {
                    const c = selectedComanda;
                    setSelectedComanda(null);
                    handleChargeComanda(c);
                  }}
                  disabled={selectedComanda.status === 'cancelled' || !selectedComanda.items || selectedComanda.items.filter(item => !item.status || item.status === 'active').length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <ShoppingBag size={16} /> Cobrar / Ir para o Caixa
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE DETALHES E DAR BAIXA NO CONSUMO DO COLABORADOR */}
      {selectedOperator && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-3xl shadow-2xl relative text-left my-8">
            
            {/* Header Modal */}
            <div className="flex justify-between items-start border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg">
                  {selectedOperator.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">{selectedOperator.name}</h3>
                  <p className="text-xs text-zinc-400">{selectedOperator.jobTitle || 'Colaborador'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Saldo Pendente</span>
                  <span className="text-xl font-black text-amber-400">R$ {Number(currentOperatorPendingBalance).toFixed(2)}</span>
                </div>
                <button 
                  onClick={() => setSelectedOperator(null)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-2 rounded-xl transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Ações / Barra de Abatimento & Lançamento */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 mb-5 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyPending}
                    onChange={e => setShowOnlyPending(e.target.checked)}
                    className="rounded border-zinc-800 bg-zinc-900 text-amber-500 focus:ring-0"
                  />
                  Mostrar apenas consumos pendentes
                </label>

                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleSettleOperator(selectedOperator.id)}
                    disabled={settling || currentOperatorPendingBalance <= 0}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-md shadow-emerald-600/20"
                  >
                    {settling ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                    Quitar Tudo (Baixa Total)
                  </button>
                </div>
              </div>

              {/* Input para Abatimento de Valor Parcial */}
              {currentOperatorPendingBalance > 0 && (
                <div className="pt-3 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center gap-2">
                  <span className="text-xs text-zinc-400 font-bold whitespace-nowrap">Dar baixa em valor parcial:</span>
                  <div className="relative flex-1 w-full">
                    <span className="absolute left-3 top-2 text-xs font-bold text-zinc-500">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 50.00 (Abater 50 reais)"
                      value={partialSettleAmount}
                      onChange={e => setPartialSettleAmount(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    onClick={handlePartialSettleByAmount}
                    disabled={settling || !partialSettleAmount}
                    className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold px-4 py-1.5 rounded-xl text-xs transition cursor-pointer active:scale-95"
                  >
                    Abater Valor
                  </button>
                </div>
              )}
            </div>

            {/* Extrato de Consumo */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-zinc-400 uppercase tracking-wider">
                <span>Histórico de Lançamentos</span>
                {selectedItemsToSettle.length > 0 && (
                  <button
                    onClick={() => handleSettleOperator(selectedOperator.id, selectedItemsToSettle)}
                    disabled={settling}
                    className="text-emerald-400 hover:text-emerald-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 size={13} /> Quitar Selecionados ({selectedItemsToSettle.length})
                  </button>
                )}
              </div>

              {historyLoading ? (
                <div className="py-12 text-center text-zinc-500 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-amber-400" size={18} /> Carregando extrato...
                </div>
              ) : history.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 text-xs italic bg-zinc-950/40 rounded-2xl border border-zinc-800/40">
                  Nenhum registro de consumo encontrado para este colaborador.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                  {history
                    .filter(rec => !showOnlyPending || rec.items.some(i => !i.settled))
                    .map(record => (
                      <div key={record.id} className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3.5 space-y-2">
                        <div className="flex justify-between items-center border-b border-zinc-800/60 pb-2">
                          <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                            <Clock size={13} /> {new Date(record.createdAt).toLocaleString('pt-BR')}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-white font-mono">Total: R$ {Number(record.total).toFixed(2)}</span>
                            <button
                              onClick={() => handleDeleteOperatorConsumption(record.id)}
                              className="text-zinc-600 hover:text-red-400 transition p-1"
                              title="Cancelar lançamento de consumo"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Itens do Lançamento */}
                        <div className="space-y-1.5 pt-1">
                          {record.items
                            .filter(i => !showOnlyPending || !i.settled)
                            .map(item => (
                              <div key={item.id} className="flex justify-between items-center text-xs text-zinc-300">
                                <div className="flex items-center gap-2">
                                  {!item.settled && (
                                    <input
                                      type="checkbox"
                                      checked={selectedItemsToSettle.includes(item.id)}
                                      onChange={e => {
                                        if (e.target.checked) setSelectedItemsToSettle([...selectedItemsToSettle, item.id]);
                                        else setSelectedItemsToSettle(selectedItemsToSettle.filter(id => id !== item.id));
                                      }}
                                      className="rounded border-zinc-800 bg-zinc-900 text-amber-500 focus:ring-0"
                                    />
                                  )}
                                  <span>{Number(item.quantity)}x {item.name}</span>
                                </div>
                                <div className="flex items-center gap-3 font-mono">
                                  <span className="text-zinc-400">R$ {Number(item.subtotal).toFixed(2)}</span>
                                  {item.settled ? (
                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                      QUITADO
                                    </span>
                                  ) : (
                                    <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                      PENDENTE
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex justify-end pt-4 border-t border-zinc-800 mt-4">
              <button
                onClick={() => setSelectedOperator(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2.5 rounded-xl font-bold transition text-xs"
              >
                Fechar Extrato
              </button>
            </div>

          </div>
        </div>
      )}

      {sensitiveAction && selectedComanda && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-red-500/35 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-4"><KeyRound size={20} className="text-red-300" /></div>
            <h3 className="text-base font-black text-white">{sensitiveAction.type === 'remove_item' ? 'Remover item da comanda?' : 'Cancelar comanda inteira?'}</h3>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{sensitiveAction.type === 'remove_item' ? `${sensitiveAction.item?.product?.name || 'Item'} será removido com estorno rastreável.` : `A comanda #${selectedComanda.number} permanecerá no histórico como cancelada e não entrará no financeiro.`}</p>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mt-5 mb-1.5">Motivo obrigatório</label>
            <input value={sensitiveReason} onChange={e => setSensitiveReason(e.target.value)} maxLength={500} placeholder="Ex.: lançamento duplicado" className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-400 rounded-xl px-3 py-2.5 text-sm text-white outline-none" />
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mt-3 mb-1.5">PIN do Caixa ou Gerente</label>
            <input type="password" inputMode="numeric" autoFocus value={sensitivePin} onChange={e => setSensitivePin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="••••" className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-400 rounded-xl px-3 py-2.5 text-center text-xl tracking-[0.45em] font-mono text-white outline-none" />
            <div className="flex gap-2 mt-6">
              <button type="button" disabled={sensitiveLoading} onClick={() => setSensitiveAction(null)} className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition">Voltar</button>
              <button type="button" disabled={sensitiveLoading} onClick={submitSensitiveAction} className="flex-[1.35] py-3 rounded-xl bg-red-500 hover:bg-red-400 text-zinc-950 font-black text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50">
                {sensitiveLoading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}{sensitiveAction.type === 'remove_item' ? 'Autorizar remoção' : 'Autorizar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal: Compostos — Seleção de Adicionais ══════════════════════════ */}
      <CompositeModifierModal
        product={compositeProductForComanda as any}
        isOpen={!!compositeProductForComanda}
        onClose={() => setCompositeProductForComanda(null)}
        onConfirm={(_product, selectedModifiers) => {
          const modifiers = selectedModifiers.map(({ option }) => ({ optionId: option.id }));
          const product = compositeProductForComanda!;
          setCompositeProductForComanda(null);
          doAddItemToComanda(product, addingQuantity, modifiers);
        }}
      />

    </div>
  );
}
