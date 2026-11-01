"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { History, Loader2, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { CloseRegisterModal } from '@/components/CloseRegisterModal';

type CashRegister = {
  id: string;
  userId?: string;
  operator?: { id: string; name: string };
  code?: number;
  openingTime: string;
  closingTime?: string;
  openingValue: number;
  closingValue?: number;
  status: string;
  totalSales?: number;
  closingDetails?: any;
};

export default function CashRegistersHistoryPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/cash-registers')
      .then(res => setRegisters(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Update register status when modal closes
  const handleModalClose = () => {
    setSelectedId(null);
    api.get(`/cash-registers?_t=${Date.now()}`)
      .then(res => setRegisters(res.data))
      .catch(console.error);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={48} /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <History className="text-blue-500" size={32} /> Histórico e Auditoria de Caixas
        </h1>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-xl font-bold">Relatórios Anteriores</h2>
          <p className="text-zinc-500 text-sm mt-1">Acompanhe todos os turnos abertos e fechados na história da loja. Audite eventuais quebras de caixa do passado.</p>
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950 text-zinc-400 text-sm">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Status</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Caixa</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Operador</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Abertura</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-left">Fechamento</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Fundo (Início)</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Faturamento</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-right">Terminou com</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {registers.map(reg => (
                <tr key={reg.id} className="hover:bg-zinc-800/40 transition-colors group">
                  <td className="px-6 py-5 whitespace-nowrap">
                    {reg.status === 'open' ? (
                       <span className="flex items-center gap-2 text-emerald-400 font-bold text-[11px] bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 w-fit tracking-wider"><CheckCircle2 size={14}/> ABERTO</span>
                    ) : reg.closingValue == null ? (
                       <span className="flex items-center gap-2 text-amber-500 font-bold text-[11px] bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 w-fit tracking-wider">PENDENTE DE AUDITORIA</span>
                    ) : (
                       <span className="flex items-center gap-2 text-zinc-500 font-bold text-[11px] bg-zinc-800 px-2.5 py-1 rounded-full border border-zinc-700 w-fit tracking-wider"><XCircle size={14}/> FECHADO</span>
                    )}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap font-bold text-white">
                    #{reg.code ?? '--'}
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap text-zinc-300 font-medium">
                    {reg.operator?.name || 'Administrador'}
                  </td>
                  <td className="px-6 py-5 text-zinc-300 font-medium whitespace-nowrap">
                    {new Date(reg.openingTime).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }).replace(',', ' -')}
                  </td>
                  <td className="px-6 py-5 text-zinc-500 whitespace-nowrap">
                    {reg.closingTime ? new Date(reg.closingTime).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }).replace(',', ' -') : '--'}
                  </td>
                  <td className="px-6 py-5 text-right font-bold text-blue-400">
                    R$ {Number(reg.openingValue || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-5 text-right font-bold text-emerald-400">
                    R$ {Number(reg.totalSales || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-5 text-right font-bold text-zinc-400">
                    {reg.status === 'open' ? '--' : reg.closingValue != null ? `R$ ${Number(reg.closingValue).toFixed(2)}` : <span className="text-amber-500/80 text-xs uppercase">Pendente</span>}
                  </td>
                  <td className="px-6 py-5 text-center">
                    <button 
                      onClick={() => setSelectedId(reg.id)}
                      className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors inline-block"
                      title={reg.status === 'open' ? "Fechar Caixa" : "Ver Auditoria"}
                    >
                      <FileText size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {registers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">Nenhum caixa encontrado no banco de dados da loja.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden divide-y divide-zinc-800/60">
          {registers.map(reg => (
            <div key={reg.id} className="p-5 space-y-4 hover:bg-zinc-800/20 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500 font-mono">ID: {reg.id.slice(0, 8)}</span>
                {reg.status === 'open' ? (
                   <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 tracking-wider"><CheckCircle2 size={12}/> ABERTO</span>
                ) : reg.closingValue == null ? (
                   <span className="flex items-center gap-1.5 text-amber-500 font-bold text-[10px] bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 tracking-wider">PENDENTE</span>
                ) : (
                   <span className="flex items-center gap-1.5 text-zinc-500 font-bold text-[10px] bg-zinc-800 px-2.5 py-0.5 rounded-full border border-zinc-700 tracking-wider"><XCircle size={12}/> FECHADO</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500 text-xs block">Abertura</span>
                  <span className="text-zinc-300 font-medium">{new Date(reg.openingTime).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }).replace(',', ' -')}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs block">Fechamento</span>
                  <span className="text-zinc-300 font-medium">{reg.closingTime ? new Date(reg.closingTime).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }).replace(',', ' -') : '--'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs block">Fundo (Início)</span>
                  <span className="text-blue-400 font-bold">R$ {Number(reg.openingValue || 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs block">Terminou com</span>
                  <span className="text-zinc-400 font-bold">{reg.status === 'open' ? '--' : reg.closingValue != null ? `R$ ${Number(reg.closingValue).toFixed(2)}` : <span className="text-amber-500/80 uppercase text-[10px]">Pendente</span>}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs block">Total Vendas</span>
                  <span className="text-emerald-400 font-bold">R$ {Number(reg.totalSales || 0).toFixed(2)}</span>
                </div>
                {reg.operator?.name && (
                  <div>
                    <span className="text-zinc-500 text-xs block">Operador</span>
                    <span className="text-zinc-300 font-medium truncate block">{reg.operator.name}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  onClick={() => setSelectedId(reg.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  <FileText size={14} />
                  {reg.status === 'open' ? "Fechar Caixa" : "Ver Detalhes"}
                </button>
              </div>
            </div>
          ))}
          {registers.length === 0 && (
            <div className="p-8 text-center text-zinc-500 text-sm">Nenhum caixa encontrado no banco de dados da loja.</div>
          )}
        </div>
      </div>

      <CloseRegisterModal 
        isOpen={!!selectedId} 
        registerId={selectedId || ''} 
        onClose={handleModalClose}
        isAdminView={true}
      />
    </div>
  );
}
