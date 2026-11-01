import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit, Trash, Package, Search, Phone, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', whatsapp: '', cnpjCpf: '', email: '' });
  const [saving, setSaving] = useState(false);

  // Catalog State
  const [activeSupplier, setActiveSupplier] = useState<any>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(data);
    } catch (error) {
      toast.error('Erro ao carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editData) {
        await api.patch(`/suppliers/${editData.id}`, formData);
        toast.success('Fornecedor atualizado!');
      } else {
        await api.post('/suppliers', formData);
        toast.success('Fornecedor criado!');
      }
      setShowModal(false);
      fetchSuppliers();
    } catch (error) {
      toast.error('Erro ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este fornecedor?')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success('Fornecedor excluído.');
      fetchSuppliers();
      if (activeSupplier?.id === id) setActiveSupplier(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao excluir fornecedor.');
    }
  };

  const normalize = (str: string) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
  const filtered = suppliers.filter(s => normalize(s.name).includes(normalize(search)));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Truck className="text-blue-500" /> Fornecedores
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Gerencie seus fornecedores e seus respectivos catálogos de produtos.</p>
        </div>
        <button
          onClick={() => { setEditData(null); setFormData({ name: '', whatsapp: '', cnpjCpf: '', email: '' }); setShowModal(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition"
        >
          <Plus size={18} /> Novo Fornecedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lista de Fornecedores */}
        <div className="md:col-span-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col max-h-[700px]">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Buscar fornecedor..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-1">
            {loading ? (
              <p className="text-center text-zinc-500 p-4 text-sm">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-zinc-500 p-4 text-sm">Nenhum fornecedor encontrado.</p>
            ) : (
              filtered.map(sup => (
                <div 
                  key={sup.id}
                  onClick={() => setActiveSupplier(sup)}
                  className={`p-3 rounded-xl cursor-pointer transition flex items-center justify-between group ${activeSupplier?.id === sup.id ? 'bg-blue-600/10 border border-blue-500/30' : 'hover:bg-zinc-800/50 border border-transparent'}`}
                >
                  <div>
                    <strong className={`block text-sm ${activeSupplier?.id === sup.id ? 'text-blue-400' : 'text-zinc-200'}`}>{sup.name}</strong>
                    <span className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                      <Phone size={10} /> {sup.whatsapp || 'Sem número'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEditData(sup); setFormData(sup); setShowModal(true); }}
                      className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-lg"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(sup.id); }}
                      className="p-1.5 text-zinc-400 hover:text-red-400 bg-zinc-800 rounded-lg"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Catálogo do Fornecedor */}
        <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          {activeSupplier ? (
            <SupplierCatalog supplier={activeSupplier} onUpdate={fetchSuppliers} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50">
              <Truck size={48} className="mb-4" />
              <p>Selecione um fornecedor para ver seu catálogo.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleSave} className="bg-zinc-900 border border-zinc-800 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="font-bold text-white">{editData ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">Nome *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white" />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">WhatsApp</label>
                <input type="text" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="Ex: 11999999999" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white" />
              </div>
            </div>
            <div className="p-5 bg-zinc-900/50 border-t border-zinc-800">
              <button disabled={saving} type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2">
                <Save size={18} /> Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SupplierCatalog({ supplier, onUpdate }: { supplier: any, onUpdate: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setSearch('');
    fetchCatalog();
  }, [supplier.id]);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const response = await api.get('/products?limit=2000');
      const productsList = response.data.data || response.data;
      setProducts(productsList);
    } catch {
      toast.error('Erro ao buscar produtos.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (product: any) => {
    setAdding(true);
    try {
      await api.post(`/suppliers/${supplier.id}/products`, { productId: product.id });
      toast.success('Produto adicionado ao catálogo do fornecedor!');
      onUpdate(); // Reload suppliers to get updated catalog
      setSearch('');
    } catch {
      toast.error('Erro ao adicionar produto.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (productId: string) => {
    if (!window.confirm('Remover produto deste fornecedor?')) return;
    try {
      await api.delete(`/suppliers/${supplier.id}/products/${productId}`);
      toast.success('Produto removido.');
      onUpdate();
    } catch {
      toast.error('Erro ao remover produto.');
    }
  };

  const catalog = supplier.products || [];

  const normalize = (str: string) => str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
  const filteredProducts = products.filter((p: any) => {
    const searchTerms = normalize(search).split(' ').filter(t => t.trim() !== '');
    if (searchTerms.length === 0) return false;
    const searchString = normalize(`${p.name} ${p.shortCode || ''}`);
    return searchTerms.every(term => searchString.includes(term));
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">{supplier.name}</h2>
          <p className="text-xs text-zinc-400">Catálogo de produtos oferecidos</p>
        </div>
        <div className="bg-zinc-800/50 px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-300">
          {catalog.length} Itens
        </div>
      </div>

      <div className="mb-6 relative">
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Pesquisar produto do sistema para vincular..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white"
          />
          <button className="bg-zinc-800 px-4 rounded-xl text-zinc-300">
            <Search size={18} />
          </button>
        </div>

        {filteredProducts.length > 0 && search && (
          <div className="absolute top-full mt-2 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-10 max-h-60 overflow-y-auto p-2 space-y-1">
            {filteredProducts.slice(0, 15).map(p => {
              const alreadyHas = catalog.some((cp: any) => cp.productId === p.id);
              return (
                <div key={p.id} className="flex items-center justify-between p-3 hover:bg-zinc-700/50 rounded-lg transition">
                  <div>
                    <strong className="block text-sm text-zinc-200 flex items-center gap-2">
                      {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-6 h-6 rounded object-cover bg-zinc-900" />}
                      {p.name}
                    </strong>
                    <span className="text-xs text-zinc-500">Custo atual: R$ {Number(p.priceCost).toFixed(2)}</span>
                  </div>
                  <button 
                    disabled={alreadyHas || adding}
                    onClick={() => handleAdd(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${alreadyHas ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                  >
                    {alreadyHas ? 'Vinculado' : 'Vincular'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
        {catalog.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm mt-10">Nenhum produto vinculado ainda.</p>
        ) : (
          catalog.map((sp: any) => (
            <div key={sp.id} className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl group hover:border-zinc-700 transition">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center overflow-hidden">
                  {sp.product?.imageUrl ? (
                    <img src={sp.product.imageUrl} alt={sp.product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={18} className="text-zinc-500" />
                  )}
                </div>
                <div>
                  <strong className="block text-sm text-zinc-200">{sp.product.name}</strong>
                  <span className="text-xs text-zinc-500">Custo atual no sistema: R$ {Number(sp.product.priceCost).toFixed(2)}</span>
                </div>
              </div>
              <button 
                onClick={() => handleRemove(sp.productId)}
                className="text-zinc-600 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition"
              >
                <Trash size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
