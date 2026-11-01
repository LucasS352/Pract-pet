'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CreditCard, Plus, Trash2, Loader2, Edit2, Check, X, Zap, ShieldCheck, Info } from 'lucide-react';

interface PaymentMethod {
  id: string;
  name: string;
  tPag: string;
  active: boolean;
  emitirNfce?: boolean;
  hasVariablePricing: boolean;
}

interface FixedPaymentSettings {
  dinheiro: { emitirNfce: boolean };
  pix: { emitirNfce: boolean };
  credito: { emitirNfce: boolean };
  debito: { emitirNfce: boolean };
  consumo_funcionario: { emitirNfce: boolean };
  [key: string]: { emitirNfce: boolean };
}

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [fixedSettings, setFixedSettings] = useState<FixedPaymentSettings>({
    dinheiro: { emitirNfce: false },
    pix: { emitirNfce: false },
    credito: { emitirNfce: false },
    debito: { emitirNfce: false },
    consumo_funcionario: { emitirNfce: false },
  });
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newHasVariablePricing, setNewHasVariablePricing] = useState(false);
  const [newEmitirNfce, setNewEmitirNfce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHasVariablePricing, setEditHasVariablePricing] = useState(false);
  const [editEmitirNfce, setEditEmitirNfce] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [methodsRes, settingsRes] = await Promise.all([
        api.get('/payment-methods'),
        api.get('/payment-methods/settings').catch(() => ({ data: null })),
      ]);
      setMethods(methodsRes.data);
      if (settingsRes.data) {
        setFixedSettings(prev => ({ ...prev, ...settingsRes.data }));
      }
    } catch {
      toast.error('Erro ao carregar formas de pagamento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleToggleFixedNfce = async (key: string, currentVal: boolean) => {
    const newVal = !currentVal;
    const updated = { ...fixedSettings, [key]: { emitirNfce: newVal } };
    setFixedSettings(updated as FixedPaymentSettings);
    try {
      await api.patch('/payment-methods/settings', updated);
      toast.success(`NFC-e para ${key.toUpperCase()} ${newVal ? 'ativada' : 'desativada'}!`);
    } catch {
      toast.error('Erro ao salvar configuração.');
      fetchAll();
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Digite o nome da forma de pagamento.'); return; }
    setSaving(true);
    try {
      await api.post('/payment-methods', { 
        name: newName.trim(), 
        hasVariablePricing: newHasVariablePricing,
        emitirNfce: newEmitirNfce,
      });
      toast.success(`"${newName.trim()}" adicionado!`);
      setNewName('');
      setNewHasVariablePricing(false);
      setNewEmitirNfce(true);
      fetchAll();
    } catch {
      toast.error('Erro ao adicionar forma de pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) { toast.error('Nome inválido.'); return; }
    try {
      await api.patch(`/payment-methods/${id}`, { 
        name: editName.trim(), 
        hasVariablePricing: editHasVariablePricing,
        emitirNfce: editEmitirNfce,
      });
      toast.success('Atualizado com sucesso!');
      setEditingId(null);
      fetchAll();
    } catch {
      toast.error('Erro ao atualizar.');
    }
  };

  const handleToggleActive = async (method: PaymentMethod) => {
    try {
      await api.patch(`/payment-methods/${method.id}`, { active: !method.active });
      toast.success(method.active ? 'Desativado.' : 'Ativado!');
      fetchAll();
    } catch {
      toast.error('Erro ao alterar status.');
    }
  };

  const handleToggleCustomNfce = async (method: PaymentMethod) => {
    const currentVal = method.emitirNfce !== false;
    try {
      await api.patch(`/payment-methods/${method.id}`, { emitirNfce: !currentVal });
      toast.success(`NFC-e para "${method.name}" ${!currentVal ? 'ativada' : 'desativada'}!`);
      fetchAll();
    } catch {
      toast.error('Erro ao alterar emissão fiscal.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/payment-methods/${id}`);
      toast.success('Excluído com sucesso.');
      fetchAll();
    } catch {
      toast.error('Erro ao excluir.');
    }
  };

  const BUILTIN = [
    { 
      key: 'dinheiro', 
      label: 'Dinheiro', 
      color: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    },
    { 
      key: 'pix', 
      label: 'PIX', 
      color: 'text-teal-400',
      badgeBg: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    },
    { 
      key: 'credito', 
      label: 'Cartão Crédito', 
      color: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    },
    { 
      key: 'debito', 
      label: 'Cartão Débito', 
      color: 'text-sky-400',
      badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    },
    { 
      key: 'consumo_funcionario', 
      label: 'Consumo Colaborador', 
      color: 'text-amber-400',
      badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <CreditCard className="text-blue-500" /> Formas de Pagamento
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Gerencie os métodos de pagamento aceitos e as preferências de emissão no caixa.
        </p>
      </div>

      {/* Métodos Padrão (Fixos) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Métodos Padrão</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Defina se a forma de pagamento emite cupom fiscal por padrão.</p>
          </div>
        </div>

        <div className="space-y-3">
          {BUILTIN.map(m => {
            const isFiscal = fixedSettings[m.key]?.emitirNfce === true;
            return (
              <div key={m.key} className="flex items-center justify-between p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl gap-3 hover:border-zinc-700 transition">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${m.badgeBg}`}>
                    Fixo
                  </span>
                  <div className={`font-bold text-base ${m.color}`}>{m.label}</div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleFixedNfce(m.key, isFiscal)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                      isFiscal
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isFiscal ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                    {isFiscal ? '⚡ Emite NFC-e' : '⚪ Sem Emissão'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Métodos Customizados */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-xl">
        <div className="mb-5">
          <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Métodos Customizados</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Adicione canais e formas específicas da sua loja (ex: iFood, Vale Refeição, Convênio).</p>
        </div>

        {/* Adicionar novo */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Nome do método (ex: iFood, Ticket Alimentação, Vale...)"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 text-sm shrink-0"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Adicionar Método
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={newEmitirNfce} 
                onChange={e => setNewEmitirNfce(e.target.checked)} 
                className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900" 
              />
              <span className="font-semibold text-emerald-400">⚡ Emitir NFC-e</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={newHasVariablePricing} 
                onChange={e => setNewHasVariablePricing(e.target.checked)} 
                className="rounded bg-zinc-900 border-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900" 
              />
              Preço Variável por Produto
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-zinc-500" size={28} />
          </div>
        ) : methods.length === 0 ? (
          <div className="text-center py-8 text-zinc-600">
            <CreditCard size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum método customizado cadastrado ainda.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {methods.map(m => {
              const isFiscal = m.emitirNfce !== false;
              return (
                <div key={m.id} className={`flex flex-col gap-2 p-3.5 border rounded-2xl transition ${m.active ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900/40 border-zinc-800/50 opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    {editingId === m.id ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(m.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                          />
                          <button onClick={() => handleSaveEdit(m.id)} className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition" title="Salvar"><Check size={16} /></button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition" title="Cancelar"><X size={16} /></button>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={editEmitirNfce} 
                              onChange={e => setEditEmitirNfce(e.target.checked)} 
                              className="rounded bg-zinc-900 border-zinc-700 text-blue-500" 
                            />
                            Emitir NFC-e
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={editHasVariablePricing} 
                              onChange={e => setEditHasVariablePricing(e.target.checked)} 
                              className="rounded bg-zinc-900 border-zinc-700 text-blue-500" 
                            />
                            Preço Variável
                          </label>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-100 text-sm truncate">{m.name}</span>
                            {m.hasVariablePricing && (
                              <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                Preço Variável
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Toggle NFC-e */}
                        <button
                          type="button"
                          onClick={() => handleToggleCustomNfce(m)}
                          className={`text-xs px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition ${
                            isFiscal
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isFiscal ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                          {isFiscal ? '⚡ Emite NFC-e' : '⚪ Sem Emissão'}
                        </button>

                        {/* Status Ativo/Inativo */}
                        <button
                          onClick={() => handleToggleActive(m)}
                          className={`text-xs px-3 py-1.5 rounded-xl border font-bold transition ${
                            m.active 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30' 
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-emerald-400'
                          }`}
                        >
                          {m.active ? 'Ativo' : 'Inativo'}
                        </button>

                        <button 
                          onClick={() => { 
                            setEditingId(m.id); 
                            setEditName(m.name); 
                            setEditHasVariablePricing(m.hasVariablePricing);
                            setEditEmitirNfce(m.emitirNfce !== false);
                          }} 
                          className="p-1.5 text-zinc-500 hover:text-blue-400 transition rounded-lg hover:bg-zinc-800"
                          title="Editar"
                        >
                          <Edit2 size={15} />
                        </button>
                        
                        <button 
                          onClick={() => handleDelete(m.id, m.name)} 
                          className="p-1.5 text-zinc-500 hover:text-red-400 transition rounded-lg hover:bg-red-500/10"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 p-3.5 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-xs text-blue-400/90 leading-relaxed flex items-start gap-2">
          <Info size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Dica iFood & Plataformas:</strong> Ao fechar uma venda com forma "iFood", o caixa pode digitar o valor real recebido pelo iFood (que pode ter 12% de taxa). Isso garante que o fechamento do caixa bata no final do dia.
          </div>
        </div>
      </div>
    </div>
  );
}
