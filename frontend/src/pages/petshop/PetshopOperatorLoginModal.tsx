import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock, UserCheck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useShift } from '@/contexts/ShiftContext';

export interface OperatorItem {
  id: string;
  name: string;
  active: boolean;
  isManager: boolean;
  jobTitle?: string | null;
}

interface PetshopOperatorLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isMandatory?: boolean;
}

export function PetshopOperatorLoginModal({
  isOpen,
  onClose,
  onSuccess,
  isMandatory = false,
}: PetshopOperatorLoginModalProps) {
  const { operator, setOperator, logoutOperator } = useShift();
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOp, setSelectedOp] = useState<OperatorItem | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSelectedOp(null);
    setPin('');
    setErrorMsg(null);

    api
      .get<OperatorItem[]>('/operators')
      .then(res => {
        const activeOps = (res.data || []).filter(o => o.active);
        setOperators(activeOps);
        // Se já tiver operador ativo, pré-seleciona
        if (operator?.id) {
          const found = activeOps.find(o => o.id === operator.id);
          if (found) setSelectedOp(found);
        }
      })
      .catch(() => toast.error('Não foi possível carregar a equipe.'))
      .finally(() => setLoading(false));
  }, [isOpen, operator?.id]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOp || pin.length < 4) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.post('/auth/operator-login', {
        operatorId: selectedOp.id,
        pin,
        context: 'petshop',
      });

      const { operatorToken, ...operatorData } = res.data;
      setOperator(operatorData, operatorToken);
      toast.success(`Colaborador(a) identificado(a): ${selectedOp.name}`);
      onClose();
      onSuccess?.();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'PIN incorreto. Tente novamente.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveOperator = () => {
    logoutOperator();
    toast.info('Sessão de colaborador encerrada.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto rounded-2xl border border-[var(--pc-border)] bg-white shadow-2xl text-[var(--pc-text)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--pc-border)] bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <KeyRound size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {selectedOp ? 'Confirmar PIN do Colaborador' : 'Identificação de Colaborador'}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedOp
                  ? `Informe o PIN de ${selectedOp.name}`
                  : 'Selecione quem está em atendimento no momento'}
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="animate-spin text-[var(--pc-action)]" size={20} />
              <span>Carregando equipe cadastrada…</span>
            </div>
          ) : !selectedOp ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Os colaboradores com perfil restrito acessam apenas a <strong>Agenda</strong> e o <strong>PDV</strong>, protegendo dados financeiros e configurações.
              </p>

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {operators.map(op => {
                  const isCurrent = operator?.id === op.id;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setSelectedOp(op);
                        setPin('');
                        setErrorMsg(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                        isCurrent
                          ? 'border-[var(--pc-action)] bg-emerald-50/60'
                          : 'border-[var(--pc-border)] bg-white hover:border-[var(--pc-border-strong)] hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 font-bold text-xs text-emerald-800">
                          {op.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <strong className="block text-sm font-semibold text-slate-900">{op.name}</strong>
                          <span className="text-xs text-slate-500">{op.jobTitle || 'Colaborador'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {op.isManager ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-2xs font-semibold text-blue-700">
                            Gerente
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-2xs font-medium text-slate-600">
                            Operacional
                          </span>
                        )}
                        {isCurrent && <CheckCircle2 size={16} className="text-emerald-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {operator && (
                <div className="border-t border-[var(--pc-border)] pt-3 text-center">
                  <button
                    type="button"
                    onClick={handleRemoveOperator}
                    className="text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Sair do perfil atual ({operator.name})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedOp(null);
                  setPin('');
                  setErrorMsg(null);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
              >
                <ArrowLeft size={14} />
                <span>Trocar colaborador</span>
              </button>

              <div className="flex items-center gap-3 rounded-xl border border-[var(--pc-border)] bg-slate-50 p-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 font-bold text-sm text-emerald-800">
                  {selectedOp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong className="block text-sm font-bold text-slate-900">{selectedOp.name}</strong>
                  <span className="text-xs text-slate-500">
                    Cargo: {selectedOp.jobTitle || 'Colaborador'} · {selectedOp.isManager ? 'Acesso Gerencial' : 'Acesso Restrito (Hoje + Agenda)'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-center text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                  Digite seu PIN (4 a 6 dígitos)
                </label>
                <input
                  type="password"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={e => {
                    setPin(e.target.value.replace(/\D/g, ''));
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="••••"
                  className={`h-14 w-full rounded-2xl border-2 text-center font-mono text-2xl tracking-[0.5em] font-bold text-slate-900 outline-none transition ${
                    errorMsg
                      ? 'border-rose-400 bg-rose-50/50'
                      : 'border-[var(--pc-border-strong)] bg-white focus:border-[var(--pc-action)]'
                  }`}
                />
                {errorMsg && (
                  <p className="mt-1 text-center text-xs font-medium text-rose-600">{errorMsg}</p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                {!isMandatory && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-11 flex-1 rounded-xl border border-[var(--pc-border-strong)] bg-white font-semibold text-sm text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting || pin.length < 4}
                  className={`h-11 ${isMandatory ? 'w-full' : 'flex-1'} rounded-xl bg-[var(--pc-action)] font-semibold text-sm text-white hover:bg-[var(--pc-action-hover)] disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-2xs`}
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  <span>Entrar</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
