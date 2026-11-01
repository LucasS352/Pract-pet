import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { X, Save, Building2, Calendar, DollarSign, Type, FileText } from 'lucide-react';

type AddPayableModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  payableToEdit?: any;
};

export function AddPayableModal({ isOpen, onClose, onSaved, payableToEdit }: AddPayableModalProps) {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType] = useState<'FIXED' | 'VARIABLE'>('FIXED');
  const [status, setStatus] = useState<'PENDING' | 'PAID'>('PENDING');
  const [isRecurring, setIsRecurring] = useState(true);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [supplierId, setSupplierId] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.get('/suppliers').then(res => setSuppliers(res.data)).catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (payableToEdit && isOpen) {
      setDescription(payableToEdit.description);
      setAmount(String(payableToEdit.amount));
      setDueDate(payableToEdit.dueDate.split('T')[0]);
      setType(payableToEdit.type);
      setStatus(payableToEdit.status);
      setIsRecurring(payableToEdit.isRecurring);
      setCategory(payableToEdit.category || '');
      setNotes(payableToEdit.notes || '');
      setSupplierId(payableToEdit.supplierId || '');
    } else if (isOpen) {
      setDescription('');
      setAmount('');
      setDueDate(new Date().toISOString().split('T')[0]);
      setType('FIXED');
      setStatus('PENDING');
      setIsRecurring(true);
      setCategory('');
      setNotes('');
      setSupplierId('');
    }
  }, [payableToEdit, isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!description.trim() || !amount || !dueDate || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    const payload = {
      description,
      amount: Number(amount),
      dueDate: new Date(`${dueDate}T12:00:00Z`).toISOString(), // meio dia para evitar fuso
      type,
      status,
      isRecurring,
      category,
      notes,
      supplierId: supplierId || null,
    };

    setLoading(true);
    try {
      if (payableToEdit) {
        await api.patch(`/payables/${payableToEdit.id}`, payload);
        toast.success('Conta atualizada com sucesso.');
      } else {
        await api.post('/payables', payload);
        toast.success('Conta cadastrada com sucesso.');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar conta.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-lg h-full shadow-2xl flex flex-col animate-in slide-in-from-right">
        
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-950/50">
          <h2 className="text-xl font-bold text-white">
            {payableToEdit ? 'Editar Conta' : 'Nova Conta a Pagar'}
          </h2>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="space-y-4">
            
            {/* Descrição */}
            <div>
              <label className="text-sm font-semibold text-zinc-400 mb-1.5 flex items-center gap-2">
                <Type size={14} /> Descrição *
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Conta de Luz, Aluguel, Boleto Fornecedor..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            {/* Valor e Vencimento */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 flex items-center gap-2">
                  <DollarSign size={14} /> Valor (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 flex items-center gap-2">
                  <Calendar size={14} /> Vencimento *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none [color-scheme:dark]"
                  required
                />
              </div>
            </div>

            {/* Tipo e Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">
                  Tipo da Conta
                </label>
                <select
                  value={type}
                  onChange={e => { setType(e.target.value as any); if (!payableToEdit) setIsRecurring(e.target.value === 'FIXED'); }}
                  disabled={!!payableToEdit?.recurrenceId}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="FIXED">Fixa (Mensalidade, Água, Luz)</option>
                  <option value="VARIABLE">Variável (Boleto, Imposto)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">
                  Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="PENDING">Pendente</option>
                  <option value="PAID">Pago</option>
                </select>
              </div>
            </div>

            {/* Fornecedor */}
            <div>
              <label className="text-sm font-semibold text-zinc-400 mb-1.5 flex items-center gap-2">
                <Building2 size={14} /> Fornecedor (Opcional)
              </label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Selecione um fornecedor...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.document ? `(${s.document})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Categoria Opcional */}
            <div>
              <label className="text-sm font-semibold text-zinc-400 mb-1.5 flex items-center gap-2">
                <FileText size={14} /> Categoria/Plano de Contas (Opcional)
              </label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Ex: Infraestrutura, Salários, Compras..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Recorrência */}
            <div className="flex items-center gap-3 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
              <input
                type="checkbox"
                id="isRecurring"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                className="w-5 h-5 rounded border-zinc-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
              />
              <label htmlFor="isRecurring" className="text-sm font-medium text-white select-none">
                Conta Recorrente Automática
                <span className="block text-xs text-zinc-500 font-normal mt-0.5">
                  {type === 'FIXED'
                    ? 'Ao cadastrar, já cria esta conta e os dois meses seguintes como pendentes, sem esperar a baixa.'
                    : 'Ao baixar esta conta, cria automaticamente a do mês seguinte.'}
                </span>
              </label>
            </div>

            {type === 'FIXED' && isRecurring && !payableToEdit && dueDate && <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">
              <p className="font-semibold mb-2">Vencimentos que serão criados</p>
              <div className="flex flex-wrap gap-2">{[0, 1, 2].map(offset => {
                const [y, m, day] = dueDate.split('-').map(Number);
                const first = new Date(Date.UTC(y, m - 1 + offset, 1, 12));
                const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
                const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last), 12));
                return <span key={offset} className="rounded-lg bg-blue-500/10 px-2 py-1">{date.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>;
              })}</div>
            </div>}
            {payableToEdit?.recurrenceId && <p className="text-xs text-zinc-400">Valor, descrição e vencimento alteram somente esta ocorrência. Desativar a recorrência interrompe novas gerações da série, mas mantém as contas já criadas.</p>}
            {payableToEdit && isRecurring && !payableToEdit.recurrenceId && <p className="text-xs text-amber-300">Conta sem série antecipada: mantém a recorrência ao dar baixa. A antecipação de dois meses vale para novas contas fixas cadastradas com recorrência.</p>}

            {/* Observações */}
            <div>
              <label className="text-sm font-semibold text-zinc-400 mb-1.5 block">
                Observações
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Detalhes adicionais, código de barras..."
              />
            </div>
            
          </div>
        </div>

        {/* Footer adaptado para mobile */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 flex gap-3 pb-24 md:pb-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Salvando...' : <><Save size={18} /> Salvar</>}
          </button>
        </div>

      </div>
    </div>
  );
}
