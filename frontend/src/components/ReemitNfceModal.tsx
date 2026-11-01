import { useState } from 'react';
import { X, RefreshCw, Hash, AlertTriangle, Loader2 } from 'lucide-react';

interface SaleItem {
  id: string;
  quantity: number;
  priceUnit: number;
  subtotal: number;
  product: { name: string };
}

interface Sale {
  id: string;
  total: number;
  createdAt: string;
  items: SaleItem[];
  nfceStatus: string | null;
  nfceNumero: number | null;
  nfceMotivoRejeicao?: string | null;
}

interface ReemitNfceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onConfirm: (forceNewNumber: boolean, manualNumber?: number) => Promise<void>;
}

export function ReemitNfceModal({ isOpen, onClose, sale, onConfirm }: ReemitNfceModalProps) {
  const [loading, setLoading] = useState(false);
  const [manualNumber, setManualNumber] = useState('');

  if (!isOpen || !sale) return null;

  const handleAction = async (forceNewNumber: boolean, customNumber?: number) => {
    setLoading(true);
    try {
      await onConfirm(forceNewNumber, customNumber);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saleDate = new Date(sale.createdAt).toLocaleString('pt-BR');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-zinc-800">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <RefreshCw className="text-blue-500 animate-spin-slow" size={22} />
            Opções de Reemissão NFC-e
          </h2>
          <button onClick={onClose} disabled={loading} className="text-zinc-500 hover:text-white transition disabled:opacity-50">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Rejection Alert */}
          {sale.nfceMotivoRejeicao && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
              <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={20} />
              <div className="space-y-1">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Última Rejeição da SEFAZ</p>
                <p className="text-sm text-zinc-300 leading-relaxed font-mono">{sale.nfceMotivoRejeicao}</p>
              </div>
            </div>
          )}

          {/* Sale details summary */}
          <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2 text-sm text-zinc-400">
            <div className="flex justify-between">
              <span>Venda realizada em:</span>
              <span className="text-white font-medium">{saleDate}</span>
            </div>
            <div className="flex justify-between">
              <span>Valor Total:</span>
              <span className="text-emerald-400 font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(sale.total || 0))}
              </span>
            </div>
            {sale.nfceNumero && (
              <div className="flex justify-between">
                <span>Número da Nota Anterior:</span>
                <span className="text-white font-semibold font-mono">Nº {sale.nfceNumero}</span>
              </div>
            )}
            <div className="pt-2 border-t border-zinc-800/50 flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-500">ITENS DA VENDA:</span>
              <div className="max-h-24 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {sale.items.map((item, idx) => (
                  <div key={item.id} className="flex justify-between text-xs font-mono text-zinc-400">
                    <span className="truncate max-w-[280px]">{String(idx + 1).padStart(2, '0')}. {item.product?.name || 'Item'}</span>
                    <span>{item.quantity} x R$ {Number(item.priceUnit || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-zinc-400 text-sm leading-relaxed">
            Se você corrigiu o cadastro dos produtos (como NCM, CEST ou impostos) ou quer tentar retransmitir a nota rejeitada, escolha uma das opções abaixo:
          </p>

          {/* Options Blocks */}
          <div className="grid grid-cols-1 gap-4">
            {/* Option 1: Use Same Number */}
            <button
              onClick={() => handleAction(false)}
              disabled={loading}
              className="flex items-start text-left p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/30 hover:border-blue-500/50 transition duration-200 group disabled:opacity-50"
            >
              <Hash className="text-blue-400 mt-1 shrink-0 group-hover:scale-110 transition duration-200" size={24} />
              <div className="ml-4">
                <span className="text-sm font-bold text-white block group-hover:text-blue-400 transition">
                  Usar Mesmo Número (Recomendado)
                </span>
                <span className="text-xs text-zinc-500 mt-1 block leading-normal">
                  Transmite a nota com o mesmo número {sale.nfceNumero ? `(Nº ${sale.nfceNumero})` : ''}. Escolha isso se o erro foi apenas fiscal (cadastro de produto) e a nota não foi registrada pela SEFAZ.
                </span>
              </div>
            </button>

            {/* Option 2: Manual Number */}
            <div className="flex flex-col p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 transition duration-200">
              <div className="flex items-start">
                <RefreshCw className="text-amber-400 mt-1 shrink-0" size={24} />
                <div className="ml-4 flex-1">
                  <span className="text-sm font-bold text-white block">
                    Gerar Novo Número ou Informar Número Manual
                  </span>
                  <span className="text-xs text-zinc-500 mt-1 block leading-normal mb-3">
                    Consome a próxima numeração ou informe uma numeração específica para pular saltos. Útil para corrigir "Duplicidade de Chave de Acesso".
                  </span>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="number" 
                      placeholder="Ex: 58"
                      value={manualNumber}
                      onChange={e => setManualNumber(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm w-24 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      onClick={() => handleAction(true, manualNumber ? Number(manualNumber) : undefined)}
                      disabled={loading}
                      className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                    >
                      Transmitir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
          <span className="text-xs text-zinc-500 font-medium">A reemissão atualiza os dados fiscais nos itens da venda.</span>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition font-medium disabled:opacity-50 text-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
