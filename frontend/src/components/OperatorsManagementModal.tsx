"use client";
import { useState, useEffect } from "react";
import { X, Plus, KeyRound, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Operator {
  id: string;
  name: string;
  active: boolean;
  isManager: boolean;
  jobTitle?: string | null;
  hasOpenRegister?: boolean;
}

interface OperatorsManagementModalProps {
  onClose: () => void;
}

export default function OperatorsManagementModal({ onClose }: OperatorsManagementModalProps) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for adding/editing operator
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [hideReceipts, setHideReceipts] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/operators");
      setOperators(data);
    } catch (err: any) {
      toast.error("Erro ao carregar colaboradores.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id: string, active: boolean) => {
    try {
      await api.patch(`/operators/${id}`, { active: !active });
      toast.success(`Colaborador ${active ? 'inativado' : 'ativado'} com sucesso.`);
      fetchOperators();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erro ao alterar status.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId && (pin.length < 4 || pin.length > 6)) {
      toast.error("O PIN deve ter entre 4 e 6 dígitos.");
      return;
    }
    if (editId && pin && (pin.length < 4 || pin.length > 6)) {
      toast.error("O PIN deve ter entre 4 e 6 dígitos.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = { 
        name, 
        isManager: !hideReceipts, 
        jobTitle: jobTitle.trim() || null 
      };
      if (pin) payload.pin = pin;

      if (editId) {
        await api.patch(`/operators/${editId}`, payload);
        toast.success("Colaborador atualizado!");
      } else {
        if (!pin) {
          toast.error("Preencha o PIN!");
          setSubmitting(false);
          return;
        }
        await api.post("/operators", payload);
        toast.success("Colaborador criado!");
      }
      
      setShowForm(false);
      setEditId(null);
      setName("");
      setPin("");
      setJobTitle("");
      setHideReceipts(true);
      fetchOperators();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Erro ao ${editId ? 'atualizar' : 'criar'} colaborador.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (op: Operator) => {
    setEditId(op.id);
    setName(op.name);
    setJobTitle(op.jobTitle || "");
    setHideReceipts(!op.isManager);
    setPin("");
    setShowForm(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">
            {showForm ? (editId ? "Editar Colaborador" : "Novo Colaborador") : "Colaboradores do Caixa"}
          </h2>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {showForm ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Nome do Colaborador</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all outline-none text-white text-sm"
              />
            </div>

            {/* Função / jobTitle */}
            <div>
              <label className="text-sm text-zinc-400 mb-1.5 block">Função <span className="text-zinc-600">(opcional)</span></label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ex: Motoqueiro, Garçom, Balconista..."
                className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-all outline-none text-white text-sm"
              />
              {/* Sugestões rápidas */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Motoqueiro', 'Garçom', 'Cozinheiro', 'Balconista', 'Gerente', 'Caixa'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setJobTitle(s);
                      setHideReceipts(s !== 'Gerente');
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium ${
                      jobTitle === s
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="text-sm text-amber-400 mb-1.5 font-semibold flex items-center gap-1.5">
                <KeyRound size={14} /> PIN do colaborador
              </label>
              <input
                type="text"
                required={!editId}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={6}
                placeholder={editId ? "Novo PIN (deixe branco p/ manter)" : "4 a 6 dígitos (usado na tela de vendas)"}
                className="w-full px-4 py-2.5 bg-zinc-950 border border-amber-500/30 rounded-xl focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all outline-none text-white text-sm"
              />
              <button type="button" className="mt-2 text-sm text-amber-300" onClick={() => {
                const digits = new Uint32Array(6);
                crypto.getRandomValues(digits);
                setPin(Array.from(digits, n => n % 10).join(''));
              }}>Gerar novo PIN</button>
              {editId && <p className="mt-1 text-xs text-zinc-400">Ao salvar um novo PIN, o garçom precisará entrar novamente nos dispositivos em uso.</p>}
            </div>

              <div className="flex items-start gap-3 pt-2 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
                <input
                  type="checkbox"
                  id="hideReceipts"
                  checked={hideReceipts}
                  onChange={(e) => setHideReceipts(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900 cursor-pointer shrink-0"
                />
                <label htmlFor="hideReceipts" className="text-sm text-zinc-300 cursor-pointer select-none">
                  <strong className="block text-white text-sm">Ocultar recebimentos do caixa</strong>
                  <span className="text-xs text-zinc-400 leading-relaxed block mt-0.5">
                    Se marcado, os valores totais de fechamento (dinheiro físico, cartões, pix e total esperado na gaveta) ficam ocultos (Auditoria Cega). O operador ainda visualiza todas as vendas individuais registradas.
                  </span>
                </label>
              </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditId(null); setName(""); setPin(""); setJobTitle(""); setHideReceipts(true); }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-lg flex justify-center items-center"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : (editId ? "Salvar" : "Cadastrar")}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5">
            <div className="flex justify-between items-center mb-4">
              <p className="text-zinc-400 text-sm">
                Esses colaboradores poderão acessar o PDV informando o PIN.
              </p>
              <button 
                onClick={() => setShowForm(true)}
                className="bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                <Plus size={16} /> Novo
              </button>
            </div>

            {loading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="animate-spin text-zinc-500" size={32} />
              </div>
            ) : operators.length === 0 ? (
              <div className="text-center py-10 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                <p className="text-zinc-500 mb-2">Nenhum colaborador cadastrado</p>
                <button onClick={() => setShowForm(true)} className="text-blue-500 text-sm hover:underline font-semibold">
                  Cadastrar o primeiro
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {operators.map(op => (
                  <div key={op.id} className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800/50 rounded-xl hover:border-zinc-700 transition-colors">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => handleEdit(op)}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-base flex items-center gap-2">
                          {op.name}
                          {op.isManager ? (
                            <span className="bg-emerald-500/15 text-emerald-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-emerald-500/25">
                              Totais Visíveis
                            </span>
                          ) : (
                            <span className="bg-zinc-800 text-zinc-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-zinc-700">
                              Recebimentos Ocultos
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          {op.jobTitle && (
                            <span className="bg-purple-500/15 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-500/25">{op.jobTitle}</span>
                          )}
                          {op.active ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                              <CheckCircle2 size={10} /> Ativo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                              <XCircle size={10} /> Inativo
                            </span>
                          )}
                          <span className="text-zinc-600 text-xs">PIN configurado</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStatus(op.id, op.active); }}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-all ${
                        op.active
                          ? "text-red-400 hover:bg-red-500/10 border-transparent hover:border-red-500/20"
                          : "text-emerald-400 hover:bg-emerald-500/10 border-transparent hover:border-emerald-500/20"
                      }`}
                    >
                      {op.active ? "Bloquear" : "Liberar"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>
    </div>
  );
}
