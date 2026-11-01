import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Search, Loader2, CheckCircle2, AlertCircle, Calendar, Banknote } from 'lucide-react';
import { AddPayableModal } from '@/components/AddPayableModal';

type Payable = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: 'PENDING' | 'PAID';
  type: 'FIXED' | 'VARIABLE';
  isRecurring: boolean;
  recurrenceId?: string | null;
  category?: string;
  notes?: string;
  supplier?: { id: string; name: string; };
};

export default function PayablesPage() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payableToEdit, setPayableToEdit] = useState<Payable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  
  // Dashboard stats
  const [stats, setStats] = useState<any>(null);

  // Filters
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'FIXED' | 'VARIABLE'>('FIXED');

  const fetchPayables = useCallback(async (signal?: AbortSignal) => {
    if (!mounted.current) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setPayables([]); setStats(null);
    try {
      const [res, dashRes] = await Promise.all([
        api.get(`/payables?month=${month}&year=${year}`, { signal, timeout: 10000 }),
        api.get(`/payables/dashboard?month=${month}&year=${year}`, { signal, timeout: 10000 }),
      ]);
      if (!mounted.current || signal?.aborted || seq !== requestSeq.current) return;
      setPayables(res.data);
      setStats(dashRes.data);
    } catch (err) {
      if (mounted.current && !signal?.aborted && seq === requestSeq.current) toast.error('Erro ao carregar contas a pagar.');
    } finally {
      if (mounted.current && seq === requestSeq.current) setLoading(false);
    }
  }, [month, year]);
  const latestFetch = useRef(fetchPayables);
  latestFetch.current = fetchPayables;

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetchPayables(controller.signal);
    return () => { controller.abort(); mounted.current = false; requestSeq.current++; };
  }, [fetchPayables]);

  const handlePay = async (id: string) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusyId(id);
    try {
      await api.patch(`/payables/${id}/pay`);
      toast.success('Conta marcada como paga!');
      void latestFetch.current();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao baixar conta.');
    } finally { actionBusy.current = false; if (mounted.current) setBusyId(null); }
  };

  const handleDelete = async (id: string) => {
    if (actionBusy.current || !confirm('Excluir somente esta ocorrência? As outras contas da série serão mantidas.')) return;
    actionBusy.current = true; setBusyId(id);
    try {
      await api.delete(`/payables/${id}`);
      toast.success('Conta excluída com sucesso.');
      void latestFetch.current();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao excluir conta.');
    } finally { actionBusy.current = false; if (mounted.current) setBusyId(null); }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const filtered = payables.filter(p => p.type === activeTab && p.description.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Banknote className="text-red-400" /> Contas a Pagar
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Organize seus vencimentos e planeje os próximos meses.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select 
            value={month} 
            onChange={e => setMonth(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}</option>
            ))}
          </select>
          <input 
            type="number" 
            value={year} 
            onChange={e => setYear(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-white rounded-xl w-24 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => { setPayableToEdit(null); setIsModalOpen(true); }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-colors font-bold shadow-lg"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Nova Conta</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3">
        <div><p className="text-sm font-semibold text-blue-200">Planejamento das contas fixas</p><p className="text-xs text-zinc-400 mt-1">Novas contas recorrentes já incluem os dois meses seguintes, sem esperar a baixa.</p></div>
        <div className="flex gap-2">{[0, 1, 2].map(offset => {
          const now = new Date(); const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
          const selected = d.getMonth() + 1 === month && d.getFullYear() === year;
          return <button key={offset} onClick={() => { setMonth(d.getMonth() + 1); setYear(d.getFullYear()); }}
            className={`rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${selected ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>
            {d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
          </button>;
        })}</div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <p className="text-zinc-400 text-sm font-medium mb-1">Despesas do mês</p>
            <h3 className="text-2xl font-black text-white">{formatCurrency(stats.totalToPay)}</h3>
            <p className="text-xs text-amber-400 mt-1">Em aberto: {formatCurrency(Math.max(0, stats.totalToPay - stats.totalPaid))}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <p className="text-zinc-400 text-sm font-medium mb-1">Total Pago</p>
            <h3 className="text-2xl font-black text-emerald-400">{formatCurrency(stats.totalPaid)}</h3>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <p className="text-zinc-400 text-sm font-medium mb-1">Vendas menos despesas</p>
            <h3 className={`text-2xl font-black ${stats.realProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {formatCurrency(stats.realProfit)}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">Não desconta custo das mercadorias.</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <p className="text-zinc-400 text-sm font-medium mb-1">Vendas e contas do período</p>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2 mb-1">
              <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${stats.totalToPay > 0 ? Math.min(100, (stats.totalSales / stats.totalToPay) * 100) : 0}%`}}></div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Vendido: {formatCurrency(stats.totalSales)} / Contas: {formatCurrency(stats.breakEvenPoint)}</p>
            <p className="text-xs text-zinc-500 mt-1">Comparação simples; não calcula o ponto de equilíbrio.</p>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="flex bg-zinc-950/80 p-1 border-b border-zinc-800">
          <button 
            onClick={() => setActiveTab('FIXED')}
            className={`flex-1 py-3 text-sm font-bold text-center rounded-xl transition ${activeTab === 'FIXED' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
          >
            Contas Fixas (Mensais)
          </button>
          <button 
            onClick={() => setActiveTab('VARIABLE')}
            className={`flex-1 py-3 text-sm font-bold text-center rounded-xl transition ${activeTab === 'VARIABLE' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
          >
            Contas Variáveis (Boletos/Avulsas)
          </button>
        </div>

        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Buscar conta..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-950/50 text-zinc-400 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3 font-semibold">Vencimento</th>
                <th className="px-6 py-3 font-semibold">Descrição</th>
                <th className="px-6 py-3 font-semibold">Tipo</th>
                <th className="px-6 py-3 font-semibold">Status</th>
                <th className="px-6 py-3 font-semibold text-right">Valor</th>
                <th className="px-6 py-3 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {loading && payables.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-500"><Loader2 className="animate-spin inline mr-2" size={16}/> Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-500">Nenhuma conta encontrada.</td></tr>
              ) : filtered.map(p => {
                const isOverdue = p.status === 'PENDING' && new Date(p.dueDate) < new Date(new Date().setHours(0,0,0,0));
                return (
                  <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-6 py-3">
                      <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400 font-bold' : ''}`}>
                        <Calendar size={14} />
                        {new Date(p.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-semibold text-white">{p.description}</div>
                      {p.supplier && <div className="text-xs text-zinc-500">Fornecedor: {p.supplier.name}</div>}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${p.type === 'FIXED' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-orange-500/20 text-orange-400'}`}>
                        {p.type === 'FIXED' ? 'Fixo' : 'Variável'}
                      </span>
                      {p.isRecurring && <span className="ml-2 text-xs text-zinc-500" title={p.recurrenceId ? 'Série mensal com antecipação' : 'Recorrência anterior à antecipação'}>↺ Mensal</span>}
                    </td>
                    <td className="px-6 py-3">
                      {p.status === 'PAID' ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-medium"><CheckCircle2 size={14}/> Pago</span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 font-medium"><AlertCircle size={14}/> Pendente</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-white">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {p.status === 'PENDING' && (
                          <button disabled={!!busyId} onClick={() => handlePay(p.id)} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded font-bold transition disabled:opacity-40">
                            {busyId === p.id ? 'Aguarde...' : 'Baixar'}
                          </button>
                        )}
                        <button disabled={!!busyId} onClick={() => { setPayableToEdit(p); setIsModalOpen(true); }} className="px-3 py-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded transition disabled:opacity-40">
                          Editar
                        </button>
                        <button disabled={!!busyId} onClick={() => handleDelete(p.id)} className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition disabled:opacity-40">
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddPayableModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSaved={() => { void fetchPayables(); }}
        payableToEdit={payableToEdit}
      />
    </div>
  );
}
