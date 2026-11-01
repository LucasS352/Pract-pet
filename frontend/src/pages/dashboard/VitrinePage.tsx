import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { getFullUrl } from '@/lib/getFullUrl';
import { toast } from 'sonner';
import {
  Tv2, Power, GripVertical, X, Plus, Search,
  Copy, Check, RefreshCw, Eye, Tag, ExternalLink,
  LayoutGrid, Clock, Edit3, Sparkles
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface VitrineSlide {
  slideType?: 'single';
  productId: string;
  productName: string;
  imageUrl: string | null;
  priceSell: number;
  promoPrice: number | null;
  badge: string | null;
  duration?: number;
  order: number;
}

interface GridProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  priceSell: number;
  promoPrice: number | null;
}

interface VitrineGridSlide {
  slideType: 'grid';
  gridId: string;
  order: number;
  gridTitle: string;
  gridSubtitle?: string;
  gridEmoji?: string;
  gridBadge?: string | null;
  duration?: number;
  gridProducts: GridProduct[];
}

type AnyVitrineSlide = VitrineSlide | VitrineGridSlide;

interface VitrineConfig {
  active: boolean;
  version: number;
  publishedAt: string | null;
  publishedByName: string | null;
  draftUpdatedAt: string | null;
  theme: string;
  customBgUrl: string | null;
  showLogo: boolean;
  logoPosition: string;
  instagramHandle?: string | null;
  slideDuration: number;
  gridSlideDuration?: number;
  draftSlides: AnyVitrineSlide[];
  publishedSlides: AnyVitrineSlide[];
}

interface Product {
  id: string;
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  priceSell: number;
  imageUrl: string | null;
  active: boolean;
}

// ─── Temas ────────────────────────────────────────────────────────────────────
const THEMES = [
  { slug: 'dark_premium',    emoji: '✨', name: 'Dark Premium',  bg: 'radial-gradient(ellipse at 20% 50%, #1a1200, #0a0a0a)' },
  { slug: 'neon_night',      emoji: '🌃', name: 'Neon Night',    bg: 'linear-gradient(135deg, #0a0015, #05001a)' },
  { slug: 'gradient_sunset', emoji: '🌅', name: 'Sunset',        bg: 'linear-gradient(135deg, #1a0533, #c0392b, #e67e22)' },
  { slug: 'gradient_ocean',  emoji: '🌊', name: 'Ocean',         bg: 'linear-gradient(135deg, #000d1a, #006994, #00b4d8)' },
  { slug: 'light_clean',     emoji: '💡', name: 'Clean Light',   bg: 'linear-gradient(135deg, #f8f9fa, #dee2e6)' },
  { slug: 'dark_glass',      emoji: '🪟', name: 'Glassmorphism', bg: 'linear-gradient(135deg, #0d0d0d, #1a1a2e)' },
  { slug: 'forest_green',    emoji: '🌿', name: 'Forest',        bg: 'linear-gradient(135deg, #0a1a0a, #1a3a1a)' },
  { slug: 'fire_red',        emoji: '🔥', name: 'Fire',          bg: 'linear-gradient(135deg, #1a0000, #c0392b)' },
  { slug: 'purple_luxury',   emoji: '💜', name: 'Luxury',        bg: 'linear-gradient(135deg, #0d0010, #4a0080)' },
  { slug: 'carbon_fiber',    emoji: '⬛', name: 'Carbon',        bg: 'repeating-linear-gradient(45deg, #0a0a0a 0px 2px, #111 2px 4px)' },
];

const BADGES = ['OFERTA', 'NOVO', 'DESTAQUE', 'LANÇAMENTO', 'IMPERDÍVEL', 'SUPER PROMO'];
const SUBTITLE_PRESETS = ['• SELEÇÃO ESPECIAL •', '• OFERTAS DA SEMANA •', '• CATEGORIA EM DESTAQUE •', '• COMBOS & PROMOÇÕES •', '• LANÇAMENTOS •', '• LINHA PREMIUM •'];

function formatPrice(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function VitrinePage() {
  const { user } = useAuthStore();
  const [config, setConfig] = useState<VitrineConfig | null>(null);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingSlide, setEditingSlide] = useState<string | null>(null); // productId sendo editado inline
  const [previewIndex, setPreviewIndex] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ── Modal de Grade por Categoria ─────────────────────────────────────────────
  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [editingGridSlideId, setEditingGridSlideId] = useState<string | null>(null);
  const [gridTitle, setGridTitle] = useState('');
  const [gridSubtitle, setGridSubtitle] = useState('• SELEÇÃO ESPECIAL •');
  const [gridBadge, setGridBadge] = useState<string | null>('OFERTA');
  const [gridDuration, setGridDuration] = useState(15);
  const [gridSelectedProducts, setGridSelectedProducts] = useState<GridProduct[]>([]);
  const [gridSearch, setGridSearch] = useState('');

  // ── Carregar dados iniciais ─────────────────────────────────────────────────
  const loadInitialData = useCallback(async () => {
    try {
      const [vitrine, tenant, prods] = await Promise.all([
        api.get('/vitrine/config'),
        api.get('/tenants/me'),
        api.get('/products?limit=5000'),
      ]);
      setConfig(vitrine.data);
      setTenantInfo(tenant.data);
      const prodList: Product[] = (prods.data?.data || prods.data || [])
        .filter((p: any) => p.active !== false)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setProducts(prodList);
    } catch (err) {
      console.error('Erro ao carregar dados da vitrine:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ── Recarregar catálogo manualmente ─────────────────────────────────────────
  async function refreshCatalog() {
    setRefreshingProducts(true);
    try {
      const prods = await api.get('/products?limit=5000');
      const prodList: Product[] = (prods.data?.data || prods.data || [])
        .filter((p: any) => p.active !== false)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setProducts(prodList);
      toast.success('Catálogo atualizado com sucesso!');
    } catch (err) {
      console.error('Erro ao atualizar produtos:', err);
      toast.error('Erro ao atualizar catálogo de produtos.');
    } finally {
      setRefreshingProducts(false);
    }
  }

  // ── Busca dinâmica no backend (garante produtos recém-criados e buscas amplas) ─
  useEffect(() => {
    const term = (search || gridSearch).trim();
    if (term.length < 2) return;

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: term, limit: 100 } });
        const found: Product[] = (res.data?.data || res.data || [])
          .filter((p: any) => p.active !== false);

        if (found.length > 0) {
          setProducts(prev => {
            const map = new Map(prev.map(p => [p.id, p]));
            found.forEach(p => map.set(p.id, p));
            return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
          });
        }
      } catch (e) {
        console.error('Erro ao buscar produtos no backend:', e);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, gridSearch]);

  const tvPublicId = tenantInfo?.tvPublicId;
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const tvUrl = tvPublicId
    ? `${window.location.origin}/vitrine/${tvPublicId}`
    : null;

  const draftSlides: AnyVitrineSlide[] = config?.draftSlides || [];

  // ── Produtos disponíveis para adicionar como slide individual ────────────────
  const addedSingleProductIds = new Set(
    draftSlides
      .filter((s): s is VitrineSlide => s.slideType !== 'grid')
      .map(s => s.productId)
  );
  const searchNorm = normalizeText(search);
  const availableProducts = products.filter(p => {
    if (addedSingleProductIds.has(p.id)) return false;
    if (!searchNorm) return true;
    const nameNorm = normalizeText(p.name);
    const codeNorm = normalizeText(p.shortCode || '');
    const barcode = p.barcode || '';
    return nameNorm.includes(searchNorm) || codeNorm.includes(searchNorm) || barcode.includes(search.trim());
  });

  // ── Produtos disponíveis para adicionar na grade de categorias ──────────────
  const gridSearchNorm = normalizeText(gridSearch);
  const availableGridProducts = products.filter(p => {
    if (gridSelectedProducts.some(gp => gp.productId === p.id)) return false;
    if (!gridSearchNorm) return true;
    const nameNorm = normalizeText(p.name);
    const codeNorm = normalizeText(p.shortCode || '');
    const barcode = p.barcode || '';
    return nameNorm.includes(gridSearchNorm) || codeNorm.includes(gridSearchNorm) || barcode.includes(gridSearch.trim());
  });

  // ── Auto-salvar rascunho (debounced) ─────────────────────────────────────────
  const saveDraftDebounced = useCallback(
    debounce(async (slides: AnyVitrineSlide[], partial: Partial<VitrineConfig>) => {
      setSavingDraft(true);
      try {
        const res = await api.patch('/vitrine/draft', { draftSlides: slides, ...partial });
        setConfig(prev => prev ? { ...prev, ...res.data } : res.data);
      } catch (e) {
        console.error('Erro ao salvar rascunho:', e);
      } finally {
        setSavingDraft(false);
      }
    }, 800),
    []
  );

  function updateDraft(newSlides: AnyVitrineSlide[], partial: Partial<VitrineConfig> = {}) {
    setConfig(prev => {
      if (!prev) return prev;
      const updated = { ...prev, draftSlides: newSlides, ...partial };
      saveDraftDebounced(newSlides, {
        theme: updated.theme,
        customBgUrl: updated.customBgUrl,
        showLogo: updated.showLogo,
        logoPosition: updated.logoPosition,
        instagramHandle: updated.instagramHandle,
        slideDuration: updated.slideDuration,
        gridSlideDuration: updated.gridSlideDuration,
        ...partial,
      });
      return updated;
    });
    setHasUnsavedChanges(true);
  }

  // ── Adicionar produto individual à vitrine ───────────────────────────────────
  function addProduct(p: Product) {
    const newSlide: VitrineSlide = {
      slideType: 'single',
      productId: p.id,
      productName: p.name,
      imageUrl: p.imageUrl,
      priceSell: Number(p.priceSell),
      promoPrice: null,
      badge: null,
      order: draftSlides.length + 1,
    };
    updateDraft([...draftSlides, newSlide]);
    toast.success(`"${p.name}" adicionado à vitrine!`);
  }

  // ── Abrir modal para Criar Grade ─────────────────────────────────────────────
  function openCreateGridModal() {
    setEditingGridSlideId(null);
    setGridTitle('');
    setGridSubtitle('• SELEÇÃO ESPECIAL •');
    setGridBadge('OFERTA');
    setGridDuration(config?.gridSlideDuration || 15);
    setGridSelectedProducts([]);
    setGridSearch('');
    setIsGridModalOpen(true);
  }

  // ── Abrir modal para Editar Grade ────────────────────────────────────────────
  function openEditGridModal(gridSlide: VitrineGridSlide) {
    setEditingGridSlideId(gridSlide.gridId);
    setGridTitle(gridSlide.gridTitle);
    setGridSubtitle(gridSlide.gridSubtitle || '• SELEÇÃO ESPECIAL •');
    setGridBadge(gridSlide.gridBadge || null);
    setGridDuration(gridSlide.duration || config?.gridSlideDuration || 15);
    setGridSelectedProducts([...gridSlide.gridProducts]);
    setGridSearch('');
    setIsGridModalOpen(true);
  }

  // ── Salvar Grade ─────────────────────────────────────────────────────────────
  function handleSaveGridSlide() {
    if (!gridTitle.trim()) {
      toast.error('Informe o título da categoria (ex: Salgadinhos, Cervejas).');
      return;
    }
    if (gridSelectedProducts.length < 2) {
      toast.error('Adicione pelo menos 2 produtos na grade (máximo 6).');
      return;
    }

    if (editingGridSlideId) {
      // Atualizar existente
      const updated = draftSlides.map(s => {
        if (s.slideType === 'grid' && s.gridId === editingGridSlideId) {
          return {
            ...s,
            gridTitle: gridTitle.trim(),
            gridSubtitle: gridSubtitle.trim() || undefined,
            gridBadge,
            duration: gridDuration,
            gridProducts: gridSelectedProducts,
          };
        }
        return s;
      });
      updateDraft(updated);
      toast.success('Grade atualizada com sucesso!');
    } else {
      // Criar novo slide de grade
      const newGridSlide: VitrineGridSlide = {
        slideType: 'grid',
        gridId: 'grid_' + Math.random().toString(36).substring(2, 9),
        order: draftSlides.length + 1,
        gridTitle: gridTitle.trim(),
        gridSubtitle: gridSubtitle.trim() || undefined,
        gridBadge,
        duration: gridDuration,
        gridProducts: gridSelectedProducts,
      };
      updateDraft([...draftSlides, newGridSlide]);
      toast.success('Slide de grade criado!');
    }

    setIsGridModalOpen(false);
  }

  // ── Adicionar produto à grade no modal ───────────────────────────────────────
  function addProductToGrid(p: Product) {
    if (gridSelectedProducts.length >= 6) {
      toast.warning('Limite máximo de 6 produtos por grade atingido.');
      return;
    }
    if (gridSelectedProducts.some(gp => gp.productId === p.id)) {
      toast.info('Este produto já está na grade.');
      return;
    }
    setGridSelectedProducts(prev => [
      ...prev,
      {
        productId: p.id,
        productName: p.name,
        imageUrl: p.imageUrl,
        priceSell: Number(p.priceSell),
        promoPrice: null,
      },
    ]);
  }

  // ── Remover produto da grade no modal ────────────────────────────────────────
  function removeProductFromGrid(productId: string) {
    setGridSelectedProducts(prev => prev.filter(p => p.productId !== productId));
  }

  // ── Atualizar preço promocional de produto na grade ──────────────────────────
  function updateGridProductPromoPrice(productId: string, promoPrice: number | null) {
    setGridSelectedProducts(prev =>
      prev.map(p => (p.productId === productId ? { ...p, promoPrice } : p))
    );
  }

  // ── Remover slide da vitrine ─────────────────────────────────────────────────
  function removeSlide(slideKey: string) {
    const newSlides = draftSlides
      .filter(s => {
        if (s.slideType === 'grid') return s.gridId !== slideKey;
        return s.productId !== slideKey;
      })
      .map((s, i) => ({ ...s, order: i + 1 }));
    updateDraft(newSlides);
    if (editingSlide === slideKey) setEditingSlide(null);
  }

  // ── Atualizar slide individual ───────────────────────────────────────────────
  function updateSingleSlide(productId: string, patch: Partial<VitrineSlide>) {
    const newSlides = draftSlides.map(s =>
      s.slideType !== 'grid' && s.productId === productId ? { ...s, ...patch } : s
    );
    updateDraft(newSlides);
  }

  // ── Mover slide ────────────────────────────────────────────────────────────
  function moveSlide(index: number, direction: -1 | 1) {
    const newSlides = [...draftSlides];
    const target = index + direction;
    if (target < 0 || target >= newSlides.length) return;
    [newSlides[index], newSlides[target]] = [newSlides[target], newSlides[index]];
    updateDraft(newSlides.map((s, i) => ({ ...s, order: i + 1 })));
  }

  // ── Alterar tema ───────────────────────────────────────────────────────────
  function setTheme(theme: string) {
    updateDraft(draftSlides, { theme });
  }

  // ── Alterar duração ────────────────────────────────────────────────────────
  function setSlideDuration(v: number) {
    updateDraft(draftSlides, { slideDuration: v });
  }

  function setGridSlideDuration(v: number) {
    updateDraft(draftSlides, { gridSlideDuration: v });
  }

  // ── Toggle ativo ──────────────────────────────────────────────────────────
  async function toggleActive() {
    if (!config) return;
    try {
      const res = await api.patch('/vitrine/active', { active: !config.active });
      setConfig(prev => prev ? { ...prev, active: res.data.active } : prev);
      toast.success(res.data.active ? '📺 Vitrine ativada!' : 'Vitrine pausada.');
    } catch {
      toast.error('Erro ao alterar status da vitrine.');
    }
  }

  // ── Publicar na TV ────────────────────────────────────────────────────────
  async function publish() {
    if (draftSlides.length === 0) {
      toast.error('Adicione pelo menos um slide antes de publicar.');
      return;
    }
    setPublishing(true);
    try {
      await api.patch('/vitrine/draft', {
        draftSlides,
        theme: config?.theme,
        customBgUrl: config?.customBgUrl,
        showLogo: config?.showLogo,
        logoPosition: config?.logoPosition,
        instagramHandle: config?.instagramHandle,
        slideDuration: config?.slideDuration,
        gridSlideDuration: config?.gridSlideDuration,
      });
      const res = await api.post('/vitrine/publish');
      setConfig(prev => prev ? { ...prev, ...res.data } : res.data);
      setHasUnsavedChanges(false);
      toast.success(`✅ Publicado na TV! Versão ${res.data.version}`);
    } catch {
      toast.error('Erro ao publicar. Tente novamente.');
    } finally {
      setPublishing(false);
    }
  }

  // ── Copiar URL ─────────────────────────────────────────────────────────────
  async function copyUrl() {
    if (!tvUrl) return;
    await navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 animate-pulse text-lg">Carregando Vitrine Digital...</div>
      </div>
    );
  }

  const currentTheme = THEMES.find(t => t.slug === (config?.theme || 'dark_premium')) || THEMES[0];
  const previewSlide = draftSlides[previewIndex % Math.max(1, draftSlides.length)];

  // ── Verificar se rascunho difere do publicado ──────────────────────────────
  const draftDiffersFromPublished =
    JSON.stringify(draftSlides) !== JSON.stringify(config?.publishedSlides || []) ||
    hasUnsavedChanges;

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Tv2 size={22} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Vitrine Digital</h1>
            <p className="text-zinc-500 text-sm">Promoções e categorias exibidas na sua TV em tempo real</p>
          </div>
        </div>

        {/* Toggle ativo */}
        <button
          onClick={toggleActive}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all border ${
            config?.active
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          <Power size={16} />
          {config?.active ? '● Vitrine ATIVA' : '○ Vitrine PAUSADA'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">

        {/* ── COLUNA ESQUERDA: Slides ── */}
        <div className="space-y-4">

          {/* Barra de Ações: Adicionar Individual ou Criar Grade */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-violet-400" />
                <span className="font-semibold text-zinc-200 text-sm">Adicionar aos Slides</span>
                <button
                  type="button"
                  onClick={refreshCatalog}
                  disabled={refreshingProducts}
                  className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
                  title="Atualizar catálogo de produtos"
                >
                  <RefreshCw size={13} className={refreshingProducts ? 'animate-spin text-violet-400' : ''} />
                </button>
              </div>
              <button
                onClick={openCreateGridModal}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition-all cursor-pointer"
              >
                <LayoutGrid size={14} /> + Criar Grade por Categoria (até 6)
              </button>
            </div>

            {/* Busca para adicionar produto individual */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar produto para adicionar como slide individual..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-8 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
                  title="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {search && (
              <div className="max-h-52 overflow-y-auto space-y-1 mt-2 custom-scrollbar">
                {availableProducts.slice(0, 12).map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800 transition-colors text-left group cursor-pointer"
                  >
                    {p.imageUrl ? (
                      <img src={getFullUrl(p.imageUrl)} alt={p.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-700 flex items-center justify-center text-lg flex-shrink-0">🍺</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500">R$ {formatPrice(p.priceSell)}</div>
                    </div>
                    <Plus size={14} className="text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                ))}
                {availableProducts.length === 0 && (
                  <div className="text-center text-zinc-600 text-sm py-4">Nenhum produto encontrado</div>
                )}
              </div>
            )}
          </div>

          {/* Lista de slides */}
          <div className="space-y-2.5">
            {draftSlides.length === 0 ? (
              <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">📺</div>
                <div className="text-zinc-400 font-semibold text-sm">Nenhum slide na vitrine ainda.</div>
                <div className="text-zinc-600 text-xs mt-1">
                  Adicione produtos individuais pela busca acima ou clique em <strong>+ Criar Grade por Categoria</strong>.
                </div>
              </div>
            ) : (
              draftSlides.map((slide, idx) => {
                const isGrid = slide.slideType === 'grid';
                const slideKey = isGrid ? slide.gridId : slide.productId;

                if (isGrid) {
                  const gridSlide = slide as VitrineGridSlide;
                  return (
                    <div key={slideKey} className="bg-zinc-900 border border-indigo-500/30 rounded-2xl p-3.5 hover:border-indigo-500/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Handle de ordem */}
                        <div className="flex flex-col gap-1">
                          <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors cursor-pointer">
                            <GripVertical size={16} className="-rotate-90" />
                          </button>
                          <button onClick={() => moveSlide(idx, 1)} disabled={idx === draftSlides.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors cursor-pointer">
                            <GripVertical size={16} className="rotate-90" />
                          </button>
                        </div>

                        {/* Número do slide */}
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-400 flex-shrink-0">
                          {idx + 1}
                        </div>

                        {/* Ícone vetorial da grade */}
                        <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                          <LayoutGrid size={20} />
                        </div>

                        {/* Info da grade */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] uppercase font-extrabold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md tracking-wider">GRADE</span>
                            <span className="font-bold text-sm text-zinc-100 truncate">{gridSlide.gridTitle}</span>
                            {gridSlide.gridSubtitle && (
                              <span className="text-[10px] font-semibold text-zinc-400">{gridSlide.gridSubtitle}</span>
                            )}
                            {gridSlide.gridBadge && (
                              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.2">
                                {gridSlide.gridBadge}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-zinc-400 font-medium">{gridSlide.gridProducts.length} produtos:</span>
                            <div className="flex items-center -space-x-1.5 overflow-hidden">
                              {gridSlide.gridProducts.slice(0, 6).map((gp, pIdx) => (
                                <div key={pIdx} title={gp.productName} className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center text-[10px]">
                                  {gp.imageUrl ? (
                                    <img src={getFullUrl(gp.imageUrl)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    '📦'
                                  )}
                                </div>
                              ))}
                            </div>
                            <span className="text-[11px] text-zinc-500 flex items-center gap-1 ml-2">
                              <Clock size={11} /> {gridSlide.duration || config?.gridSlideDuration || 15}s
                            </span>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setPreviewIndex(idx); openEditGridModal(gridSlide); }}
                            className="p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/20 transition-colors cursor-pointer"
                            title="Editar grade"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => removeSlide(gridSlide.gridId)}
                            className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remover slide"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Slide Individual
                const singleSlide = slide as VitrineSlide;
                return (
                  <div key={singleSlide.productId}>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                      {/* Handle de ordem */}
                      <div className="flex flex-col gap-1">
                        <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors cursor-pointer">
                          <GripVertical size={16} className="-rotate-90" />
                        </button>
                        <button onClick={() => moveSlide(idx, 1)} disabled={idx === draftSlides.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-20 transition-colors cursor-pointer">
                          <GripVertical size={16} className="rotate-90" />
                        </button>
                      </div>

                      {/* Número do slide */}
                      <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0">
                        {idx + 1}
                      </div>

                      {/* Imagem */}
                      {singleSlide.imageUrl ? (
                        <img src={getFullUrl(singleSlide.imageUrl)} alt={singleSlide.productName} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-black/20" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl flex-shrink-0">🍺</div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-zinc-100 truncate">{singleSlide.productName}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {singleSlide.promoPrice != null ? (
                            <>
                              <span className="text-xs text-zinc-500 line-through">R$ {formatPrice(singleSlide.priceSell)}</span>
                              <span className="text-xs font-bold text-emerald-400">R$ {formatPrice(singleSlide.promoPrice)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-400">R$ {formatPrice(singleSlide.priceSell)}</span>
                          )}
                          {singleSlide.badge && (
                            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-2 py-0.5 font-semibold">
                              {singleSlide.badge}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingSlide(editingSlide === singleSlide.productId ? null : singleSlide.productId); setPreviewIndex(idx); }}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${editingSlide === singleSlide.productId ? 'bg-violet-500/20 text-violet-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                          title="Editar preço promocional / badge"
                        >
                          <Tag size={15} />
                        </button>
                        <button onClick={() => removeSlide(singleSlide.productId)} className="p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer">
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Painel de edição inline */}
                    {editingSlide === singleSlide.productId && (
                      <div className="bg-zinc-900/80 border border-violet-500/20 border-t-0 rounded-b-2xl p-4 -mt-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1.5 block">Preço Promocional</label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder={`Normal: R$ ${formatPrice(singleSlide.priceSell)}`}
                              value={singleSlide.promoPrice ?? ''}
                              onChange={e => updateSingleSlide(singleSlide.productId, { promoPrice: e.target.value ? Number(e.target.value) : null })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 transition-colors"
                            />
                            {singleSlide.promoPrice != null && (
                              <button onClick={() => updateSingleSlide(singleSlide.productId, { promoPrice: null })} className="text-xs text-zinc-500 hover:text-red-400 mt-1 transition-colors cursor-pointer">
                                Remover promoção
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1.5 block">Badge</label>
                            <div className="flex flex-wrap gap-1.5">
                              {BADGES.map(b => (
                                <button
                                  key={b}
                                  onClick={() => updateSingleSlide(singleSlide.productId, { badge: singleSlide.badge === b ? null : b })}
                                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-all cursor-pointer ${
                                    singleSlide.badge === b
                                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                      : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                                  }`}
                                >
                                  {b}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── COLUNA DIREITA: Preview + Config ── */}
        <div className="space-y-4">

          {/* Preview da TV */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Eye size={15} className="text-violet-400" /> Preview da TV
              </div>
              {draftSlides.length > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPreviewIndex(p => Math.max(0, p - 1))} className="text-zinc-500 hover:text-zinc-300 px-1.5 cursor-pointer">‹</button>
                  <span className="text-xs text-zinc-500">{(previewIndex % draftSlides.length) + 1} / {draftSlides.length}</span>
                  <button onClick={() => setPreviewIndex(p => p + 1)} className="text-zinc-500 hover:text-zinc-300 px-1.5 cursor-pointer">›</button>
                </div>
              )}
            </div>

            {/* Mini-TV */}
            <div
              className="mx-4 mb-4 rounded-xl overflow-hidden relative"
              style={{
                aspectRatio: '16/9',
                background: currentTheme.bg,
              }}
            >
              {previewSlide ? (
                previewSlide.slideType === 'grid' ? (
                  // Preview de Grade
                  <div className="absolute inset-0 flex flex-col p-3 text-white">
                    <div className="text-center font-extrabold text-[8px] uppercase tracking-widest text-indigo-300">
                      {previewSlide.gridSubtitle || '• SELEÇÃO ESPECIAL •'}
                    </div>
                    <div className="text-center font-black text-xs uppercase tracking-wider text-white">
                      {previewSlide.gridTitle}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 mt-2 flex-1 items-stretch">
                      {previewSlide.gridProducts.slice(0, 6).map((gp, i) => (
                        <div key={i} className="bg-black/60 rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-between">
                          <div className="w-full bg-white p-1 flex items-center justify-center flex-1 min-h-0">
                            {gp.imageUrl ? (
                              <img src={getFullUrl(gp.imageUrl)} alt="" className="h-7 object-contain" />
                            ) : (
                              <span className="text-[10px]">📦</span>
                            )}
                          </div>
                          <div className="w-full bg-black/70 p-1 text-center border-t border-white/10">
                            <div className="text-[8px] font-semibold truncate text-zinc-200">{gp.productName}</div>
                            <div className="text-[9px] font-black text-yellow-400">R$ {formatPrice(gp.promoPrice ?? gp.priceSell)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {config?.instagramHandle && (
                      <div className="absolute top-2 right-2 bg-black/60 border border-white/20 rounded-full px-2 py-0.5 flex items-center gap-1 text-[9px] font-bold text-white z-10">
                        <img src="/instagram-icon.png" alt="" className="w-2.5 h-2.5 rounded-xs" />
                        <span>{config.instagramHandle.startsWith('@') ? config.instagramHandle : `@${config.instagramHandle}`}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Preview Individual
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-white">
                    {tenantInfo?.logoUrl && (
                      <img src={getFullUrl(tenantInfo.logoUrl)} alt="Logo" className="absolute top-2 left-2 h-7 object-contain" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }} />
                    )}
                    {config?.instagramHandle && (
                      <div className="absolute top-2 right-2 bg-black/60 border border-white/20 rounded-full px-2 py-0.5 flex items-center gap-1 text-[9px] font-bold text-white z-10">
                        <img src="/instagram-icon.png" alt="" className="w-2.5 h-2.5 rounded-xs" />
                        <span>{config.instagramHandle.startsWith('@') ? config.instagramHandle : `@${config.instagramHandle}`}</span>
                      </div>
                    )}
                    {previewSlide.badge && (
                      <div className={`absolute ${config?.instagramHandle ? 'top-7' : 'top-2'} right-2 bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full`}>
                        {previewSlide.badge}
                      </div>
                    )}
                    {previewSlide.imageUrl && (
                      <img src={getFullUrl(previewSlide.imageUrl)} alt={previewSlide.productName} className="h-20 object-contain mb-2" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' }} />
                    )}
                    <div className="text-center font-black text-xs leading-tight uppercase tracking-wide line-clamp-2">{previewSlide.productName}</div>
                    <div className="mt-1 font-black text-sm text-yellow-300">
                      R$ {formatPrice(previewSlide.promoPrice ?? previewSlide.priceSell)}
                    </div>
                    {previewSlide.promoPrice != null && (
                      <div className="text-[10px] text-white/50 line-through">R$ {formatPrice(previewSlide.priceSell)}</div>
                    )}
                  </div>
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600">
                  <Tv2 size={28} />
                  <div className="text-xs mt-1">Adicione produtos ou crie uma grade</div>
                </div>
              )}

              {/* Mini Logo TELTECH Watermark */}
              <div className="absolute bottom-1 right-1.5 bg-black/60 rounded px-1 py-0.5 flex items-center gap-1 pointer-events-none z-10">
                <img src="/teltech-logo.png" alt="" className="w-2.5 h-2.5 rounded-xs" />
                <span className="text-[7px] font-black text-white tracking-widest">TELTECH</span>
              </div>
            </div>
          </div>

          {/* Temas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">🎨 Tema do Fundo</div>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.slug}
                  onClick={() => setTheme(t.slug)}
                  title={t.name}
                  className={`aspect-square rounded-xl transition-all overflow-hidden border-2 cursor-pointer ${
                    config?.theme === t.slug ? 'border-violet-500 scale-105' : 'border-transparent hover:border-zinc-600'
                  }`}
                  style={{ background: t.bg }}
                >
                  <div className="flex items-center justify-center h-full text-xl">{t.emoji}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 text-center text-xs text-zinc-500 font-medium">
              {currentTheme.emoji} {currentTheme.name}
            </div>
          </div>

          {/* Configurações de Redes & Tempos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">⚙️ Configurações da Loja</div>

            {/* Instagram da Loja */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <img src="/instagram-icon.png" alt="" className="w-3.5 h-3.5 rounded-sm object-contain" />
                Instagram da Loja (Opcional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">@</span>
                <input
                  type="text"
                  placeholder="seuperfil (ex: centralbebidas)"
                  value={config?.instagramHandle ? config.instagramHandle.replace(/^@/, '') : ''}
                  onChange={e => {
                    const val = e.target.value.trim();
                    const clean = val ? (val.startsWith('@') ? val : `@${val}`) : null;
                    updateDraft(draftSlides, { instagramHandle: clean });
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-7 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-pink-500 transition-colors"
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Exibido em destaque na TV com o ícone oficial do Instagram.</p>
            </div>

            <div className="border-t border-zinc-800/80 pt-3 space-y-3">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">⏱️ Tempos de Exibição</div>

              {/* Tempo Individual */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-zinc-300 block font-medium">Slide individual</span>
                  <span className="text-[11px] text-zinc-500">1 produto em destaque</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={3} max={30}
                    value={config?.slideDuration || 8}
                    onChange={e => setSlideDuration(Number(e.target.value))}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center text-zinc-200 focus:outline-none focus:border-violet-500"
                  />
                  <span className="text-xs text-zinc-500">segundos</span>
                </div>
              </div>

              {/* Tempo Grade */}
              <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3">
                <div>
                  <span className="text-sm text-zinc-300 block font-medium">Slide com grade</span>
                  <span className="text-[11px] text-zinc-500">Vários produtos por categoria</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5} max={60}
                    value={config?.gridSlideDuration || 15}
                    onChange={e => setGridSlideDuration(Number(e.target.value))}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center text-zinc-200 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-zinc-500">segundos</span>
                </div>
              </div>
            </div>
          </div>

          {/* URL da TV */}
          {tvUrl && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">📺 URL da TV</div>
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
                <span className="text-xs text-zinc-300 flex-1 truncate font-mono">{tvUrl}</span>
                <a
                  href={tvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-violet-600/20 text-violet-400 border border-violet-500/30 hover:bg-violet-600/30 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors font-semibold flex-shrink-0"
                  title="Abrir TV em nova aba"
                >
                  <ExternalLink size={13} /> Abrir
                </a>
                <button
                  onClick={copyUrl}
                  className="p-1 text-zinc-400 hover:text-violet-400 transition-colors flex-shrink-0 cursor-pointer"
                  title="Copiar URL"
                >
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="text-xs text-zinc-600 mt-2">
                {isLocal ? 'Ambiente Local: clique em "Abrir" para visualizar a TV em nova aba.' : 'Abra esta URL no navegador da TV em tela cheia.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de Criação / Edição de Grade por Categoria ── */}
      {isGridModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-indigo-500/40 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl shadow-indigo-500/20">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <LayoutGrid size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingGridSlideId ? 'Editar Grade por Categoria' : 'Nova Grade por Categoria'}
                  </h3>
                  <p className="text-xs text-zinc-400">Exiba até 6 produtos em uma única tela na TV</p>
                </div>
              </div>
              <button
                onClick={() => setIsGridModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {/* Título da Categoria + Duração */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                    Nome da Categoria (Título Principal)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CHEETOS, CERVEJAS ESPECIAIS, DOCES & CHOCOLATES..."
                    value={gridTitle}
                    onChange={e => setGridTitle(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-semibold uppercase tracking-wide"
                  />
                </div>

                {/* Duração */}
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                    Tempo no Ar
                  </label>
                  <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2">
                    <input
                      type="number"
                      min={5} max={60}
                      value={gridDuration}
                      onChange={e => setGridDuration(Number(e.target.value))}
                      className="w-12 bg-transparent text-sm text-center text-zinc-100 focus:outline-none font-bold"
                    />
                    <span className="text-xs text-zinc-500 pr-1">s</span>
                  </div>
                </div>
              </div>

              {/* Subtítulo / Micro-tag Superior */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                  Micro-Tag Superior (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: • SELEÇÃO ESPECIAL •, • SNACKS & PETISCOS •"
                  value={gridSubtitle}
                  onChange={e => setGridSubtitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 mb-2"
                />
                <div className="text-[11px] text-zinc-500 mb-1.5">Sugestões rápidas de micro-tag:</div>
                <div className="flex flex-wrap gap-1.5">
                  {SUBTITLE_PRESETS.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setGridSubtitle(sub)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-all cursor-pointer ${
                        gridSubtitle === sub
                          ? 'bg-indigo-500/30 border-indigo-500 text-indigo-200'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>

              {/* Badge da Grade */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5 block">
                  Badge Promocional (Opcional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGridBadge(null)}
                    className={`text-xs px-3 py-1 rounded-full font-semibold border transition-all cursor-pointer ${
                      gridBadge === null
                        ? 'bg-zinc-700 text-white border-zinc-500'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    Nenhum
                  </button>
                  {BADGES.map(b => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setGridBadge(b)}
                      className={`text-xs px-3 py-1 rounded-full font-semibold border transition-all cursor-pointer ${
                        gridBadge === b
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Produtos Selecionados na Grade */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Produtos na Grade ({gridSelectedProducts.length}/6)
                  </label>
                  <span className="text-[11px] text-zinc-500">Mínimo 2, máximo 6 produtos</span>
                </div>

                {gridSelectedProducts.length === 0 ? (
                  <div className="bg-zinc-950/60 border border-dashed border-zinc-800 rounded-xl p-4 text-center text-xs text-zinc-500">
                    Nenhum produto adicionado à grade. Use a busca abaixo para incluir produtos.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gridSelectedProducts.map((gp, pIdx) => (
                      <div key={gp.productId} className="bg-zinc-800/80 border border-zinc-700 rounded-xl p-2.5 flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {pIdx + 1}
                        </div>
                        {gp.imageUrl ? (
                          <img src={getFullUrl(gp.imageUrl)} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-black/20" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center text-xs flex-shrink-0">📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-100 truncate">{gp.productName}</div>
                          <div className="text-[11px] text-zinc-400">Normal: R$ {formatPrice(gp.priceSell)}</div>
                        </div>

                        {/* Input Preço Promocional */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[11px] text-zinc-400 font-semibold">Promo R$:</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder={formatPrice(gp.priceSell)}
                            value={gp.promoPrice ?? ''}
                            onChange={e => updateGridProductPromoPrice(gp.productId, e.target.value ? Number(e.target.value) : null)}
                            className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-100 text-right focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => removeProductFromGrid(gp.productId)}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                            title="Remover produto da grade"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Busca para adicionar produto à grade */}
              {gridSelectedProducts.length < 6 && (
                <div className="border-t border-zinc-800 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-400">
                      Buscar e Adicionar Produto à Grade
                    </label>
                    {gridSearch && (
                      <button
                        type="button"
                        onClick={() => setGridSearch('')}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                      >
                        Limpar busca
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Digitar nome do produto..."
                      value={gridSearch}
                      onChange={e => setGridSearch(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-8 pr-8 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                    />
                    {gridSearch && (
                      <button
                        type="button"
                        onClick={() => setGridSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5 cursor-pointer"
                        title="Limpar busca"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {gridSearch && (
                    <div className="max-h-40 overflow-y-auto space-y-1 mt-2 custom-scrollbar bg-zinc-900/90 border border-zinc-800 rounded-xl p-1.5">
                      {availableGridProducts.slice(0, 10).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductToGrid(p)}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 text-left transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {p.imageUrl ? (
                              <img src={getFullUrl(p.imageUrl)} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0 bg-black/20" />
                            ) : (
                              <span className="text-xs">📦</span>
                            )}
                            <span className="text-xs text-zinc-200 truncate group-hover:text-white transition-colors">{p.name}</span>
                          </div>
                          <span className="text-xs text-indigo-400 font-bold flex-shrink-0 ml-2 group-hover:text-indigo-300 transition-colors">
                            + R$ {formatPrice(p.priceSell)}
                          </span>
                        </button>
                      ))}
                      {availableGridProducts.length === 0 && (
                        <div className="text-center text-zinc-500 text-xs py-3">
                          {products.some(p => normalizeText(p.name).includes(gridSearchNorm))
                            ? '✓ Todos os produtos encontrados já foram adicionados à grade'
                            : 'Nenhum produto encontrado'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsGridModalOpen(false)}
                className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveGridSlide}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
              >
                {editingGridSlideId ? 'Salvar Alterações na Grade' : 'Adicionar Grade à Vitrine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rodapé fixo de Publicação ── */}
      <div className="sticky bottom-0 left-0 right-0 mt-6 -mx-3 md:-mx-8 px-4 md:px-8 py-4 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 flex items-center justify-between gap-4 z-40">
        <div className="flex items-center gap-3 text-sm">
          {savingDraft && (
            <div className="flex items-center gap-2 text-zinc-500">
              <RefreshCw size={14} className="animate-spin" /> Salvando rascunho...
            </div>
          )}
          {!savingDraft && draftDiffersFromPublished && (
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {draftSlides.length} slide{draftSlides.length !== 1 ? 's' : ''} não publicado{draftSlides.length !== 1 ? 's' : ''}
            </div>
          )}
          {!savingDraft && !draftDiffersFromPublished && config?.publishedAt && (
            <div className="flex items-center gap-2 text-emerald-400">
              <Check size={14} />
              Publicado {formatDateTime(config.publishedAt)}
              {config.publishedByName && ` por ${config.publishedByName}`}
            </div>
          )}
        </div>

        <button
          onClick={publish}
          disabled={publishing || draftSlides.length === 0}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${
            publishing || draftSlides.length === 0
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              : draftDiffersFromPublished
              ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/25'
              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25'
          }`}
        >
          {publishing ? (
            <><RefreshCw size={16} className="animate-spin" /> Publicando...</>
          ) : (
            <><Tv2 size={16} /> Publicar na TV</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Debounce helper ──────────────────────────────────────────────────────────
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}
