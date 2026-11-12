import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Save, RefreshCw, Search, Loader2, CheckCircle2,
  Package, Camera, Box, Sparkles
} from 'lucide-react';
import { CatalogTabs, PageHeader, pageClass, primaryButton, secondaryButton, inputClass } from './ui';
import { money } from './types';
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

export default function PetshopMassEditPage() {
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
      const cats: { id: string; name: string }[] = catRes.data || [];
      const catMap: Record<string, string> = {};
      for (const c of cats) catMap[c.id] = c.name;
      setCategories(cats);

      const items = prodRes.data?.data || prodRes.data || [];
      setProducts(items.map((p: any) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId || '',
        categoryName: catMap[p.categoryId] || 'Sem categoria',
        imageUrl: p.imageUrl,
        priceSell: Number(p.priceSell || 0).toFixed(2),
        priceCost: Number(p.priceCost || 0).toFixed(2),
        stock: Number(p.stock || 0).toFixed(2),
        barcode: p.barcode || '',
        dirty: false,
        saving: false,
        saved: false,
      })));
    } catch {
      toast.error('Erro ao carregar catálogo para edição.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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
      const compressed = await compressImageForUpload(file, {
        maxEdge: 800,
        targetBytes: 200 * 1024,
        baseName: 'product',
      });
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await api.post('/products/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const imageUrl = res.data.url;
      await api.patch(`/products/${id}`, { imageUrl });
      updateField(id, 'imageUrl', imageUrl);
      setProducts(prev => prev.map(p => p.id === id ? { ...p, dirty: false, saved: true } : p));
      toast.success('Foto atualizada com sucesso!');
    } catch {
      toast.error('Erro ao fazer upload da imagem.');
    } finally {
      setUploadingId(null);
    }
  };

  const saveRow = async (row: ProductRow) => {
    setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saving: true } : p));
    try {
      await api.patch(`/products/${row.id}`, {
        name: row.name.trim(),
        categoryId: row.categoryId || undefined,
        priceSell: parseFloat(row.priceSell) || 0,
        priceCost: parseFloat(row.priceCost) || 0,
        stock: parseFloat(row.stock) || 0,
        barcode: row.barcode?.trim() || null,
      });
      setProducts(prev => prev.map(p =>
        p.id === row.id ? { ...p, dirty: false, saving: false, saved: true } : p
      ));
      setTimeout(() => {
        setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saved: false } : p));
      }, 2500);
    } catch {
      toast.error(`Erro ao salvar produto "${row.name}".`);
      setProducts(prev => prev.map(p => p.id === row.id ? { ...p, saving: false } : p));
    }
  };

  const saveAllDirty = async () => {
    const dirty = products.filter(p => p.dirty);
    if (dirty.length === 0) {
      toast.info('Nenhuma alteração pendente.');
      return;
    }
    setSavingAll(true);
    for (const row of dirty) {
      await saveRow(row);
    }
    setSavingAll(false);
    toast.success(`${dirty.length} produto(s) atualizados com sucesso!`);
  };

  const dirtyCount = products.filter(p => p.dirty).length;

  const filtered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || (p.barcode || '').includes(s));
    }
    if (filterCat) {
      list = list.filter(p => p.categoryId === filterCat);
    }
    return list;
  }, [products, search, filterCat]);

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Catálogo compartilhado com o PDV"
        title="Edição em Massa"
        description="Atualize rapidamente nomes, categorias, preços de custo, venda e saldos de estoque em lote."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className={`${secondaryButton} flex items-center gap-2`}
              title="Recarregar catálogo"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              onClick={saveAllDirty}
              disabled={savingAll || dirtyCount === 0}
              className={`${primaryButton} flex items-center gap-2 disabled:opacity-50`}
            >
              {savingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando…</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Salvar Alterações {dirtyCount > 0 && `(${dirtyCount})`}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <CatalogTabs />

      {/* Barra de Filtros e Busca */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pc-text-muted)]" />
            <input
              type="search"
              placeholder="Buscar por nome ou código de barras…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className={`${inputClass} sm:w-56`}
          >
            <option value="">Todas as categorias ({categories.length})</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--pc-text-secondary)]">
          <span>Exibindo <strong>{filtered.length}</strong> de <strong>{products.length}</strong></span>
          {dirtyCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              {dirtyCount} pendente(s)
            </span>
          )}
        </div>
      </div>

      {/* Tabela de Produtos */}
      <section className="pc-panel overflow-hidden" aria-label="Tabela de Edição em Massa">
        {loading ? (
          <div className="flex h-64 items-center justify-center gap-3 text-sm text-[var(--pc-text-secondary)]">
            <Loader2 size={24} className="animate-spin text-[var(--pc-action)]" />
            <span>Carregando produtos para edição rápida…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <Package size={36} className="text-[var(--pc-border-strong)]" />
            <p className="text-sm font-semibold text-[var(--pc-text)]">Nenhum produto encontrado</p>
            <p className="text-xs text-[var(--pc-text-muted)]">Tente ajustar a busca ou os filtros de categoria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] font-semibold text-[var(--pc-text-secondary)]">
                <tr>
                  <th className="w-16 px-3 py-3 text-center">Foto</th>
                  <th className="min-w-[260px] px-3 py-3">Produto / Nome</th>
                  <th className="w-44 px-3 py-3">Categoria</th>
                  <th className="w-32 px-3 py-3 text-right">Venda R$</th>
                  <th className="w-32 px-3 py-3 text-right">Custo R$</th>
                  <th className="w-28 px-3 py-3 text-right">Estoque</th>
                  <th className="w-36 px-3 py-3">Código de Barras</th>
                  <th className="w-24 px-3 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pc-border)]">
                {filtered.map(row => (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      row.dirty
                        ? 'bg-amber-50/70 hover:bg-amber-50'
                        : row.saved
                        ? 'bg-emerald-50/70 hover:bg-emerald-50'
                        : 'hover:bg-[var(--pc-surface-subtle)]/70'
                    }`}
                  >
                    {/* Foto */}
                    <td className="px-3 py-2 text-center">
                      <label
                        className="group relative inline-flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] transition hover:border-[var(--pc-action)]"
                        title="Clique para alterar a foto"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void handleImageUpload(row.id, f);
                          }}
                        />
                        {uploadingId === row.id ? (
                          <Loader2 size={16} className="animate-spin text-[var(--pc-action)]" />
                        ) : row.imageUrl ? (
                          <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Camera size={16} className="text-[var(--pc-text-muted)] group-hover:text-[var(--pc-action)]" />
                        )}
                      </label>
                    </td>

                    {/* Nome */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => updateField(row.id, 'name', e.target.value)}
                        className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--pc-text)] outline-none transition focus:border-[var(--pc-action)] focus:ring-1 focus:ring-[var(--pc-action)]"
                      />
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-2">
                      <select
                        value={row.categoryId}
                        onChange={e => {
                          const catId = e.target.value;
                          const catName = categories.find(c => c.id === catId)?.name || 'Sem categoria';
                          setProducts(prev => prev.map(p =>
                            p.id === row.id
                              ? { ...p, categoryId: catId, categoryName: catName, dirty: true, saved: false }
                              : p
                          ));
                        }}
                        className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1.5 text-xs text-[var(--pc-text)] outline-none transition focus:border-[var(--pc-action)]"
                      >
                        <option value="">Sem categoria</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Preço de Venda */}
                    <td className="px-3 py-2 text-right">
                      <div className="relative inline-block w-full">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pc-text-muted)]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.priceSell}
                          onChange={e => updateField(row.id, 'priceSell', e.target.value)}
                          className="w-full rounded-lg border border-[var(--pc-border)] bg-white py-1.5 pl-7 pr-2 text-right text-xs font-semibold tabular-nums text-[var(--pc-text)] outline-none transition focus:border-[var(--pc-action)]"
                        />
                      </div>
                    </td>

                    {/* Preço de Custo */}
                    <td className="px-3 py-2 text-right">
                      <div className="relative inline-block w-full">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pc-text-muted)]">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.priceCost}
                          onChange={e => updateField(row.id, 'priceCost', e.target.value)}
                          className="w-full rounded-lg border border-[var(--pc-border)] bg-white py-1.5 pl-7 pr-2 text-right text-xs font-medium tabular-nums text-[var(--pc-text-secondary)] outline-none transition focus:border-[var(--pc-action)]"
                        />
                      </div>
                    </td>

                    {/* Estoque */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.stock}
                        onChange={e => updateField(row.id, 'stock', e.target.value)}
                        className={`w-full rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1.5 text-right text-xs font-bold tabular-nums outline-none transition focus:border-[var(--pc-action)] ${
                          Number(row.stock) <= 0 ? 'text-[var(--pc-danger)]' : 'text-[var(--pc-text)]'
                        }`}
                      />
                    </td>

                    {/* Código de barras */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="Sem código"
                        value={row.barcode || ''}
                        onChange={e => updateField(row.id, 'barcode', e.target.value)}
                        className="w-full rounded-lg border border-[var(--pc-border)] bg-white px-2 py-1.5 text-xs text-[var(--pc-text-secondary)] outline-none transition placeholder:text-[var(--pc-text-muted)] focus:border-[var(--pc-action)]"
                      />
                    </td>

                    {/* Ação / Salvar */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => void saveRow(row)}
                        disabled={row.saving || (!row.dirty && !row.saved)}
                        className={`inline-flex h-8 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                          row.saved
                            ? 'bg-[var(--pc-success-soft)] text-[var(--pc-success)]'
                            : row.dirty
                            ? 'bg-[var(--pc-action)] text-white hover:bg-[var(--pc-action-hover)]'
                            : 'cursor-default text-[var(--pc-text-muted)] opacity-40'
                        }`}
                        title={row.dirty ? 'Salvar alterações desta linha' : 'Nenhuma alteração'}
                      >
                        {row.saving ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : row.saved ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <Save size={13} />
                        )}
                        <span>{row.saved ? 'Salvo' : 'Salvar'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
