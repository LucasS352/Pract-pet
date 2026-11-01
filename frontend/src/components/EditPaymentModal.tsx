import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { X, Save, Plus, Trash2, Loader2, DollarSign, CreditCard } from 'lucide-react';

const METHOD_OPTIONS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'credito', label: 'Cartão de Crédito' },
  { value: 'debito', label: 'Cartão de Débito' },
  { value: 'pix', label: 'Pix' },
  { value: 'outros', label: 'Outros' }
];

interface EditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sale: any;
}

export function EditPaymentModal({ isOpen, onClose, onSuccess, sale }: EditPaymentModalProps) {
  const [payments, setPayments] = useState<{ method: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && sale) {
      setPayments(
        sale.payments.map((p: any) => ({
          method: p.method,
          value: Number(p.value).toFixed(2)
        }))
      );
    } else {
      setPayments([]);
    }
  }, [isOpen, sale]);

  if (!isOpen || !sale) return null;

  const totalSale = Number(sale.total);
  const currentTotal = payments.reduce((acc, p) => acc + (parseFloat(p.value) || 0), 0);
  const diff = totalSale - currentTotal;
  const isDiffZero = Math.abs(diff) < 0.01;

  const handleAddPayment = () => {
    setPayments([...payments, { method: 'dinheiro', value: diff > 0 ? diff.toFixed(2) : '0.00' }]);
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleUpdatePayment = (index: number, field: 'method' | 'value', val: string) => {
    const newPayments = [...payments];
    newPayments[index][field] = val;
    setPayments(newPayments);
  };

  const handleSave = async () => {
    if (!isDiffZero) {
      toast.error('A soma dos pagamentos deve ser exatamente igual ao total da venda.');
      return;
    }

    setLoading(true);
    try {
      const payload = payments.map(p => ({
        method: p.method,
        value: parseFloat(p.value)
      }));

      await api.put(`/sales/${sale.id}/payments`, { payments: payload });
      toast.success('Forma de pagamento atualizada com sucesso!');
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erro ao atualizar pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <CreditCard size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Editar Pagamento</h2>
              <p className="text-xs text-zinc-500">Venda: {sale.id.split('-')[0]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
            <span className="text-zinc-400 font-medium">Total da Venda</span>
            <span className="text-2xl font-black text-emerald-400">R$ {totalSale.toFixed(2)}</span>
          </div>

          <div className="space-y-3">
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
                <select
                  value={p.method}
                  onChange={e => handleUpdatePayment(idx, 'method', e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  {METHOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>

                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.value}
                    onChange={e => handleUpdatePayment(idx, 'value', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg pl-8 pr-2 py-2 text-sm font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={() => handleRemovePayment(idx)}
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  disabled={payments.length === 1}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddPayment}
            className="w-full py-3 flex items-center justify-center gap-2 text-blue-400 font-bold border border-blue-500/30 hover:bg-blue-500/10 rounded-xl transition-colors text-sm"
          >
            <Plus size={16} /> Adicionar forma de pagamento
          </button>

          {/* Validation Banner */}
          {!isDiffZero && (
            <div className={`p-3 rounded-xl border flex items-center justify-between text-sm ${diff > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              <span className="font-bold">
                {diff > 0 ? 'Falta distribuir:' : 'Valor excedente:'}
              </span>
              <span className="font-black">
                R$ {Math.abs(diff).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!isDiffZero || loading}
            className="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar Pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
