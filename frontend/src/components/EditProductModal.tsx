'use client';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { isPetshopServiceCategory } from '@/pages/petshop/product-catalog';
import { toast } from 'sonner';
import { Edit3, X, Loader2, Save, DollarSign, FileText, Tag, PackageOpen, Upload, Trash2 } from 'lucide-react';
import { ProductSearchSelect } from './ProductSearchSelect';
import { useKdsConfig } from '@/hooks/useKdsEnabled';
import { ProductPreparationFields } from './ProductPreparationFields';
import { useAuthStore } from '@/store/auth';

const UNIT_OPTIONS = ['UN', 'KG', 'LT', 'CX', 'DZ', 'PCT', 'FD', 'ML', 'GR'];
const ORIGEM_OPTIONS = [
  { value: 0, label: '0 — Nacional' },
  { value: 1, label: '1 — Estrangeira (Importação direta)' },
  { value: 2, label: '2 — Estrangeira (Mercado interno)' },
  { value: 3, label: '3 — Nacional (Conteúdo importado > 40%)' },
];

interface GrupoTributacao { id: string; nome: string; cfop: string; }

interface ProductData {
  id: string;
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  unit?: string;
  priceCost?: number;
  priceSell?: number;
  stock?: number;
  categoryId?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origem?: number;
  grupoTributacaoId?: string | null;
  imageUrl?: string | null;
  requiresKitchen?: boolean;
  requiresBar?: boolean;
  barStation?: string;
  requiresCarvoaria?: boolean;
  serviceTimerMinutes?: number | null;
  assetTrackingTotal?: number | null;
  preparationIngredients?: string | null;
  isComposite?: boolean;
  volumeUnit?: string | null;
  volumeCapacity?: number | null;
  modifierGroups?: any[];
}

export function EditProductModal({
  product, isOpen, onClose, onSuccess, variant = 'default',
}: {
  product: ProductData | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  variant?: 'default' | 'petshop';
}) {
  const { user } = useAuthStore();
  const { enabled: kdsEnabled, carvoariaEnabled } = useKdsConfig();
  const isStockist = user?.role === 'stockist';
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [grupos, setGrupos] = useState<GrupoTributacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  
  // ── Auto-sugestão tributária ──
  const [suggestedGroupName, setSuggestedGroupName] = useState<string | null>(null);
  const [suggestedGroupId, setSuggestedGroupId] = useState<string | null>(null);
  const suggestDebounceRef = useRef<any | null>(null);
  
  // ── Image Upload states & handlers ────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [formData, setFormData] = useState({
    name: '', barcode: '', unit: 'UN',
    priceCost: '', priceSell: '', stock: '', categoryId: '',
    ncm: '', cest: '', origem: 0, grupoTributacaoId: '', imageUrl: '',
    requiresKitchen: false, requiresBar: false, barStation: 'BAR', preparationIngredients: '', requiresCarvoaria: false, serviceTimerMinutes: null as number | null, assetTrackingTotal: null as number | null,
    isComposite: false, volumeUnit: '', volumeCapacity: '', minStock: '',
  });

  useEffect(() => {
    if (isOpen && product) {
      setFormData({
        name:               product.name          || '',
        barcode:            product.barcode        || '',
        unit:               product.unit           || 'UN',
        priceCost:          product.priceCost?.toString()  || '0',
        priceSell:          product.priceSell?.toString()  || '0',
        stock:              product.stock != null ? Number(product.stock).toString() : '0',
        categoryId:         product.categoryId     || '',
        ncm:                product.ncm            || '',
        cest:               product.cest           || '',
        origem:             product.origem         ?? 0,
        grupoTributacaoId:  product.grupoTributacaoId || '',
        imageUrl:           product.imageUrl       || '',
        requiresKitchen: product.requiresKitchen ?? false,
        requiresBar: product.requiresBar ?? false,
        barStation: product.barStation ?? 'BAR',
        requiresCarvoaria: product.requiresCarvoaria ?? false,
        serviceTimerMinutes: product.serviceTimerMinutes ?? null,
        assetTrackingTotal: product.assetTrackingTotal ?? null,
        preparationIngredients: product.preparationIngredients || '',
        isComposite:        product.isComposite    ?? false,
        volumeUnit:         product.volumeUnit     || '',
        volumeCapacity:     product.volumeCapacity?.toString() || '',
        minStock:           (product as any).minStock != null ? Number((product as any).minStock).toString() : '',
      });

      // Carregar composição atual
      if (product.modifierGroups && product.modifierGroups.length > 0) {
        const loadedGroups = product.modifierGroups.map((g: any) => ({
          id: g.id || Math.random().toString(),
          name: g.name,
          minSelected: g.minSelected,
          maxSelected: g.maxSelected,
          options: g.options.map((o: any) => ({
            id: o.id || Math.random().toString(),
            name: o.name,
            componentProductId: o.componentProductId,
            quantity: Number(o.quantity),
            priceAdjustment: Number(o.priceAdjustment)
          }))
        }));
        setModifierGroups(loadedGroups);
      } else {
        setModifierGroups([]);
      }

      Promise.all([
        api.get('/categories'),
        api.get('/tributacao'),
        api.get('/products?limit=10000'),
      ]).then(([catRes, grupRes, prodRes]) => {
        setCategories(variant === 'petshop' ? catRes.data.filter((category: { name: string }) => !isPetshopServiceCategory(category.name)) : catRes.data);
        setGrupos(grupRes.data);
        setAllProducts(prodRes.data.data || []);
      }).catch(() => toast.error('Falha ao carregar dados auxiliares'));
    }
  }, [isOpen, product]);

  const addGroup = () => {
    setModifierGroups(prev => [
      ...prev,
      { id: Math.random().toString(), name: '', minSelected: 1, maxSelected: 1, options: [] }
    ]);
  };

  const removeGroup = (groupId: string) => setModifierGroups(prev => prev.filter(g => g.id !== groupId));

  const updateGroupName = (groupId: string, name: string) =>
    setModifierGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));

  const addOption = (groupId: string) => {
    setModifierGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, options: [...g.options, { id: Math.random().toString(), name: '', componentProductId: '', quantity: 1, priceAdjustment: 0 }] };
    }));
  };

  const removeOption = (groupId: string, optionId: string) => {
    setModifierGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, options: g.options.filter((o: any) => o.id !== optionId) };
    }));
  };

  const updateOption = (groupId: string, optionId: string, fields: any) => {
    setModifierGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, options: g.options.map((o: any) => o.id === optionId ? { ...o, ...fields } : o) };
    }));
  };

  if (!isOpen || !product) return null;

  const f = (key: string, val: unknown) => setFormData(prev => ({ ...prev, [key]: val }));

  // ── Auto-sugestão tributária ──

  const fetchTaxGroupSuggestion = (name: string) => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (!name || name.trim().length < 3) {
      setSuggestedGroupName(null);
      setSuggestedGroupId(null);
      return;
    }

    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/tributacao/suggest?q=${encodeURIComponent(name)}`);
        if (res.data && res.data.sugestao) {
          setSuggestedGroupName(res.data.nomesSugerido);
          setSuggestedGroupId(res.data.sugestao.id);
        } else {
          setSuggestedGroupName(null);
          setSuggestedGroupId(null);
        }
      } catch (err) {
        // Silencioso
      }
    }, 300);
  };

  const handleNameChange = (name: string) => {
    f('name', name);
    fetchTaxGroupSuggestion(name);
  };

  // ── Compressor de imagem (Canvas API nativa, zero deps) ──────────────────
  const compressImage = (file: File, maxPx = 1200, quality = 0.82): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem')),
          'image/webp',
          quality,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato não reconhecido. Exporte a foto como JPG ou PNG e tente novamente.')); };
      img.src = url;
    });

  const uploadFile = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 15MB.');
      return;
    }

    setIsUploading(true);
    try {
      // Comprimir antes de enviar: foto de 5MB vira ~100KB
      const compressed = await compressImage(file);
      const compressedFile = new File([compressed], 'product.webp', { type: 'image/webp' });

      const formDataObj = new FormData();
      formDataObj.append('file', compressedFile);

      const res = await api.post('/products/upload', formDataObj, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      f('imageUrl', res.data.imageUrl);
      toast.success('Foto enviada com sucesso!');
    } catch (err: any) {
      toast.error(String(err?.response?.data?.message || err?.message || 'Erro ao enviar a foto.'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await uploadFile(file);
    } else {
      toast.error('Selecione apenas arquivos de imagem.');
    }
  };

  const removePhoto = () => {
    f('imageUrl', '');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cost   = parseFloat(formData.priceCost) || 0;
  const sell   = parseFloat(formData.priceSell) || 0;
  const margin = sell > cost && sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : '0.0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.categoryId) {
      toast.error('Nome e Categoria são obrigatórios.');
      return;
    }

    if (formData.isComposite) {
      for (const g of modifierGroups) {
        if (!g.name.trim()) { toast.error('Preencha o nome de todos os grupos.'); return; }
        if (g.options.length === 0) { toast.error(`O grupo "${g.name}" precisa de pelo menos uma opção.`); return; }
        for (const o of g.options) {
          if (!o.componentProductId) { toast.error(`Selecione um ingrediente em "${g.name}".`); return; }
          if (!o.quantity || parseFloat(o.quantity) <= 0) { toast.error(`Quantidade inválida em "${g.name}".`); return; }
        }
      }
    }

    setLoading(true);
    try {
      const payloadGroups = modifierGroups.map(g => ({
        name: g.name,
        minSelected: g.minSelected,
        maxSelected: g.maxSelected,
        options: g.options.map((o: any) => ({
          name: o.name,
          componentProductId: o.componentProductId,
          quantity: parseFloat(o.quantity) || 0,
          priceAdjustment: parseFloat(o.priceAdjustment) || 0
        }))
      }));

      await api.patch(`/products/${product.id}`, {
        name:               formData.name.trim(),
        barcode:            formData.barcode || undefined,
        unit:               formData.unit || 'UN',
        priceCost:          parseFloat(formData.priceCost) || 0,
        priceSell:          parseFloat(formData.priceSell) || 0,
        stock:              formData.isComposite && modifierGroups.length > 0 ? undefined : (parseFloat(formData.stock) || 0),
        categoryId:         formData.categoryId,
        ncm:                formData.ncm || undefined,
        cest:               formData.cest || undefined,
        origem:             formData.origem,
        grupoTributacaoId:  formData.grupoTributacaoId || undefined,
        imageUrl:           formData.imageUrl || null,
        isComposite:        formData.isComposite,
        volumeUnit:         formData.volumeUnit || null,
        volumeCapacity:     formData.volumeCapacity ? parseFloat(formData.volumeCapacity) : null,
        minStock:           formData.minStock ? parseFloat(formData.minStock) : null,
        ...(kdsEnabled ? { requiresKitchen: formData.requiresKitchen, requiresBar: formData.requiresBar, barStation: formData.barStation, requiresCarvoaria: formData.requiresCarvoaria, serviceTimerMinutes: formData.serviceTimerMinutes, assetTrackingTotal: formData.assetTrackingTotal, preparationIngredients: formData.preparationIngredients || null } : {}),
        modifierGroups:     formData.isComposite ? payloadGroups : [],
      });
      toast.success('Produto atualizado com sucesso!');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string }; status?: number } };
      toast.error(apiErr.response?.data?.message || 'Erro ao atualizar produto.');
    } finally {
      setLoading(false);
    }
  };

  const inp  = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm placeholder-zinc-600';
  const lbl  = 'text-xs font-semibold text-zinc-400 mb-1 block uppercase tracking-wide';
  const sect = 'bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 space-y-4';

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-end bg-black/60 backdrop-blur-sm ${variant === 'petshop' ? 'petshop-product-modal' : ''}`}>
      <div role="dialog" aria-modal="true" aria-label="Editar produto" className="bg-zinc-900 border-l border-zinc-800 w-full max-w-lg h-dvh shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-zinc-800 bg-zinc-950/50 shrink-0">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Edit3 className="text-blue-400" size={22} /> Editar Produto
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Atalho: <span className="font-mono text-zinc-400 font-bold">#{product.shortCode || 'Auto'}</span>
              {' '}— gerado pelo sistema, não editável.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar edição de produto" className="grid h-11 w-11 place-items-center bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors text-zinc-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Form — único scroll, sem abas */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">

          {/* ── FOTO DO PRODUTO ──────────────────────────────── */}
          <div className={sect} data-product-section="image">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              <Upload size={16} className="text-blue-400" /> Foto do Produto
            </h3>
            
            <div className="flex flex-col items-center justify-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              
              {formData.imageUrl ? (
                <div className="w-full relative group rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center p-4">
                  <img
                    src={formData.imageUrl}
                    alt="Preview"
                    className="max-h-48 rounded-lg object-contain bg-white p-2"
                  />
                  <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={14} /> Alterar
                    </button>
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={14} /> Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-950/30'
                  }`}
                >
                  {isUploading ? (
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                  ) : (
                    <Upload size={32} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
                  )}
                  <span className="text-xs font-bold text-zinc-400">
                    {isUploading ? 'Enviando foto...' : 'Adicionar Foto'}
                  </span>
                  <span className="text-[10px] text-zinc-600 text-center px-4">
                    Arraste uma imagem ou clique para selecionar (PNG, JPG, máx. 5MB)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Dados Principais ──────────────────────────────── */}
          <div className={sect} data-product-section="main">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              <Tag size={16} className="text-blue-400" /> Dados Principais
            </h3>

            <div>
              <label className={lbl}>Nome da Mercadoria *</label>
              <input required className={inp} value={formData.name} onChange={e => handleNameChange(e.target.value)} />
              
              {suggestedGroupName && suggestedGroupId && formData.grupoTributacaoId !== suggestedGroupId && (
                <div className="mt-1.5 flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-xl text-[11px] text-indigo-400">
                  <span>💡 Sugestão Fiscal: <strong>{suggestedGroupName}</strong></span>
                  <button 
                    type="button" 
                    onClick={() => {
                      f('grupoTributacaoId', suggestedGroupId);
                      setSuggestedGroupName(null);
                      setSuggestedGroupId(null);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2 py-0.5 rounded transition text-[10px] cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Cód. Barras (EAN)</label>
                <input className={`${inp} font-mono`} placeholder="789..." value={formData.barcode} onChange={e => f('barcode', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Unidade de Venda</label>
                <select className={inp} value={formData.unit} onChange={e => f('unit', e.target.value)}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={lbl}>Categoria *</label>
              <select required className={inp} value={formData.categoryId} onChange={e => f('categoryId', e.target.value)}>
                <option value="" disabled>Selecione...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Preços & Estoque ──────────────────────────────── */}
          <div className={sect} data-product-section="commercial">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-400" /> Preços &amp; Estoque
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Custo de Compra</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                  <input type="number" step="0.01" min="0" className={`${inp} pl-9 text-rose-400 font-bold`} value={formData.priceCost} onChange={e => f('priceCost', e.target.value)} />
                </div>
              </div>
              <div>
                <label className={lbl}>Preço de Venda *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">R$</span>
                  <input required type="number" step="0.01" min="0" className={`${inp} pl-9 ${isStockist ? 'text-zinc-600 cursor-not-allowed' : 'text-emerald-400 font-black'}`} value={formData.priceSell} onChange={e => !isStockist && f('priceSell', e.target.value)} disabled={isStockist} title={isStockist ? 'Estoquista não pode alterar preço de venda' : ''} />
                </div>
                {isStockist && <p className="text-[10px] text-amber-500/70 mt-1">🔒 Sem permissão para alterar preço de venda</p>}
              </div>
            </div>

            {/* Margin badge */}
            <div className="flex justify-between items-center py-2 border-t border-zinc-800/50">
              <span className="text-xs font-semibold text-zinc-500">Margem de Lucro:</span>
              <span className={`text-base font-black ${Number(margin) > 30 ? 'text-emerald-400' : 'text-yellow-400'}`}>{margin}%</span>
            </div>

            <div>
              <label className={lbl}>
                <PackageOpen size={12} className="inline mr-1" />
                Estoque Físico Atual
                <span className="ml-1 text-zinc-600 normal-case font-normal">(ajuste manual — use Entrada de Estoque para repor)</span>
              </label>
              <input
                type="number" step="0.001" min="0"
                disabled={formData.isComposite && modifierGroups.length > 0}
                className={`${inp} text-blue-400 font-bold disabled:opacity-50`}
                placeholder={formData.isComposite && modifierGroups.length > 0 ? 'Produto composto' : '0'}
                value={formData.isComposite && modifierGroups.length > 0 ? '' : formData.stock}
                onChange={e => f('stock', e.target.value)}
              />
            </div>
            <div>
              <label className={lbl}>
                Estoque Mínimo <span className="ml-1 text-zinc-600 normal-case font-normal">(Opcional — deixe vazio para usar padrão global)</span>
              </label>
              <input
                type="number" step="0.001" min="0"
                className={`${inp} text-amber-400 font-bold`}
                placeholder="Padrão global"
                value={formData.minStock}
                onChange={e => f('minStock', e.target.value)}
                title="Deixe vazio para usar o limite global de alerta de reposição"
              />
            </div>
          </div>

          {/* ── Fracionamento & Composição ───────────────────── */}
          <div className={sect} data-product-section="composition">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              Fracionamento &amp; Composição
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Fracionamento Interno</label>
                <select className={inp} value={formData.volumeUnit || ''} onChange={e => f('volumeUnit', e.target.value)}>
                  <option value="">Não Fracionado</option>
                  <option value="ML">ML (Mililitros)</option>
                  <option value="KG">KG (Quilogramas / Granel)</option>
                  <option value="UN">UN (Unidades)</option>
                </select>
              </div>
              {formData.volumeUnit && (
                <div>
                  <label className={lbl}>
                    {formData.volumeUnit === 'ML' ? 'Capacidade (ml)' : formData.volumeUnit === 'KG' ? 'Peso Total Saco/Embalagem (kg)' : 'Unidades por Caixa'}
                  </label>
                  <input
                    type="number" step="0.001"
                    className={inp}
                    placeholder={formData.volumeUnit === 'ML' ? 'Ex: 950' : formData.volumeUnit === 'KG' ? 'Ex: 15' : 'Ex: 20'}
                    value={formData.volumeCapacity || ''}
                    onChange={e => f('volumeCapacity', e.target.value)}
                  />
                </div>
              )}
            </div>

            {kdsEnabled && <ProductPreparationFields carvoariaEnabled={carvoariaEnabled} value={formData} onChange={value => setFormData(prev => ({ ...prev, ...value }))} />}

            <div className="flex items-center justify-between py-2 border-t border-zinc-800/50">
              <span className="text-xs font-bold text-zinc-300">Produto Composto / Com adicionais</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.isComposite} onChange={e => f('isComposite', e.target.checked)} />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-600 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {formData.isComposite && (
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400">Grupos de Adicionais</span>
                  <div className="flex gap-3">
                    {allProducts.some(p => p.isComposite && p.id !== product?.id) && (
                      <button type="button" onClick={() => setShowCopyModal(true)} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition">Copiar Adicionais</button>
                    )}
                    <button type="button" onClick={addGroup} className="text-xs font-bold text-blue-400 hover:text-blue-300 transition">+ Adicionar Grupo</button>
                  </div>
                </div>

                {modifierGroups.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4 bg-zinc-950/30 rounded-xl border border-zinc-800/50">Nenhum grupo configurado.</p>
                ) : (
                  modifierGroups.map((g, gIdx) => (
                    <div key={g.id || gIdx} className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          className="bg-transparent border-b border-zinc-800 focus:border-blue-500 text-sm font-bold text-white focus:outline-none transition py-0.5 px-1 flex-1 placeholder-zinc-600"
                          value={g.name}
                          onChange={e => updateGroupName(g.id, e.target.value)}
                          placeholder="Nome do Grupo (ex: Escolha o Gelo)"
                        />
                        <button type="button" onClick={() => removeGroup(g.id)} className="text-xs text-rose-500 hover:text-rose-400 font-bold transition">Remover</button>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-1.5 text-[10px] font-black tracking-widest text-zinc-600 uppercase px-1">
                          <div className="col-span-5">Ingrediente</div>
                          <div className="col-span-4">Qtd Baixa</div>
                          <div className="col-span-2 text-right">Preço+</div>
                          <div className="col-span-1"></div>
                        </div>

                        {g.options.map((opt: any, oIdx: number) => {
                          const compProd = allProducts.find((p: any) => p.id === opt.componentProductId);
                          const unitLabel = compProd?.volumeUnit || compProd?.unit || 'UN';
                          return (
                            <div key={opt.id || oIdx} className="grid grid-cols-12 gap-1.5 items-center">
                              <div className="col-span-5">
                                <ProductSearchSelect
                                  products={allProducts.filter((p: any) => !p.isComposite && p.active !== false)}
                                  value={opt.componentProductId}
                                  onChange={(productId) => {
                                    const selected = allProducts.find((p: any) => p.id === productId);
                                    updateOption(g.id, opt.id, { componentProductId: productId, name: opt.name || selected?.name || '' });
                                  }}
                                />
                              </div>
                              <div className="col-span-4 flex items-center gap-1">
                                <input
                                  type="number" step="0.001"
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                  value={opt.quantity}
                                  onChange={e => updateOption(g.id, opt.id, { quantity: e.target.value })}
                                />
                                <span className="text-[10px] text-zinc-500 font-bold">{unitLabel}</span>
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number" step="0.01"
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-emerald-400 text-right font-bold focus:outline-none focus:border-blue-500 transition"
                                  value={opt.priceAdjustment}
                                  onChange={e => updateOption(g.id, opt.id, { priceAdjustment: e.target.value })}
                                />
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <button type="button" onClick={() => removeOption(g.id, opt.id)} className="text-rose-500 hover:text-rose-400 transition"><X size={13} /></button>
                              </div>
                            </div>
                          );
                        })}

                        <button type="button" onClick={() => addOption(g.id)} className="w-full py-1.5 border border-dashed border-zinc-800 hover:border-zinc-700 text-zinc-500 hover:text-zinc-300 rounded-lg text-xs font-bold transition">
                          + Adicionar Opção
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {showCopyModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
                <h3 className="text-sm font-bold text-white">Copiar Adicionais</h3>
                <p className="text-xs text-zinc-500">Selecione o produto composto de origem:</p>
                <select
                  className={inp}
                  onChange={e => {
                    const source = allProducts.find(p => p.id === e.target.value);
                    if (source && source.modifierGroups) {
                      const cloned = source.modifierGroups.map((g: any) => ({
                        id: Math.random().toString(), name: g.name,
                        minSelected: g.minSelected, maxSelected: g.maxSelected,
                        options: g.options.map((o: any) => ({
                          id: Math.random().toString(), name: o.name,
                          componentProductId: o.componentProductId,
                          quantity: Number(o.quantity), priceAdjustment: Number(o.priceAdjustment)
                        }))
                      }));
                      setModifierGroups(cloned);
                      toast.success(`Ficha copiada de "${source.name}"!`);
                    }
                    setShowCopyModal(false);
                  }}
                >
                  <option value="">-- Escolha --</option>
                  {allProducts.filter(p => p.isComposite && p.id !== product?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowCopyModal(false)} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-bold transition">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Fiscal / NFC-e ────────────────────────────────── */}
          <div className={sect} data-product-section="tax">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              <FileText size={16} className="text-indigo-400" /> Fiscal / NFC-e
              <span className="text-zinc-600 font-normal text-xs">(opcional)</span>
            </h3>



            <div>
              <label className={lbl}>Grupo Tributário</label>
              <select className={`${inp} border-indigo-500/20`} value={formData.grupoTributacaoId} onChange={e => f('grupoTributacaoId', e.target.value)}>
                <option value="">— Sem Grupo Fiscal (Herdar da Categoria) —</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome} (CFOP {g.cfop})</option>)}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                ℹ️ Caso nenhum grupo seja selecionado, o produto herdará a tributação associada à categoria dele.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>NCM <span className="text-zinc-600">(8 dígitos)</span></label>
                <input className={`${inp} font-mono`} maxLength={8} placeholder="22030000" value={formData.ncm} onChange={e => f('ncm', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>CEST <span className="text-zinc-600">(7 dígitos)</span></label>
                <input className={`${inp} font-mono`} maxLength={7} placeholder="0300500" value={formData.cest} onChange={e => f('cest', e.target.value)} />
              </div>
            </div>

            <div>
              <label className={lbl}>Origem da Mercadoria</label>
              <select className={inp} value={formData.origem} onChange={e => f('origem', parseInt(e.target.value))}>
                {ORIGEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="px-5 pt-4 pb-28 md:py-4 border-t border-zinc-800 bg-zinc-950 shrink-0">
          <button
            onClick={handleSubmit as React.MouseEventHandler}
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-base bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all flex items-center justify-center gap-2 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.15)]"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Salvar Alterações</>}
          </button>
        </div>

      </div>
    </div>
  );
}
