"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Edit3, Trash2, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function FiscalGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [formData, setFormData] = useState({
    nome: '',
    csosn: '102',
    cfop: '5102',
    aliqIcms: '0'
  });

  const fetchGroups = () => {
    setLoading(true);
    api.get('/tributacao')
      .then(res => setGroups(res.data))
      .catch(() => toast.error('Erro ao carregar grupos fiscais'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        aliqIcms: parseFloat(formData.aliqIcms) || 0
      };

      if (editingGroup) {
        await api.patch(`/tributacao/${editingGroup.id}`, payload);
        toast.success('Grupo editado!');
      } else {
        await api.post('/tributacao', payload);
        toast.success('Grupo criado!');
      }
      setIsModalOpen(false);
      setEditingGroup(null);
      fetchGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar grupo');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este grupo?')) return;
    try {
      await api.delete(`/tributacao/${id}`);
      toast.success('Grupo excluído!');
      fetchGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao excluir (Pode haver produtos vinculados)');
    }
  };

  const openModal = (group: any = null) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        nome: group.nome,
        csosn: group.csosn || '',
        cfop: group.cfop || '',
        aliqIcms: group.aliqIcms?.toString() || '0'
      });
    } else {
      setEditingGroup(null);
      setFormData({ nome: '', csosn: '102', cfop: '5102', aliqIcms: '0' });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link to="/dashboard" className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors">
            <ArrowLeft size={16} /> Voltar ao Dashboard
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
             <FileText className="text-emerald-500" /> Grupos de Tributação
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Configure os perfis de impostos para facilitar o cadastro dos produtos.</p>
        </div>
        
        <button 
          onClick={() => openModal()} 
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 text-sm"
        >
          <Plus size={18} />
          Novo Grupo Fiscal
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-zinc-950 text-zinc-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">Nome do Grupo</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">CFOP Padrão</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">CSOSN</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider">Alíquota ICMS</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {groups.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Nenhum grupo cadastrado.</td></tr>
              )}
              {groups.map(g => (
                <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                  <td className="px-6 py-5 font-bold text-white text-lg">
                    {g.nome}
                  </td>
                  <td className="px-6 py-5 text-zinc-300 font-mono">
                    {g.cfop || '-'}
                  </td>
                  <td className="px-6 py-5 text-zinc-300 font-mono">
                    {g.csosn || '-'}
                  </td>
                  <td className="px-6 py-5 text-zinc-400">
                    {g.aliqIcms}%
                  </td>
                  <td className="px-6 py-5 text-right space-x-2">
                    <button 
                      onClick={() => openModal(g)}
                      className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors inline-block"
                      title="Editar"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(g.id)}
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
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingGroup ? 'Editar Grupo Fiscal' : 'Novo Grupo Fiscal'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">Nome do Perfil</label>
                <input 
                  autoFocus required type="text" 
                  value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Ex: Simples Nacional (Sem ST)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">CSOSN</label>
                  <input 
                    required type="text" 
                    value={formData.csosn} onChange={e => setFormData({...formData, csosn: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="Ex: 102"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">CFOP Padrão</label>
                  <input 
                    required type="text" 
                    value={formData.cfop} onChange={e => setFormData({...formData, cfop: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    placeholder="Ex: 5102"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">Alíquota ICMS (%)</label>
                <input 
                  type="number" step="0.01"
                  value={formData.aliqIcms} onChange={e => setFormData({...formData, aliqIcms: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="0.00"
                />
              </div>

              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-zinc-800">
                <button 
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:bg-zinc-800 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                >
                  Salvar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
