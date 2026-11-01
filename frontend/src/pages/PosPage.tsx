import { ComandaWorkspaceModal } from '@/components/ComandaWorkspaceModal';
import { useComandasBackup } from '@/hooks/useComandasBackup';
import { syncLoadedComanda } from '@/lib/comanda-cart';
import { useState, useEffect, useDeferredValue, useMemo, useRef, useCallback, type TouchEvent as ReactTouchEvent } from 'react';
import { LazyImage } from '@/components/LazyImage';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { useCartStore, type Product, type CartItemModifier } from '@/store/cart';
import { api, apiGet } from '@/lib/api';
import { toast } from 'sonner';
import { updateProductsCache, getCachedProducts, db } from '@/lib/db';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { PaymentModal } from '@/components/PaymentModal';
import { OperatorLoginModal } from '@/components/OperatorLoginModal';
import { OpenShiftModal } from '@/components/OpenShiftModal';
import { CloseRegisterModal } from '@/components/CloseRegisterModal';
import { CashMovementModal } from '@/components/CashMovementModal';
import { CompositeModifierModal } from '@/components/CompositeModifierModal';
import { CameraBarcodeScannerModal } from '@/components/CameraBarcodeScannerModal';
import { ExportXmlModal } from '@/components/ExportXmlModal';
import { DemoBanner } from '@/components/DemoBanner';
import { CapitaoGelada } from '@/components/CapitaoGelada';
import { useDemoGuideStore } from '@/store/demoGuide';
import { useShift } from '@/contexts/ShiftContext';
import {
  Search, ShoppingCart, X, LogOut, PackageOpen, Minus, Plus, Trash2,
  LayoutDashboard, FileText, ArrowDownUp, Database, Layers, UtensilsCrossed,
  ShoppingBag, Camera, Menu, Download, UserCheck, Sparkles, Users, Loader2, PawPrint
} from 'lucide-react';
import { getFullUrl } from '@/lib/getFullUrl';
import '@/pages/petshop/petshop-pos-theme.css';

function PosPageContent({ experience }: { experience?: 'food' }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('checkout') === '1') {
      setIsPaymentOpen(true);
      setInitialOpenComanda(false);
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const { token, user, logout } = useAuthStore();
  const { items, total, addItem, updateQuantity, removeItem, clearCart, setActiveComanda, activeComandaId, activeComandaNumber } = useCartStore();

  const syncState = useOfflineSync();

  const [products,           setProducts]           = useState<Product[]>([]);
  const [search,             setSearch]             = useState('');
  const [isPaymentOpen,      setIsPaymentOpen]      = useState(false);
  const [initialOpenComanda, setInitialOpenComanda] = useState(false);
  const [isCloseRegisterOpen,setIsCloseRegisterOpen]= useState(false);
  const [isMobileCartOpen,   setIsMobileCartOpen]   = useState(false);
  const [isCameraScannerOpen,setIsCameraScannerOpen]= useState(false);
  const [isMobileMenuOpen,   setIsMobileMenuOpen]   = useState(false);
  const [isExportXmlOpen,    setIsExportXmlOpen]    = useState(false);
  const [isSwitchOperatorOpen, setIsSwitchOperatorOpen] = useState(false);
  const [lastTappedId,       setLastTappedId]       = useState<string | null>(null);
  const [badgeBounce,        setBadgeBounce]        = useState(false);

  // Bottom sheet drag state
  const [sheetExpanded,      setSheetExpanded]      = useState(false);
  const touchStartY = useRef<number>(0);
  const touchDeltaY  = useRef<number>(0);
  const isDragging   = useRef<boolean>(false);
  const [isMovementOpen,     setIsMovementOpen]     = useState(false);
  const [isLoading,          setIsLoading]          = useState(true);
  const [isOfflineCatalog,   setOfflineCatalog]   = useState(false);
  const [forceDesktop, setForceDesktop] = useState(() => localStorage.getItem('7bar_forceDesktop') === 'true');
  const [tenantConfig,       setTenantConfig]       = useState<any>(null);
  const [compositeProduct,   setCompositeProduct]   = useState<Product | null>(null);
  const [focusedProductIdx,  setFocusedProductIdx]  = useState<number>(-1);
  const [visibleCount,       setVisibleCount]       = useState<number>(40);
  const [promptQuantity,      setPromptQuantity]      = useState(() => localStorage.getItem('7bar_promptQuantity') === 'true');
  const [productToSetQuantity,setProductToSetQuantity]= useState<Product | null>(null);
  const [tempQuantity,        setTempQuantity]        = useState<number>(1);
  const productRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const {
    operator,
    cashRegister,
    registerStatus,
    isUnconfirmedCache,
    isLoading: isShiftLoading,
    needsOperatorReauth,
    logoutOperator,
    refreshShift,
  } = useShift();


  // Sincroniza abertura de modais com o Capitão Gelada no modo Demo
  useEffect(() => {
    if (import.meta.env.VITE_APP_MODE !== 'demo') return;

    if (isPaymentOpen) {
      useDemoGuideStore.getState().setActiveModal('payment');
    } else if (isMovementOpen) {
      useDemoGuideStore.getState().setActiveModal('movement');
    } else if (isCloseRegisterOpen) {
      useDemoGuideStore.getState().setActiveModal('close_register');
    } else {
      useDemoGuideStore.getState().setActiveModal(null);
    }
  }, [isPaymentOpen, isMovementOpen, isCloseRegisterOpen]);

  // Estados para Módulo de Comandas no Frente de Caixa (PDV)
  const [isComandasModalOpen, setIsComandasModalOpen] = useState(false);
  const [pendingRemoveComandaItemId, setPendingRemoveComandaItemId] = useState<string | null>(null);
  const [pendingRemoveComandaQuantity, setPendingRemoveComandaQuantity] = useState<number | null>(null);
  const [openComandas, setOpenComandas] = useState<any[]>([]);
  const [loadingComandas, setLoadingComandas] = useState(false);
  const [selectedComandaId, setSelectedComandaId] = useState<string | null>(null);
  const [newComandaBadge, setNewComandaBadge] = useState(false); // Badge de nova comanda

  const modules = useMemo(() => {
    try {
      if (tenantConfig?.modulos) {
        return typeof tenantConfig.modulos === 'string' ? JSON.parse(tenantConfig.modulos) : tenantConfig.modulos;
      }
    } catch (e) {
      console.error(e);
    }
    return {};
  }, [tenantConfig]);

  const isComandasEnabled = modules?.comandas === true;
  const isPetshopTheme = modules?.petshop !== false;
  const isFoodTheme = false;
  const dashboardPath = isFoodTheme ? '/restaurante/hoje' : isPetshopTheme ? '/petshop' : '/dashboard';
  const dashboardTitle = isFoodTheme ? 'Voltar ao restaurante' : isPetshopTheme ? 'Ir para o Painel Pet' : 'Voltar ao Dashboard';
  const chargeComanda = isFoodTheme ? searchParams.get('chargeComanda') : null;
  const chargeDecision = useRef<string | null>(null);
  useEffect(() => {
    if (!chargeComanda || !operator?.id || needsOperatorReauth || registerStatus !== 'open_confirmed' || !cashRegister?.id) return;
    const controller = new AbortController();
    const removeIntent = () => setSearchParams(current => { const next = new URLSearchParams(current); next.delete('chargeComanda'); return next; }, { replace: true });
    const currentCart = useCartStore.getState();
    if (currentCart.items.length && currentCart.activeComandaId !== chargeComanda && chargeDecision.current !== chargeComanda) {
      if (!window.confirm('Há itens no caixa. Deseja substituir este carrinho pela comanda selecionada?')) { removeIntent(); return; }
      chargeDecision.current = chargeComanda;
    }
    api.get(`/v1/comandas/${encodeURIComponent(chargeComanda)}`, {
      signal: controller.signal, timeout: 10000, expectedTenantId: user?.tenant, expectedOperatorId: operator.id,
    } as any).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (!['open', 'waiting_payment'].includes(data.status) || !data.items?.some((item: any) => !item.status || item.status === 'active')) {
        toast.error('Esta comanda não está disponível para cobrança.'); removeIntent(); return;
      }
      clearCart(); setActiveComanda(data.id, data.number); syncLoadedComanda(data);
      setInitialOpenComanda(false); setIsPaymentOpen(true); removeIntent();
    }).catch(() => {
      if (!controller.signal.aborted) { toast.error('Não foi possível carregar a comanda. Tente novamente pelo salão.'); removeIntent(); }
    });
    return () => controller.abort();
  }, [chargeComanda, operator?.id, needsOperatorReauth, registerStatus, cashRegister?.id, user?.tenant, clearCart, setActiveComanda, setSearchParams]);
  useComandasBackup(user?.tenant, isComandasEnabled);

  const fetchOpenComandas = useCallback(async (signal?: AbortSignal) => {
    setLoadingComandas(true);
    try {
      const res = await apiGet('/v1/comandas?status=open', {
        signal,
        headers: { 'X-Silent-Poll': 'true' },
      });
      const newList: any[] = res.data || [];
      if (user?.tenant && Array.isArray(newList)) {
        void db.comandas_cache.put({ tenantId: user.tenant, savedAt: Date.now(), items: newList }).catch(() => {});
      }
      setOpenComandas(prev => {
        const prevMap = new Map(prev.map((c: any) => [c.id, c.status]));
        // Dispara beep e badge somente na TRANSIÇÃO de estado:
        // 1. Nova comanda que não existia antes (se prev já tinha dados)
        // 2. Comanda que transitou de open -> waiting_payment
        const hasTransition = newList.some(c => {
          const prevStatus = prevMap.get(c.id);
          const isNewComanda = !prevStatus && prev.length > 0;
          const isRequestedPayment = prevStatus === 'open' && c.status === 'waiting_payment';
          return isNewComanda || isRequestedPayment;
        });

        if (hasTransition) {
          setNewComandaBadge(true);
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
          } catch { /* silencia se AudioContext não disponível */ }
        }
        return newList;
      });
    } catch {
      if (user?.tenant) {
        try {
          const cached = await db.comandas_cache.get(user.tenant);
          if (cached?.items) setOpenComandas(cached.items);
        } catch { /* silencia */ }
      }
    } finally {
      setLoadingComandas(false);
    }
  }, [user?.tenant]);

  useEffect(() => {
    if (!isComandasEnabled) return;

    // ── Polling sequencial seguro de comandas (15s) ────────────────────────
    // Inicia imediatamente com a primeira busca, sem criar consulta paralela.
    // Flag destroyed impede atualização após desmonte.
    let destroyed = false;
    let comandaAbortController: AbortController | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const runPoll = async () => {
      if (destroyed) return;

      if (!navigator.onLine || document.hidden) {
        pollTimer = setTimeout(runPoll, 15_000);
        return;
      }

      comandaAbortController = new AbortController();
      try {
        await fetchOpenComandas(comandaAbortController.signal);
      } finally {
        if (!destroyed) {
          pollTimer = setTimeout(runPoll, 15_000);
        }
      }
    };

    // Execução sequencial: busca inicial imediata
    void runPoll();

    return () => {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      comandaAbortController?.abort();
    };
  }, [isComandasEnabled, fetchOpenComandas]);

  const handleChargeComandaFromPos = (comanda: any) => {

    if (!comanda.items || comanda.items.length === 0) {
      toast.error('Esta comanda está vazia.');
      return;
    }
    clearCart();
    setActiveComanda(comanda.id, comanda.number);

    syncLoadedComanda(comanda);

    if (comanda.notes) {
      try {
        let apptId = null;
        if (comanda.notes.startsWith('PET2:')) {
          const parsed = JSON.parse(comanda.notes.slice(5));
          apptId = parsed.a || null;
        } else if (comanda.notes.startsWith('PETSHOP_LINK_V1:')) {
          const parsed = JSON.parse(comanda.notes.slice(16));
          apptId = parsed.appointment?.id || null;
        }
        if (apptId) {
          sessionStorage.setItem('petshop_checkout_appointment_id', apptId);
        }
      } catch {
        // silencioso
      }
    }

    toast.info(`Comanda #${comanda.number} carregada! Finalizando pagamento...`);
    setIsComandasModalOpen(false);
    setInitialOpenComanda(false);
    setIsPaymentOpen(true);
  };

  const requestRemoveComandaItem = (comandaItemId?: string, quantity?: number) => {
    if (!activeComandaId || !comandaItemId) {
      toast.error('Não foi possível identificar o lançamento da comanda. Recarregue a comanda antes de remover.');
      return;
    }
    setSelectedComandaId(activeComandaId);
    setPendingRemoveComandaItemId(comandaItemId);
    setPendingRemoveComandaQuantity(quantity ?? null);
    setIsComandasModalOpen(true);
  };

  useEffect(() => {
    localStorage.setItem('7bar_promptQuantity', String(promptQuantity));
  }, [promptQuantity]);

  useEffect(() => {
    localStorage.setItem('7bar_forceDesktop', String(forceDesktop));
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      if (forceDesktop) {
        meta.setAttribute('content', 'width=1200, maximum-scale=1.0');
      } else {
        meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover');
      }
    }
  }, [forceDesktop]);

  // --- Bottom sheet touch handlers ---
  const handleSheetTouchStart = (e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
    isDragging.current = true;
  };
  const handleSheetTouchMove = (e: ReactTouchEvent) => {
    if (!isDragging.current) return;
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
  };
  const handleSheetTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (touchDeltaY.current < -50) {
      setSheetExpanded(true);
    } else if (touchDeltaY.current > 50) {
      setSheetExpanded(false);
    }
    touchDeltaY.current = 0;
  };

  // --- Micro-animation helper ---
  const triggerTapAnimation = (productId: string) => {
    setLastTappedId(productId);
    setBadgeBounce(true);
    setTimeout(() => setLastTappedId(null), 200);
    setTimeout(() => setBadgeBounce(false), 300);
  };

  const handleClickProduct = (product: Product) => {
    // Busca o produto com os modifierGroups completos do array de products em memória
    const fullProduct = products.find(p => p.id === product.id) || product;
    setSearch('');
    triggerTapAnimation(product.id);
    if (fullProduct.isComposite && fullProduct.modifierGroups && fullProduct.modifierGroups.length > 0) {
      setCompositeProduct(fullProduct);
    } else if (promptQuantity) {
      setProductToSetQuantity(fullProduct);
      setTempQuantity(1);
    } else {
      addItem(fullProduct);
      setTimeout(() => {
        if (!('ontouchstart' in window)) {
          const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
          if (searchInput) searchInput.focus();
        }
      }, 10);
    }
  };

  useEffect(() => {
    if (token) {
      api.get(`/tenants/me?_t=${Date.now()}`).then(res => setTenantConfig(res.data)).catch(console.error);
    }
  }, [token]);


  const handleCameraScan = (scannedCode: string) => {
    const clean = scannedCode.trim().toLowerCase();
    const match = products.find(p => (
      p.barcode?.toLowerCase() === clean ||
      p.shortCode?.toLowerCase() === clean ||
      p.id.toLowerCase() === clean
    ));
    if (match) {
      handleClickProduct(match);
      toast.success(`Produto adicionado: ${match.name}`, { id: 'camera-scan' });
      setIsCameraScannerOpen(false);
    } else {
      setSearch(scannedCode.trim());
      toast.error(`Produto "${scannedCode}" não encontrado no catálogo.`, { id: 'camera-scan' });
    }
  };


  // Ref estável para isOnline — evita que loadProducts seja recriado a cada re-render do useOfflineSync
  const isOnlineRef = useRef<boolean>(syncState.isOnline);
  isOnlineRef.current = syncState.isOnline;

  const loadProducts = useCallback((backgroundOnly = false) => {
    if (!token) { navigate('/login'); return; }

    const PRIORITY_KEYWORDS = ['ração', 'golden', 'premier', 'royal', 'banho', 'tosa', 'antipulgas', 'nexgard', 'simparic', 'bravecto', 'sachê', 'petisco', 'areia', 'tapete', 'shampoo'];
    const getScore = (name: string) => {
      const lower = name.toLowerCase();
      for (let i = 0; i < PRIORITY_KEYWORDS.length; i++) {
        if (lower.includes(PRIORITY_KEYWORDS[i])) return PRIORITY_KEYWORDS.length - i;
      }
      return 0;
    };

    const sortProducts = (list: any[]) => {
      return [...list].sort((a, b) => {
        const aSales = Number(a.salesCount || 0);
        const bSales = Number(b.salesCount || 0);
        if (bSales !== aSales) return bSales - aSales;
        return getScore(b.name) - getScore(a.name);
      });
    };

    // ── PASSO 1: Exibe cache local imediatamente (zero latência de rede) ──────
    // Só mostra spinner se não houver nada em cache para exibir.
    if (!backgroundOnly) {
      getCachedProducts().then(cached => {
        if (cached.length > 0) {
          setProducts(sortProducts(cached as unknown as Product[]));
          setOfflineCatalog(false);
          setIsLoading(false); // Produtos visíveis antes mesmo de bater no servidor
        } else {
          setIsLoading(true); // Sem cache: mostra spinner (primeiro uso ou cache limpo)
        }
      }).catch(() => setIsLoading(true));
    }

    // ── PASSO 2: Atualiza em background a partir da API (se online) ───────────
    if (!isOnlineRef.current) {
      // Offline: garante que o cache já foi exibido no Passo 1
      if (backgroundOnly) {
        getCachedProducts()
          .then(cached => {
            setProducts(sortProducts(cached as unknown as Product[]));
            setOfflineCatalog(true);
          })
          .finally(() => setIsLoading(false));
      }
      return;
    }

    Promise.all([
      api.get('/products?limit=2000'),
      Promise.resolve({ data: [] }),
    ])
      .then(async ([res, complementRes]) => {
        const data = (res.data as any).data || [];
        const complementIds = new Set<string>((complementRes.data || []).map((item: any) => item.productId));
        const sorted = sortProducts(data);
        setProducts(sorted);
        setVisibleCount(40);
        setOfflineCatalog(false);
        // Persiste no IndexedDB para próxima abertura (cache-first funcionar)
        await updateProductsCache(sorted.map((p: any) => ({
          id:         p.id,
          name:       p.name,
          shortCode:  p.shortCode,
          barcode:    p.barcode,
          unit:       'UN',
          priceSell:  Number(p.priceSell),
          stock:      Math.round(Number(p.stock)),
          salesCount: Number(p.salesCount || 0),
          active:     p.active !== false,
          categoryId: p.categoryId,
          category:   p.category,
          ncm:        null, cest: null, origem: 0,
          cfop:       '5102', csosn: null, cstIcms: null,
          aliqIcms:   0, cstPis: '99', aliqPis: 0,
          cstCofins:  '99', aliqCofins: 0,
          cachedAt:   Date.now(),
          imageUrl:   p.imageUrl,
          isComposite:    p.isComposite ?? false,
          modifierGroups: p.modifierGroups ?? [],
        })));
      })
      .catch(async () => {
        // API falhou: garante que o cache está exibido
        const cached = await getCachedProducts();
        if (cached.length > 0) {
          setProducts(sortProducts(cached as unknown as Product[]));
          setOfflineCatalog(true);
        }
      })
      .finally(() => setIsLoading(false));
  // isOnlineRef é uma ref — não vai na dependency array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate, isFoodTheme, user?.tenant]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isComandasModalOpen) return;

      // F1: Atalho direto para Comanda / Mesa
      if (e.key === 'F1') {
        e.preventDefault();
        if (isComandasEnabled) {
          if (items.length > 0) {
            setInitialOpenComanda(true);
            setIsPaymentOpen(true);
          } else {
            setIsComandasModalOpen(true);
          }
        }
        return;
      }

      if ((e.key === 'F12' || e.key === '*') && items.length > 0) { 
        e.preventDefault(); 
        setInitialOpenComanda(false);
        setIsPaymentOpen(true); 
      }
      if (e.key === 'Escape') {
        setIsPaymentOpen(false);
        setInitialOpenComanda(false);
        setIsComandasModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, isComandasEnabled, isComandasModalOpen]);

  const handleLogout = () => {
    logoutOperator();
    logout();
    navigate('/login');
  };

  const deferredSearch = useDeferredValue(search);

  // Quando a busca muda, resetar visibleCount
  useEffect(() => {
    setVisibleCount(40);
  }, [deferredSearch]);
  
  const displayedProducts = useMemo(() => {
    const normalizeStr = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const searchTerms = normalizeStr(deferredSearch).split(' ').filter(t => t.trim() !== '');

    const filtered = products.filter(p => {
      if (p.active === false) return false;

      if (searchTerms.length === 0) return true;
      
      const searchString = normalizeStr(`${p.name} ${p.barcode || ''} ${p.shortCode || ''}`);
      return searchTerms.every(term => searchString.includes(term));
    });

    // Limita a exibição na tela para não travar o navegador com milhares de cards
    return filtered.slice(0, 50);
  }, [products, deferredSearch, isFoodTheme]);

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim() !== '') {
      const match = products.find(p => (
        p.shortCode?.toLowerCase() === search.toLowerCase().trim() || p.barcode === search.trim()
      ));
      if (match) { handleClickProduct(match); setSearch(''); }
      else if (displayedProducts.length === 1) { handleClickProduct(displayedProducts[0]); setSearch(''); }
    }
    // Tab ou ArrowDown move o foco para o primeiro card de produto
    if ((e.key === 'Tab' || e.key === 'ArrowDown') && displayedProducts.length > 0) {
      e.preventDefault();
      setFocusedProductIdx(0);
      setTimeout(() => productRefs.current[0]?.focus(), 0);
    }
  };

  const handleProductGridKeyDown = (e: React.KeyboardEvent, index: number) => {
    const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : 2;
    let next = index;
    if (e.key === 'ArrowRight') { e.preventDefault(); next = Math.min(index + 1, displayedProducts.length - 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); next = Math.max(index - 1, 0); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); next = Math.min(index + cols, displayedProducts.length - 1); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index < cols) {
        // Volta para a barra de busca
        setFocusedProductIdx(-1);
        (document.querySelector('input[type="text"]') as HTMLInputElement)?.focus();
        return;
      }
      next = Math.max(index - cols, 0);
    }
    else if (e.key === 'Enter') {
      e.preventDefault();
      handleClickProduct(displayedProducts[index]);
      return;
    }
    else if (e.key === 'Escape') {
      setFocusedProductIdx(-1);
      (document.querySelector('input[type="text"]') as HTMLInputElement)?.focus();
      return;
    }
    if (next !== index) {
      setFocusedProductIdx(next);
      setTimeout(() => productRefs.current[next]?.focus(), 0);
    }
  };

  const totalItemsCount = items.reduce((acc, item) => acc + item.quantity, 0);

  if (!token) return null;

  return (
    <div className={`pos-shell flex flex-col lg:flex-row h-[100dvh] bg-zinc-950 text-white font-sans overflow-hidden ${isPetshopTheme ? 'petcare-pos-theme' : ''} ${isFoodTheme ? 'food-pos-theme' : ''} ${import.meta.env.VITE_APP_MODE === 'demo' ? 'pt-14' : ''}`}>
      <DemoBanner />
      <CapitaoGelada />
      {/* Esquerda */}
      <div
        className="flex-1 flex flex-col p-3 lg:p-6 lg:pr-4 pb-[80px] lg:pb-6 relative h-full min-w-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        }}
      >
        {/* Header */}
        <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between mb-2 lg:mb-3 gap-2 shrink-0 ${isPetshopTheme ? 'petcare-pos-header' : ''}`}>
          <div className="flex justify-between items-center w-full lg:w-auto gap-2 lg:gap-2.5 min-h-[40px] lg:min-h-[48px] shrink-0">
            <div className="flex items-center gap-2 lg:gap-2.5 shrink-0">
              {experience !== 'food' && (
                tenantConfig === null ? (
                   <div className="h-8 lg:h-10 w-8 lg:w-10 bg-zinc-800/50 animate-pulse rounded-xl shrink-0"></div>
                ) : tenantConfig?.logoUrl ? (
                  <button onClick={() => navigate(dashboardPath)} className="flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform focus:outline-none" title={dashboardTitle}>
                    <img src={getFullUrl(tenantConfig.logoUrl)} alt="Logo" className="h-8 w-8 lg:h-10 lg:w-10 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]" />
                  </button>
                ) : (
                  <button onClick={() => navigate(dashboardPath)} className="bg-zinc-800 border border-zinc-700 p-1.5 rounded-xl flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform focus:outline-none" title={dashboardTitle}>
                    <h1 className="text-xs lg:text-base font-black text-white truncate max-w-[60px] lg:max-w-[80px]">
                      {isFoodTheme ? 'FOOD' : tenantConfig?.nomeFantasia?.substring(0, 2) || tenantConfig?.razaoSocial?.substring(0, 2) || '7B'}
                    </h1>
                  </button>
                )
              )}
              {isPetshopTheme && <div className="hidden xl:block petcare-pos-brand-label"><p>PET CARE</p><span>Caixa e atendimento</span></div>}
              
              <div className={`hidden lg:flex items-center gap-2 ${isPetshopTheme ? 'petcare-pos-operator' : ''}`}>
                 <button
                   type="button"
                   onClick={() => setIsSwitchOperatorOpen(true)}
                   className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/40 transition-all text-left group cursor-pointer active:scale-95 shadow-sm"
                   title="Clique para trocar de operador ou caixa"
                 >
                   <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
                   <span className="text-emerald-400 font-semibold text-xs truncate max-w-[160px] xl:max-w-[220px]">
                     Operador: <strong className="text-white font-bold">{operator?.name || user?.name}</strong>
                   </span>
                   <span className="ml-0.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md group-hover:bg-blue-500/20 group-hover:border-blue-500/40 transition-colors flex items-center gap-1">
                     <Users size={11} /> Trocar
                   </span>
                 </button>

                 {cashRegister?.id && (
                   <span className="text-[10px] bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1 shadow-sm whitespace-nowrap">
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> CAIXA ABERTO
                   </span>
                 )}
              </div>
            </div>

            {/* Mobile Actions Header */}
            <div className="flex items-center gap-1.5 lg:hidden">
              {/* Operator Status Chip - Clickable to switch operator */}
              <button
                type="button"
                onClick={() => setIsSwitchOperatorOpen(true)}
                className="flex items-center bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-2.5 py-1.5 shadow-inner transition active:scale-95 text-left"
                title="Toque para trocar de operador"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span className="text-emerald-400 font-bold text-[11px] truncate max-w-[80px]">
                    {operator?.name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Caixa'}
                  </span>
                </div>
                <div className="w-px h-3 bg-zinc-700 mx-2" />
                <div className="scale-85 origin-left -ml-1">
                  <ConnectionStatus syncState={syncState} />
                </div>
              </button>

              {/* Comandas Button */}
              {isComandasEnabled && (
                <button
                  type="button"
                  onClick={() => { setIsComandasModalOpen(true); setNewComandaBadge(false); }}
                  className={`relative p-2.5 rounded-xl transition shrink-0 active:scale-95 cursor-pointer ${
                    newComandaBadge
                      ? 'text-orange-400 bg-orange-500/15 border border-orange-500/40 shadow-md shadow-orange-500/20 animate-pulse'
                      : openComandas.length > 0
                        ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30 shadow-md shadow-amber-500/10'
                        : 'text-zinc-400 hover:text-amber-400 bg-zinc-900 border border-zinc-800'
                  }`}
                  title={openComandas.length === 0 ? (isPetshopTheme ? "Atendimentos Pet" : "Comandas & Mesas") : (isPetshopTheme ? `Atendimentos (${openComandas.length} aberto(s))` : `Comandas (${openComandas.length} aberta(s))`)}
                >
                  {isPetshopTheme ? <PawPrint size={17} /> : <UtensilsCrossed size={17} />}
                  {openComandas.length > 0 && (
                    <span className={`absolute -top-1 -right-1 font-black text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border border-zinc-950 shadow ${
                      newComandaBadge ? 'bg-orange-500 text-white' : 'bg-amber-500 text-zinc-950'
                    }`}>
                      {openComandas.length}
                    </span>
                  )}
                  {newComandaBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-orange-500 border border-zinc-950 animate-ping opacity-75" />
                  )}
                </button>
              )}

              {/* Menu Hambúrguer de Ações Rápidas Mobile */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2.5 text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl transition active:scale-95 shrink-0 cursor-pointer"
                title="Menu de Ações do PDV"
              >
                <Menu size={18} />
              </button>
            </div>
          </div>

          <div className={`hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0 ${isPetshopTheme ? 'petcare-pos-actions' : ''}`}>
            {/* Badge de conexão */}
            <div className={isPetshopTheme ? 'petcare-pos-connection' : ''}><ConnectionStatus syncState={syncState} /></div>

            {/* Checkbox para selecionar quantidade */}
            {experience !== 'food' && (
              <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-zinc-800/60 hover:border-zinc-700 text-zinc-400 hover:text-white cursor-pointer transition select-none text-xs font-semibold whitespace-nowrap bg-zinc-900/40 ${isPetshopTheme ? 'petcare-pos-toggle' : ''}`}>
                <input type="checkbox" checked={promptQuantity} onChange={e => setPromptQuantity(e.target.checked)} className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950" />
                Selecionar Unidade
              </label>
            )}

            {/* Toggle Modo PC */}
            {experience !== 'food' && (
              <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-zinc-800/60 hover:border-zinc-700 text-zinc-400 hover:text-white cursor-pointer transition select-none text-xs font-semibold whitespace-nowrap bg-zinc-900/40 ${isPetshopTheme ? 'petcare-pos-toggle' : ''}`}>
                <input type="checkbox" checked={forceDesktop} onChange={e => setForceDesktop(e.target.checked)} className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950" />
                Modo PC (Tablet)
              </label>
            )}

            {/* Badge de catálogo offline */}
            {isOfflineCatalog && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-[11px] font-medium whitespace-nowrap ${isPetshopTheme ? 'petcare-pos-cache' : ''}`}>
                <Database size={11} />
                <span>Em cache</span>
              </div>
            )}

            {cashRegister?.id && (
              <button onClick={() => setIsMovementOpen(true)} className={`flex items-center gap-1.5 px-2.5 py-1 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition font-semibold text-xs whitespace-nowrap cursor-pointer ${isPetshopTheme ? 'petcare-pos-action' : ''}`}>
                <ArrowDownUp size={14} /> Sangria / Reposição
              </button>
            )}
            {experience !== 'food' && (isFoodTheme || user?.role === 'admin' || user?.role === 'superadmin') && (
              <button
                onClick={() => navigate(dashboardPath)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition font-semibold text-xs whitespace-nowrap cursor-pointer ${isFoodTheme ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 hover:text-emerald-200' : isPetshopTheme ? 'petcare-pos-action petcare-pos-action--primary' : 'text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10'}`}
                title={dashboardTitle}
              >
                <LayoutDashboard size={14} /> {isFoodTheme ? 'Voltar ao Restaurante' : isPetshopTheme ? 'Painel Pet' : 'Dashboard'}
              </button>
            )}

            <button onClick={async () => { await refreshShift(); setIsCloseRegisterOpen(true); }} className={`flex items-center gap-1.5 px-2.5 py-1 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition font-semibold text-xs whitespace-nowrap cursor-pointer ${isPetshopTheme ? 'petcare-pos-action' : ''}`}>
              <FileText size={14} /> Relatório de Caixa
            </button>
            {experience !== 'food' && (
              <button onClick={handleLogout} className={`flex items-center gap-1.5 px-2.5 py-1 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition font-semibold text-xs whitespace-nowrap cursor-pointer ${isPetshopTheme ? 'petcare-pos-action petcare-pos-action--danger' : ''}`}>
                <LogOut size={14} /> Sair
              </button>
            )}
          </div>
        </div>

        {/* Busca + Botão Scanner Câmera + toggle Unidade (mobile) */}
        <div className="relative mb-2 lg:mb-4 shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 lg:pl-4 flex items-center pointer-events-none">
              <Search size={18} className="text-blue-500" />
            </div>
            <input
              id="product-search-input"
              type="text"
              placeholder="Buscar por nome, código ou EAN..."
              className="w-full py-2.5 lg:py-4 pl-9 lg:pl-12 pr-10 lg:pr-4 text-sm lg:text-2xl font-bold bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-xl lg:rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white placeholder-zinc-500 shadow-inner tracking-tight"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearchKeyPress}
            />
            {/* Botão Câmera Scanner — mobile only */}
            <button
              type="button"
              onClick={() => setIsCameraScannerOpen(true)}
              className="lg:hidden absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-blue-400 transition cursor-pointer active:scale-90"
              title="Ler código com a câmera"
            >
              <Camera size={19} />
            </button>
          </div>
          {/* Compact Unidade toggle — mobile only */}
          <label className="lg:hidden flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-2.5 rounded-xl cursor-pointer select-none shrink-0 transition hover:border-zinc-700">
            <input type="checkbox" checked={promptQuantity} onChange={e => setPromptQuantity(e.target.checked)} className="w-3 h-3 rounded border-zinc-700 bg-zinc-800 text-blue-500" />
            Qtd
          </label>
        </div>


        {/* Grid de Produtos */}
        <div className="flex-1 overflow-y-auto pr-1 lg:pr-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
              <PackageOpen size={48} className="opacity-50 animate-pulse" />
              <p className="text-lg">Carregando catálogo...</p>
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
              <PackageOpen size={48} className="opacity-50" />
              <p className="text-lg text-center">
                {isOfflineCatalog ? 'Sem produtos em cache. Conecte-se à internet para carregar o catálogo.' : 'Nenhum produto encontrado. Tente recarregar!'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4 pb-4">
                {displayedProducts.slice(0, visibleCount).map((product, idx) => (
                  <div key={product.id} className={`group relative transition-all flex flex-col items-center justify-between min-h-[120px] lg:min-h-[160px] overflow-hidden shadow-sm hover:shadow-md ${isPetshopTheme ? 'petcare-product-card' : 'bg-zinc-900 border-2 p-3 rounded-2xl hover:border-blue-500'} ${isPetshopTheme ? (focusedProductIdx === idx ? 'petcare-product-card--focused' : '') : (focusedProductIdx === idx ? 'border-blue-400 ring-2 ring-blue-400/30' : 'border-zinc-800')} ${lastTappedId === product.id ? 'card-tap' : ''}`}>
                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${isPetshopTheme ? 'petcare-product-hover' : 'bg-gradient-to-br from-blue-500/5 to-transparent'}`}></div>
                    <button
                      ref={el => { productRefs.current[idx] = el; }}
                      onClick={() => handleClickProduct(product)}
                      onKeyDown={e => handleProductGridKeyDown(e, idx)}
                      onFocus={() => setFocusedProductIdx(idx)}
                      tabIndex={focusedProductIdx === idx || (focusedProductIdx === -1 && idx === 0) ? 0 : -1}
                      className="w-full flex-1 flex flex-col items-center justify-start z-10 active:scale-95 transition-transform focus:outline-none">
                      {product.isComposite && (
                        <span className="absolute top-3 left-3 bg-indigo-600 border border-indigo-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded shadow-sm z-20 flex items-center gap-1">
                          <Layers size={10} /> {isFoodTheme ? 'Opções' : 'Combo'}
                        </span>
                      )}

                      {product.shortCode && (
                        <span className={`absolute top-3 right-3 bg-zinc-900/80 backdrop-blur-md border border-blue-500/30 text-blue-400 font-extrabold text-[11px] px-2 py-0.5 rounded shadow-sm z-20 ${isPetshopTheme ? 'petcare-product-code' : ''}`}>
                          {product.shortCode}
                        </span>
                      )}
                      
                      {product.imageUrl ? (
                        <div className={`w-full h-20 lg:h-32 mb-3 bg-white border border-zinc-200/20 rounded-xl overflow-hidden flex items-center justify-center p-2.5 shadow-sm group-hover:border-blue-500/40 transition-colors ${isPetshopTheme ? 'petcare-product-art' : ''}`}>
                          {isPetshopTheme && <PawPrint className="petcare-product-paw" size={28} aria-hidden="true" />}
                          <LazyImage src={product.imageUrl} alt={product.name} className={`w-full h-full object-contain ${isPetshopTheme ? 'petcare-product-image' : ''}`} />
                        </div>
                      ) : (
                        <div className={`w-full h-20 lg:h-32 mb-3 bg-zinc-800/40 border border-zinc-800/80 rounded-xl flex flex-col items-center justify-center text-zinc-600 ${isPetshopTheme ? 'petcare-product-art petcare-product-art--empty' : ''}`}>
                          {isPetshopTheme && <PawPrint className="petcare-product-paw" size={28} aria-hidden="true" />}
                          <ShoppingBag size={28} className={`opacity-40 ${isPetshopTheme ? 'petcare-product-placeholder' : ''}`} />
                        </div>
                      )}
                      
                      <span className={`font-semibold text-[1.05rem] text-center leading-snug z-10 line-clamp-2 px-1 mt-auto ${isPetshopTheme ? 'petcare-product-name' : 'text-zinc-100'}`}>{product.name}</span>
                      <span className={`font-bold mt-2 text-xl z-10 ${isPetshopTheme ? 'petcare-product-price' : 'text-blue-400'}`}>R$ {Number(product.priceSell).toFixed(2)}</span>
                    </button>
                    {!product.isComposite && !isFoodTheme && (
                      <div className="w-full hidden lg:flex justify-center gap-1 mt-3 z-20 lg:opacity-0 group-hover:opacity-100 transition-all lg:translate-y-2 group-hover:translate-y-0">
                        {[4, 6, 12, 16, 24].map(qt => (
                          <button key={qt} onClick={(e) => { e.stopPropagation(); triggerTapAnimation(product.id); addItem(product, qt); }}
                            className="bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white font-bold text-xs py-1.5 px-2 rounded-lg transition-colors active:scale-90">
                            +{qt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Sentinela de scroll infinito */}
              {visibleCount < displayedProducts.length && (
                <div
                  className="flex items-center justify-center py-6 pb-[200px] lg:pb-12"
                  ref={el => {
                    if (!el) return;
                    const obs = new IntersectionObserver(([entry]) => {
                      if (entry.isIntersecting) {
                        setVisibleCount(c => Math.min(c + 40, displayedProducts.length));
                      }
                    }, { rootMargin: '200px' });
                    obs.observe(el);
                    // Cleanup via GC — ref element será destruído quando não for mais visível
                  }}
                >
                  <span className="text-xs text-zinc-600">Mostrando {Math.min(visibleCount, displayedProducts.length)} de {displayedProducts.length} produtos</span>
                </div>
              )}
              {visibleCount >= displayedProducts.length && (
                <div className="pb-[200px] lg:pb-12" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Carrinho (direita) */}
      <div className={`fixed inset-0 z-50 flex flex-col bg-zinc-950 transition-transform duration-300 lg:relative lg:z-10 lg:w-[450px] xl:w-[550px] xl:w-[600px] lg:bg-zinc-900/90 lg:backdrop-blur-2xl lg:border-l lg:border-zinc-800 lg:shadow-2xl ${isMobileCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}`}>
        <div className="p-4 lg:p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 lg:bg-transparent">
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-3">
            <ShoppingCart className="text-blue-500" /> Carrinho
          </h2>
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-xs px-3 py-1 rounded-full font-bold">{totalItemsCount} itens</span>
            <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {totalItemsCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <ShoppingCart size={40} className="mb-4 opacity-20" />
              <p>Adicione produtos para vender.</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.cartKey} className="flex flex-col p-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-sm hover:border-zinc-700 transition-colors group">
                <div className="flex gap-4 mb-4">
                  {item.imageUrl && (
                    <div className="w-16 h-16 flex-shrink-0 bg-white/5 rounded-xl flex items-center justify-center p-1.5 border border-white/5">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="flex-1 flex justify-between items-start">
                    <div className="flex-1 pr-3">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-lg text-zinc-100 line-clamp-2 leading-tight">{item.name}</span>
                        {item.fromComanda ? (
                          <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
                            {isPetshopTheme ? `Atendimento #${activeComandaNumber}` : `Mesa #${activeComandaNumber}`}
                          </span>
                        ) : activeComandaId ? (
                          <span className="bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
                            Extra Balcão
                          </span>
                        ) : null}
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.modifiers.map((mod, idx) => (
                            <div key={idx} className="text-[11px] text-indigo-400 font-medium">
                              {mod.groupName}: <span className="text-zinc-300">{mod.optionName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="font-black text-xl text-emerald-400 whitespace-nowrap pl-2">
                      R$ {item.subtotal.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 mt-1">
                  <button
                    onClick={() => {
                      if (item.fromComanda) {
                        requestRemoveComandaItem(item.comandaItemId, 1);
                        return;
                      }
                      updateQuantity(item.cartKey, item.quantity - 1);
                    }}
                    className={`p-4 lg:p-3 hover:bg-zinc-800 transition active:scale-95 ${item.fromComanda ? 'text-zinc-600' : 'text-zinc-400 hover:text-white'}`}
                    title={item.fromComanda ? "Remover uma unidade da comanda com autorização" : "Diminuir"}
                  >
                    <Minus size={22} />
                  </button>
                  <span className="font-black text-2xl w-16 text-center text-white">{item.quantity}</span>
                  <button
                    onClick={() => {
                      if (item.fromComanda) {
                        toast.info(`Para adicionar unidades à Comanda #${activeComandaNumber}, faça um novo lançamento pela tela de Comandas.`);
                        return;
                      }
                      updateQuantity(item.cartKey, item.quantity + 1);
                    }}
                    className={`p-4 lg:p-3 hover:bg-zinc-800 transition active:scale-95 ${item.fromComanda ? 'text-zinc-600' : 'text-zinc-400 hover:text-white'}`}
                    title={item.fromComanda ? "Item de Comanda — inclusão no Salão/Garçom" : "Aumentar"}
                  >
                    <Plus size={22} />
                  </button>
                  <div className="w-px h-8 bg-zinc-800 mx-2"></div>
                  <button
                    onClick={() => {
                      if (item.fromComanda) {
                        requestRemoveComandaItem(item.comandaItemId);
                        return;
                      }
                      removeItem(item.cartKey);
                    }}
                    className={`p-4 lg:p-3 transition flex-1 flex justify-center active:scale-95 ${item.fromComanda ? 'text-zinc-600' : 'hover:bg-red-500/10 text-zinc-500 hover:text-red-400'}`}
                    title={item.fromComanda ? `Item de Comanda #${activeComandaNumber}` : "Remover Item"}
                  >
                    <Trash2 size={22} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-zinc-950 border-t border-zinc-800">
          {isComandasEnabled && (
            <button
              type="button"
              onClick={() => {
                if (items.length > 0) {
                  setInitialOpenComanda(true);
                  setIsPaymentOpen(true);
                } else {
                  setIsComandasModalOpen(true);
                }
              }}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl transition font-bold text-sm cursor-pointer shadow-sm shadow-amber-500/10 active:scale-95"
              title="Atalho: F1"
            >
              {isPetshopTheme ? <PawPrint size={18} /> : <UtensilsCrossed size={18} />}
              {!isPetshopTheme && <span className="hidden lg:inline bg-amber-500/20 text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 font-bold">F1</span>}
              {items.length > 0
                ? (isPetshopTheme ? 'Lançar em Atendimento' : 'Lançar em Comanda / Mesa')
                : (isPetshopTheme ? 'Atendimentos Abertos' : 'Comandas & Mesas Abertas')}
            </button>
          )}

          <div className="flex justify-between items-end mb-6">
            <span className="text-zinc-400 font-medium text-lg">Total</span>
            <span className="text-4xl font-black text-white">R$ {total.toFixed(2)}</span>
          </div>
          <button
            disabled={totalItemsCount === 0 || !cashRegister || isShiftLoading}
            onClick={() => {
              if (!cashRegister) {
                toast.error('Nenhum caixa aberto para realizar vendas. Abra o caixa primeiro.');
                return;
              }
              setInitialOpenComanda(false);
              setIsPaymentOpen(true);
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold py-4 lg:py-5 px-6 rounded-xl lg:rounded-2xl text-xl transition-all shadow-lg active:scale-95 flex justify-between items-center group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
            <span className="z-10"><span className="hidden lg:inline">[F12 ou *]</span> Cobrar</span>
            <span className="z-10 bg-black/20 p-2 rounded-xl text-sm italic">Finalizar</span>
          </button>
        </div>
      </div>

      {/* ── Bottom Sheet Mobile ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
        {/* Backdrop (only when expanded) */}
        {sheetExpanded && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity"
            onClick={() => setSheetExpanded(false)}
          />
        )}

        <div
          className={`relative z-40 bg-zinc-950 border-t-2 border-zinc-800 shadow-2xl transition-all duration-350 ease-out pb-safe ${
            sheetExpanded ? 'max-h-[88dvh]' : totalItemsCount > 0 ? 'max-h-[280px]' : 'max-h-[60px]'
          }`}
          style={{ willChange: 'max-height' }}
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          {/* ── COLLAPSED / SUMMARY BAR (totalmente clicável) ── */}
          {!sheetExpanded && (
            <div
              className="cursor-pointer select-none"
              onClick={() => totalItemsCount > 0 && setSheetExpanded(true)}
            >
              {/* Drag pill */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-zinc-700" />
              </div>

              {totalItemsCount === 0 ? (
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2 text-zinc-500 text-sm">
                    <ShoppingCart size={16} />
                    <span>Carrinho vazio</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Lista rápida de itens: nome + qtd + preço */}
                  <div className="px-4 pt-0 pb-1 space-y-0.5">
                    {items.slice(-4).map(item => (
                      <div key={item.cartKey} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="text-zinc-300 text-xs font-medium truncate flex-1">{item.name}</span>
                        <span className="text-zinc-500 text-xs shrink-0">×{item.quantity}</span>
                        <span className="text-emerald-400 text-xs font-bold shrink-0 ml-1">
                          R$ {item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                    {items.length > 4 && (
                      <div className="text-[10px] text-zinc-500 font-medium">
                        + {items.length - 4} {items.length - 4 === 1 ? 'item' : 'itens'}…
                      </div>
                    )}
                  </div>

                  {/* Linha divisória */}
                  <div className="mx-4 border-t border-zinc-800 mb-1" />

                  {/* Footer: avatares + total + cobrar */}
                  <div className="flex items-center gap-3 px-4 pb-3">
                    {/* Avatars dos últimos 3 produtos */}
                    <div className="flex -space-x-2 shrink-0">
                      {items.slice(-3).map((item, i) => (
                        <div key={item.cartKey} className="w-8 h-8 rounded-full bg-white border-2 border-zinc-900 overflow-hidden flex items-center justify-center" style={{ zIndex: 3 - i }}>
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                            : <ShoppingCart size={12} className="text-zinc-500" />
                          }
                        </div>
                      ))}
                    </div>

                    {/* Contagem + total */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[10px] text-zinc-400 font-medium ${badgeBounce ? 'badge-bounce' : ''}`}>
                        {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'itens'}
                      </div>
                      <div className="text-white font-black text-base leading-tight">
                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Botão COBRAR */}
                    <button
                      onClick={e => { e.stopPropagation(); setInitialOpenComanda(false); setIsPaymentOpen(true); }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm py-2.5 px-5 rounded-xl shadow-lg active:scale-95 transition-transform shrink-0"
                    >
                      COBRAR
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── EXPANDED: premium card list ── */}
          {sheetExpanded && (
            <div className="flex flex-col" style={{ maxHeight: '88dvh' }}>

              {/* Header do carrinho expandido */}
              <div
                className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-zinc-800"
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart size={18} className="text-blue-400" />
                  <span className="text-white font-bold text-base">Seu Pedido</span>
                  <span className="text-xs bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">{totalItemsCount}</span>
                </div>
                <div className="flex items-center gap-3">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Deseja limpar todos os itens do carrinho?')) {
                          clearCart();
                        }
                      }}
                      className="px-2.5 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg font-semibold transition active:scale-95 flex items-center gap-1"
                    >
                      <Trash2 size={13} /> Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSheetExpanded(false)}
                    className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 rounded-lg border border-zinc-800 transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Lista de itens com imagens */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5 custom-scrollbar" style={{ maxHeight: 'calc(88dvh - 145px)' }}>
                {items.map(item => (
                  <div key={item.cartKey} className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-sm">
                    {/* Imagem do produto */}
                    <div className="w-14 h-14 rounded-xl bg-white overflow-hidden flex items-center justify-center shrink-0 border border-zinc-800/40">
                      {item.imageUrl
                        ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        : <ShoppingCart size={20} className="text-zinc-400" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-white line-clamp-2 leading-tight">{item.name}</span>
                        {item.fromComanda ? (
                          <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0">
                            #{activeComandaNumber}
                          </span>
                        ) : activeComandaId ? (
                          <span className="bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0">
                            Extra
                          </span>
                        ) : null}
                      </div>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="text-[10px] text-indigo-400 font-medium mt-0.5 line-clamp-1">
                          {item.modifiers.map((m: any) => m.optionName).join(', ')}
                        </div>
                      )}
                      <div className="text-emerald-400 font-black text-base mt-0.5">
                        R$ {item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Controles de quantidade com hitboxes confortáveis */}
                    <div className="flex items-center gap-1 shrink-0 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                      <button
                        onClick={() => {
                          if (item.fromComanda) {
                            requestRemoveComandaItem(item.comandaItemId, 1);
                            return;
                          }
                          updateQuantity(item.cartKey, item.quantity - 1);
                        }}
                        className={`w-8 h-8 flex items-center justify-center bg-zinc-900 rounded-lg transition active:scale-90 ${item.fromComanda ? 'text-zinc-600' : 'hover:bg-zinc-800 text-zinc-300 hover:text-white'}`}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="font-bold text-sm text-white w-7 text-center">{item.quantity}</span>
                      <button
                        onClick={() => {
                          if (item.fromComanda) {
                            toast.info(`Para adicionar unidades à Comanda #${activeComandaNumber}, faça um novo lançamento pela tela de Comandas.`);
                            return;
                          }
                          updateQuantity(item.cartKey, item.quantity + 1);
                        }}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90 ${item.fromComanda ? 'bg-zinc-900 text-zinc-600' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Remover */}
                    <button
                      onClick={() => {
                        if (item.fromComanda) {
                          requestRemoveComandaItem(item.comandaItemId);
                          return;
                        }
                        removeItem(item.cartKey);
                      }}
                      className={`w-9 h-9 flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-xl transition shrink-0 active:scale-90 ${item.fromComanda ? 'text-zinc-700' : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'}`}
                      title={item.fromComanda ? `Item de Comanda #${activeComandaNumber}` : "Remover Item"}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Footer com total e cobrar */}
              <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950">
                {isComandasEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      if (items.length > 0) {
                        setInitialOpenComanda(true);
                        setIsPaymentOpen(true);
                      } else {
                        setIsComandasModalOpen(true);
                      }
                    }}
                    className="w-full mb-3 flex items-center justify-center gap-2 py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl transition font-bold text-sm cursor-pointer active:scale-95"
                  >
                    {isPetshopTheme ? <PawPrint size={16} /> : <UtensilsCrossed size={16} />}
                    {items.length > 0
                      ? (isPetshopTheme ? 'Lançar em Atendimento' : 'Lançar em Comanda / Mesa')
                      : (isPetshopTheme ? 'Atendimentos Abertos' : 'Comandas & Mesas Abertas')}
                  </button>
                )}
                <div className="flex justify-between items-center mb-3">
                  <span className="text-zinc-400 font-medium">Total</span>
                  <span className="text-2xl font-black text-white">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <button
                  disabled={totalItemsCount === 0 || !cashRegister || isShiftLoading}
                  onClick={() => {
                    if (!cashRegister) {
                      toast.error('Nenhum caixa aberto para realizar vendas. Abra o caixa primeiro.');
                      return;
                    }
                    setInitialOpenComanda(false);
                    setIsPaymentOpen(true);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black py-4 px-4 rounded-2xl text-lg transition-all shadow-lg active:scale-95 flex justify-center items-center gap-2 cursor-pointer"
                >
                  <ShoppingCart size={20} />
                  Cobrar — R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ GAVETA / DRAWER DE AÇÕES RÁPIDAS MOBILE ═══ */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            className="fixed bottom-0 inset-x-0 z-[70] lg:hidden bg-zinc-900 border-t border-zinc-800 rounded-t-[2rem] p-5 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.2rem)' }}
          >
            {/* Handle do topo */}
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />

            {/* Operador Card */}
            <div className="flex items-center justify-between p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20 flex items-center justify-center font-black text-sm">
                  {operator?.name?.substring(0, 2).toUpperCase() || 'OP'}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{operator?.name || user?.name || 'Operador'}</p>
                  <p className="text-zinc-500 text-xs">{operator?.role || 'Operador de Caixa'} · {user?.tenant || ''}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsMobileMenuOpen(false); setIsSwitchOperatorOpen(true); }}
                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                Trocar
              </button>
            </div>

            {/* Grid de Ações Rápidas */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {cashRegister?.id && (
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); setIsMovementOpen(true); }}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs active:scale-95 transition cursor-pointer text-left"
                >
                  <ArrowDownUp size={18} />
                  <span>Sangria / Suprimento</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await refreshShift();
                  setIsCloseRegisterOpen(true);
                }}
                className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-xs active:scale-95 transition cursor-pointer text-left"
              >
                <FileText size={18} />
                <span>Relatório de Caixa</span>
              </button>

              {isComandasEnabled && (
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); setIsComandasModalOpen(true); }}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold text-xs active:scale-95 transition cursor-pointer text-left"
                >
                  <UtensilsCrossed size={18} />
                  <span>Comandas ({openComandas.length})</span>
                </button>
              )}

              {modules?.nfce !== false && (
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); setIsExportXmlOpen(true); }}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs active:scale-95 transition cursor-pointer text-left"
                >
                  <Download size={18} />
                  <span>Exportar XML</span>
                </button>
              )}

              {(user?.role === 'admin' || user?.role === 'superadmin') && (
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); navigate(dashboardPath); }}
                  className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-xs active:scale-95 transition cursor-pointer text-left"
                >
                  <LayoutDashboard size={18} />
                  <span>{isFoodTheme ? 'Restaurante' : isPetshopTheme ? 'Painel Pet' : 'Painel Dashboard'}</span>
                </button>
              )}
            </div>

            {/* Toggles Rápidos */}
            <div className="p-3.5 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3 mb-4">
              <label className="flex items-center justify-between text-xs text-zinc-300 font-semibold cursor-pointer select-none">
                <span>Modo PC / Tablet</span>
                <input
                  type="checkbox"
                  checked={forceDesktop}
                  onChange={e => setForceDesktop(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500"
                />
              </label>
              <div className="border-t border-zinc-800/80" />
              <label className="flex items-center justify-between text-xs text-zinc-300 font-semibold cursor-pointer select-none">
                <span>Sempre perguntar quantidade</span>
                <input
                  type="checkbox"
                  checked={promptQuantity}
                  onChange={e => setPromptQuantity(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* Ações de Fechamento / Logout */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex-1 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs active:scale-95 transition cursor-pointer"
              >
                Fechar Menu
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold text-xs active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut size={16} /> Sair da Conta
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modais de Operador e Turno */}
      {(!operator || needsOperatorReauth) && (
        <OperatorLoginModal 
          returnPath={isFoodTheme ? '/restaurante/hoje' : undefined}
          onSuccess={() => {}} 
          isReauth={needsOperatorReauth}
        />
      )}

      {isSwitchOperatorOpen && (
        <OperatorLoginModal 
          returnPath={isFoodTheme ? '/restaurante/hoje' : undefined}
          onSuccess={() => setIsSwitchOperatorOpen(false)} 
          onClose={() => setIsSwitchOperatorOpen(false)}
        />
      )}
      
      {/* Abertura de Caixa: SOMENTE quando o operador estiver logado e o servidor CONFIRMAR expressamente que NÃO há caixa aberto */}
      {operator && !cashRegister && registerStatus === 'closed_confirmed' && (
        <OpenShiftModal onSuccess={() => {}} />
      )}


      {/* Aviso em caso de falha de conexão na verificação do caixa (impede indução a abertura de caixa duplicado) */}
      {registerStatus === 'query_failed' && operator && !cashRegister && (
        <div className="fixed bottom-5 right-5 bg-amber-950/95 border border-amber-600/80 text-amber-200 px-4 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-3 text-sm backdrop-blur-md">
          <span className="font-medium">⚠️ Instabilidade ao consultar o caixa do operador.</span>
          <button
            onClick={() => void refreshShift(operator.id)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition shadow"
          >
            Tentar novamente
          </button>
        </div>
      )}



      {/* Modais Secundários */}
      {isCloseRegisterOpen && (
        <CloseRegisterModal
          isOpen={isCloseRegisterOpen}
          registerId={cashRegister?.id}
          isPetshopTheme={isPetshopTheme}
          isFoodTheme={isFoodTheme}
          onClose={async (closed) => { 
            setIsCloseRegisterOpen(false); 
            if (closed) {
              await refreshShift();
              logoutOperator();
            }
          }}
        />
      )}

      {/* Scanner de Código de Barras via Câmera */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraScan}
      />

      {/* Exportação de XML de Notas Fiscais */}
      <ExportXmlModal
        isOpen={isExportXmlOpen}
        onClose={() => setIsExportXmlOpen(false)}
      />

      <PaymentModal
        experience={experience}
        isOpen={isPaymentOpen}
        initialOpenComanda={initialOpenComanda}
        onClose={() => {
          setIsPaymentOpen(false);
          setInitialOpenComanda(false);
          setSheetExpanded(false);
          if (!('ontouchstart' in window)) {
            let checks = 0;
            const interval = setInterval(() => {
              const input = document.getElementById('product-search-input');
              if (input) input.focus();
              checks++;
              if (checks > 10) clearInterval(interval);
            }, 50);
          }
        }}
        isOnline={syncState.isOnline}
        onPendingCountChange={syncState.syncNow}
        tenantConfig={tenantConfig}
        onSuccess={loadProducts}
      />
      {cashRegister?.id && (
        <CashMovementModal
          isOpen={isMovementOpen}
          registerId={cashRegister.id}
          onClose={() => setIsMovementOpen(false)}
        />
      )}

      <CompositeModifierModal
        product={compositeProduct as any}
        isOpen={!!compositeProduct}
        onClose={() => setCompositeProduct(null)}
        onConfirm={(product, selectedModifiers) => {
          const modifiers: CartItemModifier[] = selectedModifiers.map(({ group, option }) => ({
            groupId: group.id,
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            componentProductId: option.componentProductId,
            quantity: Number(option.quantity || 1),
            priceAdjustment: Number(option.priceAdjustment || 0),
          }));
          addItem(product as any, 1, modifiers);
          setCompositeProduct(null);
        }}
      />

      {/* Modal de Quantidade */}
      {productToSetQuantity && (
        <div className="fixed inset-0 z-[100] flex items-start pt-[20dvh] justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col mb-auto">
            <h3 className="text-xl font-bold text-white mb-2 text-center line-clamp-2">{productToSetQuantity.name}</h3>
            <p className="text-zinc-400 mb-6 text-sm text-center">Informe a quantidade desejada:</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              if (tempQuantity > 0) {
                addItem(productToSetQuantity, tempQuantity);
                setProductToSetQuantity(null);
                setTempQuantity(1);
                setTimeout(() => {
                  if (!('ontouchstart' in window)) {
                    (document.querySelector('input[type="text"]') as HTMLInputElement)?.focus();
                  }
                }, 10);
              }
            }}>
              <input
                type="number"
                inputMode="decimal"
                min="0.001"
                step="any"
                autoFocus
                value={tempQuantity === 0 ? '' : tempQuantity}
                onChange={(e) => setTempQuantity(Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="w-full text-center text-4xl font-black bg-zinc-950 border border-zinc-800 rounded-2xl py-6 text-blue-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 mb-6 shadow-inner"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => { 
                  setProductToSetQuantity(null); 
                  setTimeout(() => {
                    if (!('ontouchstart' in window)) {
                      (document.querySelector('input[type="text"]') as HTMLInputElement)?.focus();
                    }
                  }, 10); 
                }} className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition text-lg active:scale-95">
                  Cancelar
                </button>
                <button type="submit" disabled={tempQuantity <= 0} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:text-white/50 text-white font-bold rounded-xl transition text-lg active:scale-95 shadow-lg shadow-blue-500/20">
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isComandasModalOpen && (
        <ComandaWorkspaceModal
          isPetshopTheme={isPetshopTheme}
          isFoodTheme={isFoodTheme}
          selectedId={selectedComandaId}
          initialRemoveItemId={pendingRemoveComandaItemId}
          initialRemoveQuantity={pendingRemoveComandaQuantity}
          onSelect={setSelectedComandaId}
          onClose={() => { setIsComandasModalOpen(false); setPendingRemoveComandaItemId(null); setPendingRemoveComandaQuantity(null); }}
          onCharge={handleChargeComandaFromPos}
          onUpdated={updated => setOpenComandas(list => list.map(c => c.id === updated.id ? updated : c))}
        />
      )}
    </div>
  );
}

export function PosPage({ experience }: { experience?: 'food' }) {
  return <PosPageContent experience={experience} />;
}


