import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Wallet, Loader2 } from 'lucide-react';

export function CashRegisterModal({ onOpen }: { onOpen: (r: any) => void }) {
  const [value, setValue] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/cash-registers/open', { openingValue: value });
      toast.success('Caixa aberto com sucesso! Bom trabalho!');
      onOpen(data);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erro ao abrir caixa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm shadow-[0_0_80px_rgba(37,99,235,0.15)] p-8 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-20 h-20 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-blue-500/20">
          <Wallet size={36} />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Abertura de Caixa</h2>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          Antes de iniciar as vendas do dia, defina o valor físico em dinheiro disponível na gaveta.
        </p>

        <div className="relative mb-6 text-left">
          <label className="text-xs font-bold uppercase text-zinc-500 mb-2 block tracking-wider">Fundo de Troco</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-xl">R$</span>
            <input 
              type="number" 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-4 pl-12 pr-4 text-3xl font-black text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="0.00"
              onChange={e => setValue(parseFloat(e.target.value) || 0)}
              autoFocus
            />
          </div>
        </div>

        <button 
          onClick={handleOpen}
          disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Abrir Caixa e Iniciar'}
        </button>
      </div>
    </div>
  );
}
