'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { isPetshopServiceCategory } from '@/pages/petshop/product-catalog';
import { useDemoMissionsStore } from '@/store/demoMissions';
import { toast } from 'sonner';
import { PackagePlus, X, Loader2, Save, DollarSign, Barcode, CheckCircle2, HelpCircle, Upload, Image, Trash2 } from 'lucide-react';
import { ProductSearchSelect } from './ProductSearchSelect';
import { useKdsConfig } from '@/hooks/useKdsEnabled';
import { ProductPreparationFields } from './ProductPreparationFields';
import { useAuthStore } from '@/store/auth';
import { compressImageForUpload, MAX_CLIENT_UPLOAD_BYTES } from '@/lib/imageCompression';

const UNIT_OPTIONS = ['UN', 'KG', 'LT', 'CX', 'DZ', 'PCT', 'FD', 'ML', 'GR'];
const ORIGEM_OPTIONS = [
  { value: 0, label: '0 — Nacional' },
  { value: 1, label: '1 — Estrangeira (Importação direta)' },
  { value: 2, label: '2 — Estrangeira (Mercado interno)' },
  { value: 3, label: '3 — Nacional (Conteúdo importado > 40%)' },
];

interface GrupoTributacao { id: string; nome: string; csosn?: string; cfop: string; aliqIcms?: string; }

export function AddProductModal({ isOpen, onClose, onSuccess, variant = 'default' }: {
  isOpen: boolean; onClose: () => void; onSuccess: () => void; variant?: 'default' | 'petshop';
}) {
  const { user } = useAuthStore();
  const { enabled: kdsEnabled, carvoariaEnabled } = useKdsConfig();
  const isStockist = user?.role === 'stockist';
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [creatingPetCategory, setCreatingPetCategory] = useState(false);
  const [grupos, setGrupos] = useState<GrupoTributacao[]>([]);
  const [loading, setLoading] = useState(false);

  // ── EAN Lookup state ──────────────────────────────────────
  const [eanStatus, setEanStatus] = useState<'idle' | 'loading' | 'found' | 'not_found'>('idle');
  const [eanLookupInfo, setEanLookupInfo] = useState<string | null>(null);
  const eanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const copyModalRef = useRef(false);
  const historyToken = useRef(`petshop-product-${Math.random().toString(36).slice(2)}`);
  const historyCleanup = useRef<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen || variant !== 'petshop') return;
    const token = historyToken.current;
    if (historyCleanup.current !== null) window.clearTimeout(historyCleanup.current);
    historyCleanup.current = null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (window.history.state?.petshopModal !== token) window.history.pushState({ ...window.history.state, petshopModal: token }, '');
    const close = () => {
      if (copyModalRef.current) {
        setShowCopyModal(false);
        window.history.pushState({ ...window.history.state, petshopModal: token }, '');
      } else closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (copyModalRef.current) setShowCopyModal(false);
      else closeRef.current();
    };
    window.addEventListener('popstate', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('popstate', close);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (window.history.state?.petshopModal === token) historyCleanup.current = window.setTimeout(() => {
        historyCleanup.current = null;
        if (window.history.state?.petshopModal === token) window.history.back();
      }, 0);
    };
  }, [isOpen, variant]);

  const uploadFile = async (file: File) => {
    if (file.size > MAX_CLIENT_UPLOAD_BYTES) {
      toast.error('A imagem deve ter no máximo 15MB.');
      return;
    }

    setIsUploading(true);
    try {
      const compressedFile = await compressImageForUpload(file, {
        maxEdge: 800,
        targetBytes: 200 * 1024,
        baseName: 'product',
      });

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

  const emptyForm = {
    name: '', barcode: '', unit: 'UN',
    priceCost: '', priceSell: '', stock: '', categoryId: '',
    ncm: '', cest: '', origem: 0, grupoTributacaoId: '', imageUrl: '',
    requiresKitchen: false, requiresBar: false, barStation: 'BAR', preparationIngredients: '', requiresCarvoaria: false, serviceTimerMinutes: null as number | null, assetTrackingTotal: null as number | null,
    isComposite: false,
    volumeUnit: '',
    volumeCapacity: '',
    minStock: '',
  };

  const [formData, setFormData] = useState(emptyForm);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  copyModalRef.current = showCopyModal;

  // ── Auto-sugestão tributária ──
  const [suggestedGroupName, setSuggestedGroupName] = useState<string | null>(null);
  const [suggestedGroupId, setSuggestedGroupId] = useState<string | null>(null);
  const suggestDebounceRef = useRef<any | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(emptyForm);
    setModifierGroups([]);
    Promise.all([
      api.get('/categories'),
      api.get('/tributacao'),
      api.get('/products?limit=10000'),
    ]).then(([catRes, grupRes, prodRes]) => {
      const availableCategories = variant === 'petshop' ? catRes.data.filter((category: { name: string }) => !isPetshopServiceCategory(category.name)) : catRes.data;
      setCategories(availableCategories);
      setGrupos(grupRes.data);
      setAllProducts(prodRes.data.data);
      if (availableCategories.length > 0) setFormData(f => ({ ...f, categoryId: availableCategories[0].id }));
    }).catch(() => toast.error('Erro ao carregar dados auxiliares'));
  }, [isOpen]);

  const addGroup = () => {
    setModifierGroups(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        name: '',
        minSelected: 1,
        maxSelected: 1,
        options: []
      }
    ]);
  };

  const removeGroup = (groupId: string) => {
    setModifierGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const updateGroupName = (groupId: string, name: string) => {
    setModifierGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g));
  };

  const addOption = (groupId: string) => {
    setModifierGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        options: [
          ...g.options,
          {
            id: Math.random().toString(),
            name: '',
            componentProductId: '',
            quantity: 1,
            priceAdjustment: 0
          }
        ]
      };
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
      return {
        ...g,
        options: g.options.map((o: any) => o.id === optionId ? { ...o, ...fields } : o)
      };
    }));
  };

  // ── EAN Lookup handler ───────────────────────────────────
  const handleEanChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, barcode: value }));
    setEanStatus('idle');
    setEanLookupInfo(null);

    if (eanDebounceRef.current) clearTimeout(eanDebounceRef.current);

    // Aguarda pelo menos 8 dígitos para disparar o lookup (EAN-8, EAN-13, EAN-14)
    const clean = value.trim().replace(/\D/g, '');
    if (clean.length < 8 || clean.length > 14) return;

    eanDebounceRef.current = setTimeout(async () => {
      setEanStatus('loading');
      try {
        const res = await api.get(`/products/lookup/${clean}`);
        const product = res.data.data;

        if (product) {
          const finalName = formData.name || product.name;
          // Preenche automaticamente os campos — mantém editáveis
          setFormData(prev => ({
            ...prev,
            name: prev.name || product.name,          // só preenche se vazio
            ncm:  prev.ncm  || product.ncm  || '',
            cest: prev.cest || product.cest || '',
            unit: product.unit || prev.unit,
            imageUrl: product.imageUrl || prev.imageUrl,
          }));
          setEanStatus('found');
          setEanLookupInfo(`${product.name}${product.brand ? ` · ${product.brand}` : ''}`);
          // Trigger suggestion
          fetchTaxGroupSuggestion(finalName);
        } else {
          setEanStatus('not_found');
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          setEanStatus('not_found');
        } else {
          setEanStatus('idle');
          toast.error(`Erro no lookup: ${err.message}`);
        }
      }
    }, 400);
  }, []);

  if (!isOpen) return null;

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

  // Margem estimada
  const cost = parseFloat(formData.priceCost) || 0;
  const sell = parseFloat(formData.priceSell) || 0;
  const margin = sell > cost && sell > 0 ? (((sell - cost) / sell) * 100).toFixed(1) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) { toast.error('Nome da Mercadoria é obrigatório.'); return; }
    if (!formData.categoryId) { toast.error('Selecione uma Categoria.'); return; }
    if (!formData.priceSell) { toast.error('Preço de Venda é obrigatório.'); return; }

    if (formData.isComposite) {
      for (const g of modifierGroups) {
        if (!g.name.trim()) {
          toast.error("Por favor, preencha o nome de todos os grupos de adicionais.");
          return;
        }
        if (g.options.length === 0) {
          toast.error(`O grupo "${g.name}" deve ter pelo menos uma opção.`);
          return;
        }
        for (const o of g.options) {
          if (!o.componentProductId) {
            toast.error(`Por favor, selecione um ingrediente para todas as opções no grupo "${g.name}".`);
            return;
          }
          if (!o.quantity || parseFloat(o.quantity) <= 0) {
            toast.error(`A quantidade do ingrediente deve ser maior que zero no grupo "${g.name}".`);
            return;
          }
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

      await api.post('/products', {
        name:              formData.name,
        barcode:           formData.barcode   || undefined,
        unit:              formData.unit       || 'UN',
        priceCost:         parseFloat(formData.priceCost)  || 0,
        priceSell:         parseFloat(formData.priceSell)  || 0,
        stock:             formData.isComposite && modifierGroups.length > 0 ? 0 : (parseFloat(formData.stock) || 0),
        categoryId:        formData.categoryId,
        ncm:               formData.ncm       || undefined,
        cest:              formData.cest      || undefined,
        origem:            formData.origem,
        grupoTributacaoId: formData.grupoTributacaoId || undefined,
        imageUrl:          formData.imageUrl  || undefined,
        isComposite:       formData.isComposite,
        volumeUnit:        formData.volumeUnit || undefined,
        volumeCapacity:    formData.volumeCapacity ? parseFloat(formData.volumeCapacity) : undefined,
        minStock:          formData.minStock ? parseFloat(formData.minStock) : null,
        ...(kdsEnabled ? { requiresKitchen: formData.requiresKitchen, requiresBar: formData.requiresBar, barStation: formData.barStation, requiresCarvoaria: formData.requiresCarvoaria, serviceTimerMinutes: formData.serviceTimerMinutes, assetTrackingTotal: formData.assetTrackingTotal, preparationIngredients: formData.preparationIngredients || null } : {}),
        modifierGroups:    formData.isComposite ? payloadGroups : undefined,
      });
      useDemoMissionsStore.getState().completeMission('productCreated');
      toast.success('Produto cadastrado com sucesso!');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string }; status?: number } };
      const status  = apiErr.response?.status;
      const message = apiErr.response?.data?.message;
      if (status === 409) {
        toast.error(message || 'Já existe um produto com este nome. Escolha outro nome.');
      } else {
        toast.error(message || 'Erro ao cadastrar produto.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-sm placeholder-zinc-600';
  const labelCls = 'text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5 block';
  const sectionCls = 'bg-zinc-950/60 border border-zinc-800 rounded-2xl p-5 space-y-4';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm ${variant === 'petshop' ? 'petshop-product-modal' : ''}`}>
      <div role="dialog" aria-modal="true" aria-label="Novo produto" className="bg-zinc-900 border-l border-zinc-800 w-full max-w-lg h-dvh shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">

        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-zinc-800 bg-zinc-950/70 shrink-0">
          <h2 className="text-xl font-black text-white flex items-center gap-3">
            <PackagePlus className="text-blue-500" size={24} />
            Novo Produto
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar cadastro de produto" className="grid h-11 w-11 place-items-center bg-zinc-800 hover:bg-zinc-700 rounded-full transition text-zinc-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Form — único, scrollável */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">

          {/* ── FOTO DO PRODUTO ──────────────────────────────── */}
          <div className={sectionCls} data-product-section="image">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-400 border-b border-zinc-800 pb-2 mb-1">Foto do Produto</p>
            
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
                    Arraste uma imagem ou clique para selecionar (PNG, JPG, máx. 15 MB)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── DADOS PRINCIPAIS ──────────────────────────────── */}
          <div className={sectionCls} data-product-section="main">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-400 border-b border-zinc-800 pb-2 mb-1">Informações principais</p>

            <div>
              <label className={labelCls}>Nome da Mercadoria <span className="text-red-500">*</span></label>
              <input
                required
                className={inputCls}
                placeholder="Ex: Ração Golden Special Frango e Carne 15kg"
                value={formData.name}
                onChange={e => handleNameChange(e.target.value)}
              />
              
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

            <div>
              <div>
                <label className={labelCls}>Categoria <span className="text-red-500">*</span></label>
                <select required className={inputCls} value={formData.categoryId} onChange={e => f('categoryId', e.target.value)}>
                  <option value="" disabled>Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {variant === 'petshop' && categories.length === 0 && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  Nenhuma categoria de mercadoria cadastrada. Crie uma categoria para separar produtos dos serviços.
                  <button type="button" disabled={creatingPetCategory} onClick={async () => {
                    setCreatingPetCategory(true);
                    try {
                      const { data } = await api.post('/categories', { name: 'Produtos Pet' });
                      setCategories([data]);
                      setFormData(current => ({ ...current, categoryId: data.id }));
                    } catch { toast.error('Não foi possível criar a categoria Produtos Pet.'); }
                    finally { setCreatingPetCategory(false); }
                  }} className="mt-2 block min-h-11 rounded-lg border border-amber-400 bg-white px-3 font-semibold">{creatingPetCategory ? 'Criando…' : 'Criar categoria Produtos Pet'}</button>
                </div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="add-product-barcode">
                  <span className="flex items-center gap-1.5">
                    <Barcode size={12} className="text-zinc-500" />
                    Cód. Barras (EAN-13)
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="add-product-barcode"
                    className={`${inputCls} font-mono pr-10`}
                    placeholder="Bipe ou digite 13 dígitos..."
                    value={formData.barcode}
                    onChange={e => handleEanChange(e.target.value)}
                    maxLength={14}
                  />
                  {/* Indicador de status do lookup */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {eanStatus === 'loading' && (
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                    )}
                    {eanStatus === 'found' && (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    )}
                    {eanStatus === 'not_found' && (
                      <HelpCircle size={16} className="text-zinc-500" />
                    )}
                  </div>
                </div>
                {/* Badge de feedback do lookup */}
                {eanStatus === 'found' && eanLookupInfo && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 size={11} />
                    <span className="truncate">Identificado: {eanLookupInfo}</span>
                  </div>
                )}
                {eanStatus === 'not_found' && (
                  <div className="mt-1.5 text-[11px] text-zinc-500 font-medium">
                    EAN não encontrado na base mestre — preencha manualmente.
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Unidade de Venda</label>
                <select className={inputCls} value={formData.unit} onChange={e => f('unit', e.target.value)}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── PREÇOS & ESTOQUE ──────────────────────────────── */}
          <div className={sectionCls} data-product-section="commercial">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400 border-b border-zinc-800 pb-2 mb-1">Comercial e estoque</p>

            <div>
              <label className={labelCls}>Preço de Venda <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                <input required={!isStockist} type="number" step="0.01" min="0" className={`${inputCls} pl-9 ${isStockist ? 'text-zinc-600 cursor-not-allowed' : 'text-emerald-400 font-black'}`} placeholder="0.00" value={formData.priceSell} onChange={e => !isStockist && f('priceSell', e.target.value)} disabled={isStockist} title={isStockist ? 'Estoquista não pode alterar preço de venda' : ''} />
              </div>
              {isStockist && <p className="text-[10px] text-amber-500/70 mt-1">🔒 Sem permissão para alterar preço de venda</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Custo de Compra</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                  <input
                    type="number" step="0.01" min="0"
                    className={`${inputCls} pl-9 text-rose-400 font-bold`}
                    placeholder="0.00"
                    value={formData.priceCost}
                    onChange={e => f('priceCost', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Estoque Inicial</label>
                <input
                  type="number" step="0.001" min="0"
                  disabled={formData.isComposite && modifierGroups.length > 0}
                  className={`${inputCls} text-blue-400 font-bold disabled:opacity-50`}
                  placeholder={formData.isComposite && modifierGroups.length > 0 ? "Composto" : "0"}
                  value={formData.isComposite && modifierGroups.length > 0 ? "" : formData.stock}
                  onChange={e => f('stock', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Estoque Mínimo <span className="text-zinc-600 font-normal">(Opcional)</span></label>
                <input
                  type="number" step="0.001" min="0"
                  className={`${inputCls} text-amber-400 font-bold`}
                  placeholder="Padrão global"
                  value={formData.minStock}
                  onChange={e => f('minStock', e.target.value)}
                  title="Deixe vazio para usar o limite global de alerta de reposição"
                />
              </div>
            </div>

            {/* Margin indicator */}
            {margin !== null && (
              <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl mt-2">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <DollarSign size={13} className="text-emerald-500" /> Margem de Lucro Estimada
                </span>
                <span className={`text-base font-black ${Number(margin) > 30 ? 'text-emerald-400' : 'text-yellow-500'}`}>
                  {margin}%
                </span>
              </div>
            )}
          </div>

          {/* ── FRACIONAMENTO & COMPOSIÇÃO ────────────────────── */}
          <div className={sectionCls} data-product-section="composition">
            <p className="text-[11px] font-black uppercase tracking-widest text-indigo-400 border-b border-zinc-800 pb-2 mb-1">Fracionamento &amp; Composição</p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Fracionamento Interno</label>
                <select 
                  className={inputCls} 
                  value={formData.volumeUnit || ''} 
                  onChange={e => f('volumeUnit', e.target.value)}
                >
                  <option value="">Não Fracionado</option>
                  <option value="ML">ML (Mililitros)</option>
                  <option value="KG">KG (Quilogramas / Granel)</option>
                  <option value="UN">UN (Unidades)</option>
                </select>
              </div>
              {formData.volumeUnit && (
                <div>
                  <label className={labelCls}>
                    {formData.volumeUnit === 'ML' ? 'Capacidade Garrafa (ml)' : formData.volumeUnit === 'KG' ? 'Peso Total Saco/Embalagem (kg)' : 'Unidades por Caixa'}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    required
                    className={inputCls}
                    placeholder={formData.volumeUnit === 'ML' ? 'Ex: 950' : formData.volumeUnit === 'KG' ? 'Ex: 15' : 'Ex: 20'}
                    value={formData.volumeCapacity || ''}
                    onChange={e => f('volumeCapacity', e.target.value)}
                  />
                </div>
              )}
            </div>

            {kdsEnabled && <ProductPreparationFields carvoariaEnabled={carvoariaEnabled} value={formData} onChange={value => setFormData(prev => ({ ...prev, ...value }))} />}

            <div className="flex items-center justify-between py-2 border-t border-zinc-800/50 mt-2">
              <span className="text-xs font-bold text-zinc-300">Produto Composto / Com adicionais</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={formData.isComposite}
                  onChange={e => f('isComposite', e.target.checked)}
                />
                <div className="w-11 h-6 bg-zinc-850 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-650 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
              </label>
            </div>

            {formData.isComposite && (
              <div className="space-y-4 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-400">Grupos de Adicionais</span>
                  <div className="flex gap-3">
                    {allProducts.some(p => p.isComposite) && (
                      <button
                        type="button"
                        onClick={() => setShowCopyModal(true)}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Copiar Adicionais
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={addGroup}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 transition"
                    >
                      + Adicionar Grupo
                    </button>
                  </div>
                </div>

                {modifierGroups.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4 bg-zinc-950/30 rounded-xl border border-zinc-800/50">
                    Nenhum grupo configurado.
                  </p>
                ) : (
                  modifierGroups.map((g, gIdx) => (
                    <div key={g.id || gIdx} className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <input
                          className="bg-transparent border-b border-zinc-800 hover:border-zinc-700 focus:border-blue-500 text-sm font-bold text-white focus:outline-none transition py-0.5 px-1 flex-1 placeholder-zinc-600"
                          value={g.name}
                          onChange={e => updateGroupName(g.id, e.target.value)}
                          placeholder="Nome do Grupo (ex: Escolha o Gelo)"
                        />
                        <button
                          type="button"
                          onClick={() => removeGroup(g.id)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-400 transition"
                        >
                          Remover Grupo
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-black tracking-widest text-zinc-500 uppercase px-1">
                          <div className="col-span-5">Ingrediente</div>
                          <div className="col-span-4">Qtd Baixa</div>
                          <div className="col-span-2 text-right">Preço +</div>
                          <div className="col-span-1"></div>
                        </div>

                        {g.options.map((opt: any, oIdx: number) => {
                          const compProd = allProducts.find(p => p.id === opt.componentProductId);
                          const unitLabel = compProd?.volumeUnit || compProd?.unit || 'UN';

                          return (
                            <div key={opt.id || oIdx} className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-5">
                                <ProductSearchSelect
                                  products={allProducts.filter(p => !p.isComposite && p.active !== false)}
                                  value={opt.componentProductId}
                                  onChange={(productId) => {
                                    const selected = allProducts.find(p => p.id === productId);
                                    updateOption(g.id, opt.id, {
                                      componentProductId: productId,
                                      name: opt.name || selected?.name || ''
                                    });
                                  }}
                                />
                              </div>
                              <div className="col-span-4 flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.001"
                                  required
                                  className="w-full bg-zinc-950 border border-zinc-855 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                                  placeholder="Qtd"
                                  value={opt.quantity}
                                  onChange={e => updateOption(g.id, opt.id, { quantity: e.target.value })}
                                />
                                <span className="text-[10px] text-zinc-500 font-bold">{unitLabel}</span>
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-zinc-950 border border-zinc-855 rounded-lg px-2 py-1.5 text-xs text-emerald-400 text-right font-bold focus:outline-none focus:border-blue-500 transition"
                                  placeholder="0.00"
                                  value={opt.priceAdjustment}
                                  onChange={e => updateOption(g.id, opt.id, { priceAdjustment: e.target.value })}
                                />
                              </div>
                              <div className="col-span-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeOption(g.id, opt.id)}
                                  className="text-rose-500 hover:text-rose-400 transition"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => addOption(g.id)}
                          className="w-full py-1.5 border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/20 text-zinc-400 hover:text-zinc-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                        >
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
                <p className="text-xs text-zinc-500">Selecione o produto composto para copiar todos os adicionais e ingredientes:</p>
                
                <select
                  className={inputCls}
                  onChange={e => {
                    const source = allProducts.find(p => p.id === e.target.value);
                    if (source && source.modifierGroups) {
                      const clonedGroups = source.modifierGroups.map((g: any) => ({
                        id: Math.random().toString(),
                        name: g.name,
                        minSelected: g.minSelected,
                        maxSelected: g.maxSelected,
                        options: g.options.map((o: any) => ({
                          id: Math.random().toString(),
                          name: o.name,
                          componentProductId: o.componentProductId,
                          quantity: parseFloat(o.quantity) || 0,
                          priceAdjustment: parseFloat(o.priceAdjustment) || 0
                        }))
                      }));
                      setModifierGroups(clonedGroups);
                      toast.success(`Ficha técnica copiada de "${source.name}"!`);
                    }
                    setShowCopyModal(false);
                  }}
                >
                  <option value="">-- Escolha um Copão / Combo --</option>
                  {allProducts
                    .filter(p => p.isComposite)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))
                  }
                </select>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCopyModal(false)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-bold transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}



          {/* ── FISCAL ─────────────────────────────────────────── */}
          <div className={sectionCls} data-product-section="tax">
            <p className="text-[11px] font-black uppercase tracking-widest text-indigo-400 border-b border-zinc-800 pb-2 mb-1">Fiscal / NFC-e</p>

            <div>
              <label className={labelCls}>Grupo Tributário</label>
              <select
                className={`${inputCls} border-indigo-500/30`}
                value={formData.grupoTributacaoId}
                onChange={e => f('grupoTributacaoId', e.target.value)}
              >
                <option value="">— Sem Grupo Fiscal (Herdar da Categoria) —</option>
                {grupos.map(g => (
                  <option key={g.id} value={g.id}>{g.nome} (CFOP {g.cfop})</option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                ℹ️ Caso nenhum grupo seja selecionado, o produto herdará a tributação associada à categoria dele.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>NCM <span className="text-zinc-600 normal-case">(8 dígitos)</span></label>
                <input
                  className={`${inputCls} font-mono`}
                  placeholder="Ex: 22030000"
                  maxLength={8}
                  value={formData.ncm}
                  onChange={e => f('ncm', e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>CEST <span className="text-zinc-600 normal-case">(7 dígitos)</span></label>
                <input
                  className={`${inputCls} font-mono`}
                  placeholder="Ex: 0300500"
                  maxLength={7}
                  value={formData.cest}
                  onChange={e => f('cest', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Origem da Mercadoria</label>
              <select
                className={inputCls}
                value={formData.origem}
                onChange={e => f('origem', parseInt(e.target.value))}
              >
                {ORIGEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:py-4 border-t border-zinc-800 bg-zinc-950/70 shrink-0">
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold text-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.3)]"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> Salvar Produto</>}
          </button>
        </div>

      </div>
    </div>
  );
}
