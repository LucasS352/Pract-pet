"use client";
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Save, ArrowLeft, RefreshCw, Search, Filter, X, Loader2, CheckCircle2, Camera, Trash2, Package } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { compressImageForUpload, isSupportedImageFile } from '@/lib/imageCompression';

interface ProductRow {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl?: string;
  priceSell: string;
  priceCost: string;
  stock: string;
  barcode?: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}

export default function MassEditPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const backPath = location.pathname.startsWith('/petshop') ? '/petshop/produtos' : '/dashboard/inventory';
  const backLabel = location.pathname.startsWith('/petshop') ? 'Voltar para Produtos Pet' : 'Voltar ao Catálogo Geral';
  const isStockist = user?.role === 'stockist';
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get('/products?limit=5000'),
        api.get('/categories'),
      ]);
      const cats: { id: string; name: string }[] = catRes.data;
      const catMap: Record<string, string> = {};
      for (const c of cats) catMap[c.id] = c.name;
      setCategories(cats);
      setProducts((prodRes.data.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: catMap[p.categoryId] || 'Sem categoria',
        imageUrl: p.imageUrl,
        priceSell: Number(p.priceSell).toFixed(2),
        priceCost: Number(p.priceCost).toFixed(2),
        stock: Number(p.stock).toFixed(2),
        barcode: p.barcode || '',
        dirty: false,
        saving: false,
        saved: false,
      })));
    } catch {
      toast.error('Erro ao carregar produtos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateField = (id: string, field: keyof ProductRow, value: any) => {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: value, dirty: true, saved: false } : p
    ));
  };

  const handleImageUpload = async (id: string, file: File) => {
    if (!isSupportedImageFile(file)) {
      toast.error('Por favor, selecione um arquivo de imagem.');
      return;
    }
    setUploadingId(id);
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
      const newUrl = res.data.imageUrl || res.data.url;
      updateField(id, 'imageUrl', newUrl);
      toast.success('Foto do produto atualizada!');
    } catch (err: any) {
      toast.error(String(err?.response?.data?.message || 'Erro ao enviar a imagem.'));
    } finally {
      setUploadingId(null);
    }
  };

  const removeImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateField(id, 'imageUrl', '');
  };

  const saveRow = async (row: ProductRow) => {
    setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saving: true } : p));
    try {
      await api.patch('/products/' + row.id, {
        name: row.name.trim(),
        imageUrl: row.imageUrl ? row.imageUrl : null,
        priceSell: parseFloat(row.priceSell) || 0,
        priceCost: parseFloat(row.priceCost) || 0,
        stock: parseFloat(row.stock) || 0,
        categoryId: row.categoryId,
      });
      setProducts(prev => prev.map(p =>
        p.id === row.id ? { ...p, saving: false, dirty: false, saved: true } : p
      ));
      setTimeout(() => {
        setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saved: false } : p));
      }, 2500);
    } catch {
      toast.error('Erro ao salvar produto.');
      setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saving: false } : p));
    }
  };

  const saveAllDirty = async () => {
    const dirty = products.filter(p => p.dirty);
    if (dirty.length === 0) { toast.info('Nenhuma alteração pendente.'); return; }
    setSavingAll(true);
    for (const row of dirty) await saveRow(row);
    setSavingAll(false);
    toast.success(dirty.length + ' produto(s) atualizados com sucesso!');
  };

  const dirtyCount = products.filter(p => p.dirty).length;

  const filtered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || (p.barcode || '').includes(s));
    }
    if (filterCat) list = list.filter(p => p.categoryId === filterCat);
    return list;
  }, [products, search, filterCat]);

  return (
    <div className="space-y-4 lg:space-y-6 animate-in fade-in duration-500 w-full max-w-none pb-[calc(10rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link to={backPath} className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors">
              <ArrowLeft size={16} /> {backLabel}
            </Link>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white flex items-center gap-3 flex-wrap">
              Edicao em Massa
              <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-md border border-purple-500/20 uppercase font-bold tracking-widest">Bulk Edit</span>
            </h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={load} disabled={loading} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all text-sm disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Recarregar</span>
            </button>
            <button onClick={saveAllDirty} disabled={savingAll || dirtyCount === 0}
              className={'px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 text-sm disabled:opacity-50 ' + (dirtyCount > 0 ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-zinc-800 text-zinc-500')}>
              {savingAll ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span className="hidden sm:inline">Salvar Alteracoes</span>
              <span className="sm:hidden">Salvar</span>
              {dirtyCount > 0 && <span className="bg-white text-purple-700 font-black text-xs px-1.5 py-0.5 rounded-full">{dirtyCount}</span>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Pesquisar produto..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={14} /></button>}
        </div>
        <div className="relative">
          <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="pl-9 pr-8 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors appearance-none">
            <option value="">Todas as Categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl whitespace-nowrap">
          <span className="font-bold text-white">{filtered.length}</span> produto(s)
          {dirtyCount > 0 && <span className="text-amber-400 font-bold ml-1">. {dirtyCount} alterado(s)</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-zinc-500">
          <Loader2 size={22} className="animate-spin" /><span className="font-semibold">Carregando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-600">
          <Package size={40} className="opacity-50" /><span className="font-semibold">Nenhum produto encontrado.</span>
        </div>
      ) : (
        <>
          {/* Tabela Desktop */}
          <div className="hidden lg:block bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-zinc-950 text-zinc-400 text-xs">
                  <tr>
                    <th className="px-3 py-3 font-bold uppercase tracking-widest w-[70px] text-center">Foto</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-widest min-w-[240px]">Produto / Nome</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-widest w-[14%]">Categoria</th>
                    {!isStockist && <th className="px-3 py-3 font-bold uppercase tracking-widest text-right w-[120px]">Venda R$</th>}
                    <th className="px-3 py-3 font-bold uppercase tracking-widest text-right w-[120px]">Custo R$</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-widest text-right w-[120px]">Estoque</th>
                    <th className="px-3 py-3 font-bold uppercase tracking-widest text-center w-[80px]">Salvar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filtered.map(row => (
                    <tr key={row.id} className={'transition-colors group ' + (row.dirty ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-zinc-800/30') + (row.saved ? ' bg-emerald-500/5' : '')}>
                      {/* Foto / Upload */}
                      <td className="px-3 py-2 w-[70px] text-center">
                        <label className="relative inline-flex w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700/80 hover:border-purple-500 items-center justify-center cursor-pointer overflow-hidden group/img transition shadow-inner">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(row.id, f);
                            }}
                          />
                          {uploadingId === row.id ? (
                            <Loader2 size={16} className="animate-spin text-purple-400" />
                          ) : row.imageUrl ? (
                            <>
                              <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition gap-1">
                                <Camera size={14} className="text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-zinc-500 group-hover/img:text-purple-400 transition" title="Clique para adicionar foto">
                              <Camera size={16} />
                            </div>
                          )}
                        </label>
                        {row.imageUrl && (
                          <button
                            type="button"
                            onClick={e => removeImage(row.id, e)}
                            className="block mx-auto text-[10px] text-zinc-600 hover:text-red-400 transition mt-0.5 cursor-pointer"
                            title="Remover foto"
                          >
                            remover
                          </button>
                        )}
                      </td>

                      {/* Nome do Produto (Editável) */}
                      <td className="px-3 py-2 min-w-[240px]">
                        <input
                          type="text"
                          value={row.name}
                          onChange={e => updateField(row.id, 'name', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRow(row)}
                          className="w-full bg-zinc-950/60 border border-zinc-800 focus:border-purple-500 focus:bg-zinc-950 rounded-lg px-2.5 py-1.5 text-sm text-white font-semibold outline-none transition"
                          placeholder="Nome do produto..."
                        />
                        {row.barcode && <div className="text-[11px] text-zinc-500 font-mono mt-1 px-1">{row.barcode}</div>}
                      </td>

                      {/* Categoria */}
                      <td className="px-3 py-2 w-[14%]">
                        <select value={row.categoryId} onChange={e => updateField(row.id, 'categoryId', e.target.value)}
                          className="w-full bg-zinc-950/50 border border-zinc-800/80 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer">
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>

                      {!isStockist && (
                      <td className="px-3 py-2 w-[120px]">
                        <input type="number" step="0.01" value={row.priceSell}
                          onChange={e => updateField(row.id, 'priceSell', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRow(row)}
                          className="w-full text-right bg-zinc-950/50 border border-zinc-800/80 rounded-lg px-3 py-2 text-sm text-emerald-400 font-black focus:outline-none focus:border-emerald-500 focus:bg-zinc-900 transition-colors" />
                      </td>
                      )}
                      <td className="px-3 py-2 w-[120px]">
                        <input type="number" step="0.01" value={row.priceCost}
                          onChange={e => updateField(row.id, 'priceCost', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRow(row)}
                          className="w-full text-right bg-zinc-950/50 border border-zinc-800/80 rounded-lg px-3 py-2 text-sm text-rose-400 font-bold focus:outline-none focus:border-rose-500 focus:bg-zinc-900 transition-colors" />
                      </td>
                      <td className="px-3 py-2 w-[120px]">
                        <input type="number" step="0.001" value={row.stock}
                          onChange={e => updateField(row.id, 'stock', e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveRow(row)}
                          className="w-full text-right bg-zinc-950 border-2 border-zinc-800 rounded-lg px-3 py-2 text-sm text-blue-400 font-black focus:outline-none focus:border-blue-500 focus:bg-zinc-900 transition-colors" />
                      </td>
                      <td className="px-3 py-2 w-[80px] text-center">
                        {row.saving ? <Loader2 size={18} className="animate-spin text-blue-400 mx-auto" />
                          : row.saved ? <CheckCircle2 size={18} className="text-emerald-400 mx-auto" />
                          : row.dirty ? (
                            <button onClick={() => saveRow(row)} className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg transition-colors cursor-pointer" title="Salvar este produto">
                              <Save size={14} />
                            </button>
                          ) : <span className="text-zinc-700 text-xs">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards Mobile (Edição Rápida Completa) */}
          <div className="lg:hidden space-y-3 pb-28">
            {filtered.map(row => (
              <div key={row.id} className={'bg-zinc-900 border rounded-2xl overflow-hidden shadow-sm transition-all p-3 space-y-3 ' + (row.saved ? 'border-emerald-500/50' : row.dirty ? 'border-amber-500/40' : 'border-zinc-800')}>
                {/* Cabeçalho do Card: Imagem clicável + Input de Nome */}
                <div className="flex items-center gap-3">
                  <label className="relative w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700/80 hover:border-purple-500 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden group/img transition shadow-inner">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(row.id, f);
                      }}
                    />
                    {uploadingId === row.id ? (
                      <Loader2 size={20} className="animate-spin text-purple-400" />
                    ) : row.imageUrl ? (
                      <>
                        <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                          <Camera size={18} className="text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-500 group-hover/img:text-purple-400 transition" title="Toque para adicionar foto">
                        <Camera size={18} />
                      </div>
                    )}
                  </label>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => updateField(row.id, 'name', e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-700/80 focus:border-purple-500 focus:bg-zinc-950 rounded-xl px-3 py-2 text-sm text-white font-bold outline-none transition"
                      placeholder="Nome do produto..."
                    />
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 px-1">
                      <span className="font-mono">{row.barcode || 'Sem código'}</span>
                      {row.imageUrl && (
                        <button
                          type="button"
                          onClick={e => removeImage(row.id, e)}
                          className="text-zinc-600 hover:text-red-400 transition cursor-pointer"
                        >
                          Remover foto
                        </button>
                      )}
                    </div>
                  </div>

                  {row.saving ? <Loader2 size={18} className="animate-spin text-blue-400 shrink-0" />
                    : row.saved ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                    : row.dirty ? <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    : null}
                </div>

                {/* Grid de Valores: Venda, Custo, Estoque */}
                <div className={`grid ${isStockist ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                  {!isStockist && (
                  <div>
                    <label className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">Venda R$</label>
                    <input type="number" inputMode="decimal" step="0.01" value={row.priceSell}
                      onChange={e => updateField(row.id, 'priceSell', e.target.value)}
                      className="w-full text-center bg-zinc-950 border border-emerald-500/30 rounded-xl px-1 py-2.5 text-sm text-emerald-400 font-black focus:outline-none focus:border-emerald-400 transition-colors" />
                  </div>
                  )}
                  <div>
                    <label className="text-[9px] font-bold text-rose-400 uppercase tracking-wider block mb-1">Custo R$</label>
                    <input type="number" inputMode="decimal" step="0.01" value={row.priceCost}
                      onChange={e => updateField(row.id, 'priceCost', e.target.value)}
                      className="w-full text-center bg-zinc-950 border border-rose-500/30 rounded-xl px-1 py-2.5 text-sm text-rose-400 font-bold focus:outline-none focus:border-rose-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-blue-400 uppercase tracking-wider block mb-1">Estoque</label>
                    <input type="number" inputMode="decimal" step="0.001" value={row.stock}
                      onChange={e => updateField(row.id, 'stock', e.target.value)}
                      className="w-full text-center bg-zinc-950 border border-blue-500/30 rounded-xl px-1 py-2.5 text-sm text-blue-400 font-black focus:outline-none focus:border-blue-400 transition-colors" />
                  </div>
                </div>

                {/* Categoria e Ação Salvar Individual */}
                <div className="flex items-center gap-2 pt-1">
                  <select value={row.categoryId} onChange={e => updateField(row.id, 'categoryId', e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {row.dirty && (
                    <button onClick={() => saveRow(row)} disabled={row.saving}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-xs font-bold transition-colors active:scale-95 disabled:opacity-50 cursor-pointer">
                      {row.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      Salvar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Botão Flutuante de Salvar Tudo */}
          {dirtyCount > 0 && (
            <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 right-0 p-3.5 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/90 z-40 shadow-[0_-8px_20px_rgba(0,0,0,0.6)]">
              <button onClick={saveAllDirty} disabled={savingAll}
                className="w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 active:scale-[0.98] text-white transition-all shadow-lg shadow-purple-600/30 text-base disabled:opacity-50 cursor-pointer">
                {savingAll ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar {dirtyCount} Alteração{dirtyCount > 1 ? 'ões' : ''}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
