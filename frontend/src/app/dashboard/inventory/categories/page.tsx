"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, Tag, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [taxGroups, setTaxGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [name, setName] = useState('');
  const [grupoTributacaoId, setGrupoTributacaoId] = useState('');

  const fetchCategories = () => {
    setLoading(true);
    api.get('/categories')
      .then(res => setCategories(res.data))
      .catch(() => toast.error('Erro ao carregar categorias'))
      .finally(() => setLoading(false));
  };

  const fetchTaxGroups = () => {
    api.get('/tributacao')
      .then(res => setTaxGroups(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    fetchCategories();
    fetchTaxGroups();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        grupoTributacaoId: grupoTributacaoId || null
      };

      if (editingCategory) {
        await api.patch(`/categories/${editingCategory.id}`, payload);
        toast.success('Categoria editada!');
      } else {
        await api.post('/categories', payload);
        toast.success('Categoria criada!');
      }
      setIsModalOpen(false);
      setName('');
      setGrupoTributacaoId('');
      setEditingCategory(null);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar categoria');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta categoria?')) return;
    try {
      await api.delete(`/categories/${id}`);
      toast.success('Categoria excluída!');
      fetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao excluir (Pode haver produtos vinculados)');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/dashboard/inventory" className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors">
            <ArrowLeft size={16} /> Voltar ao Catálogo
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
             <Tag className="text-blue-500" /> Categorias
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Gerencie as categorias de produtos e vincule regras tributárias para NFC-e simplificada</p>
        </div>
        
        <button 
          onClick={() => { 
            setEditingCategory(null); 
            setName(''); 
            setGrupoTributacaoId('');
            setIsModalOpen(true); 
          }} 
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 text-sm"
        >
          <Plus size={18} />
          Nova Categoria
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-zinc-950 text-zinc-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">Nome da Categoria</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">Tributação Padrão (NFC-e)</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {categories.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-zinc-500">Nenhuma categoria cadastrada.</td></tr>
              )}
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-5 font-bold text-white text-lg">
                    {cat.name}
                  </td>
                  <td className="px-6 py-5 text-zinc-300">
                    {cat.grupoTributacao ? (
                      <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-semibold">
                        {cat.grupoTributacao.nome}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">Padrão do produto (Fallback)</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right space-x-2">
                    <button 
                      onClick={() => { 
                        setEditingCategory(cat); 
                        setName(cat.name); 
                        setGrupoTributacaoId(cat.grupoTributacaoId || '');
                        setIsModalOpen(true); 
                      }}
                      className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors inline-block"
                      title="Editar"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(cat.id)}
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors inline-block"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">Nome</label>
                <input 
                  autoFocus
                  required
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Ex: Destilados"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">Tributação Padrão NFC-e (Opcional)</label>
                <select
                  value={grupoTributacaoId}
                  onChange={e => setGrupoTributacaoId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">Nenhuma (Usa imposto do produto)</option>
                  {taxGroups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.nome} (CFOP {group.cfop} - {group.csosn ? `CSOSN ${group.csosn}` : `CST ${group.cstIcms}`})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed">
                  💡 **Dica Fiscal:** Ao vincular um grupo aqui, todos os produtos dessa categoria sem tributação específica herdarão estas regras automaticamente. **Recomendamos fortemente confirmar com seu contador se as alíquotas configuradas estão corretas para a sua UF e regime fiscal.**
                </p>
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:bg-zinc-800 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
