import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { FileText, Loader2, X, AlertOctagon, Receipt, Trash2, EyeOff, Edit2, KeyRound, Unlock, ShieldCheck, SlidersHorizontal, Sparkles, CheckCircle2, RotateCcw, Calculator, Save, PawPrint, ChefHat, Crosshair } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useShift } from '@/contexts/ShiftContext';
import { usePinAuthStore } from '@/store/pinAuth';
import { EditPaymentModal } from './EditPaymentModal';

// Mapa de IDs de métodos padrão → nome legível para exibição na auditoria
const METHOD_DISPLAY: Record<string, string> = {
  dinheiro:             'Dinheiro',
  pix:                  'Pix',
  credito:              'Crédito',
  debito:               'Débito',
  consumo_funcionario:  'Consumo Colaborador',
};

export function CloseRegisterModal({ 
  isOpen, 
  onClose, 
  registerId,
  isAdminView = false,
  isPetshopTheme = false,
  isFoodTheme = false,
}: { 
  isOpen: boolean; 
  onClose: (closed: boolean) => void; 
  registerId: string | undefined;
  isAdminView?: boolean;
  isPetshopTheme?: boolean;
  isFoodTheme?: boolean;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [closingValue, setClosingValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // 1 = auditoria, 2 = confirmação final
  const [mobileTab, setMobileTab] = useState<'summary' | 'sales'>('summary');

  // Estados de Desbloqueio por PIN do Caixa
  const [isUnlockedByPin, setIsUnlockedByPin] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [cashierPinInput, setCashierPinInput] = useState('');
  const [verifyingCashierPin, setVerifyingCashierPin] = useState(false);

  // Estados de Correção Opcional de Recebimentos Digitais (Confirmados/Salvos)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustCredit, setAdjustCredit] = useState('');
  const [adjustDebit, setAdjustDebit] = useState('');
  const [adjustPix, setAdjustPix] = useState('');
  const [adjustCustom, setAdjustCustom] = useState<Record<string, string>>({});
  const [adjustNotes, setAdjustNotes] = useState('');

  // Estados Temporários / Rascunho (Descartados caso feche no 'X' sem salvar)
  const [tempCredit, setTempCredit] = useState('');
  const [tempDebit, setTempDebit] = useState('');
  const [tempPix, setTempPix] = useState('');
  const [tempCustom, setTempCustom] = useState<Record<string, string>>({});
  const [tempNotes, setTempNotes] = useState('');

  const openAdjustModal = () => {
    setTempCredit(adjustCredit);
    setTempDebit(adjustDebit);
    setTempPix(adjustPix);
    setTempCustom({ ...adjustCustom });
    setTempNotes(adjustNotes);
    setAdjustModalOpen(true);
  };

  const { user } = useAuthStore();
  const { operator } = useShift();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // canSeeTotals:
  // 1. Se estiver na visão do Dashboard (isAdminView) OU for admin sem operador ativo na sessão:
  //    -> NUNCA oculta nada! O Admin visualiza todos os totais, dinheiro, cartões, pix, faturamento e quebras.
  // 2. Se tiver sido desbloqueado via PIN do Caixa / Gerente (isUnlockedByPin):
  //    -> Revela todos os valores imediatamente na sessão do modal.
  // 3. Se for no PDV:
  //    -> Se isManager for true: visualiza totais.
  //    -> Se isManager for false (ocultar recebimentos ativado): totais ficam mascarados com 'R$ •••••' (Auditoria Cega).
  const canSeeTotals = isAdminView 
    ? true 
    : isUnlockedByPin
      ? true
      : isAdmin && !operator 
        ? true 
        : Boolean(data?.register?.operator?.isManager ?? operator?.isManager);

  const handleVerifyCashierPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cashierPinInput || cashierPinInput.length < 4) {
      toast.error('Informe o PIN do Caixa (mínimo 4 dígitos).');
      return;
    }
    if (!registerId) {
      toast.error('Caixa não selecionado para validação de PIN.');
      return;
    }
    setVerifyingCashierPin(true);
    try {
      const res = await api.post('/tenants/me/verify-cashier-pin', { pin: cashierPinInput, registerId });
      if (res.data?.pinAuthToken) {
        usePinAuthStore.getState().setPinAuth(res.data.pinAuthToken);
      }
      setIsUnlockedByPin(true);
      setUnlockModalOpen(false);
      setCashierPinInput('');
      toast.success('Valores e auditoria do caixa desbloqueados com sucesso!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'PIN do Caixa incorreto.');
      setCashierPinInput('');
    } finally {
      setVerifyingCashierPin(false);
    }
  };

  // Quando o token de autorização do PIN expira, oculta os valores e reabre o prompt de PIN
  useEffect(() => {
    const handlePinAuthExpired = () => {
      setIsUnlockedByPin(false);
      setUnlockModalOpen(true);
      toast.error('Sua autorização por PIN expirou. Digite o PIN novamente para continuar.');
    };

    window.addEventListener('pin-auth-expired', handlePinAuthExpired);
    return () => {
      window.removeEventListener('pin-auth-expired', handlePinAuthExpired);
    };
  }, []);

  // Limpa autorização por PIN quando o modal de fechamento é fechado ou ao trocar de caixa
  useEffect(() => {
    if (!isOpen) {
      setIsUnlockedByPin(false);
      usePinAuthStore.getState().clearPinAuth();
    }
  }, [isOpen, registerId]);

  const renderMoney = (
    val: number | string | undefined | null,
    options?: { prefix?: string; sign?: '+' | '-' }
  ) => {
    const prefix = options?.prefix ?? 'R$ ';
    const signStr = options?.sign ? `${options.sign} ` : '';
    if (canSeeTotals) {
      return `${signStr}${prefix}${Number(val || 0).toFixed(2)}`;
    }
    return (
      <span className="tracking-widest font-mono text-zinc-500 select-none">
        {signStr}{prefix}•••••
      </span>
    );
  };

  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [editingSale, setEditingSale] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleInitiateCancel = (saleId: string) => {
    setCancelSaleId(saleId);
    setCancelReason('');
  };

  const handleCancelSale = async () => {
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    setCancelling(true);
    try {
      await api.post(`/sales/${cancelSaleId}/cancel`, { reason: cancelReason });
      toast.success('Venda cancelada com sucesso. Estoque e caixa atualizados.');
      
      const res = await api.get(`/cash-registers/${registerId}/report?_t=${Date.now()}`);
      setData(res.data);
      setClosingValue(res.data.report.expectedDinheiro);
      setCancelSaleId(null);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Erro ao cancelar venda.');
    } finally {
      setCancelling(false);
    }
  };

  const loadReport = async (regId = registerId, preserveInputs = false) => {
    if (!regId) return;
    try {
      const res = await api.get(`/cash-registers/${regId}/report?_t=${Date.now()}`);
      setData(res.data);

      if (!preserveInputs) {
        if (res.data.register?.status !== 'closed' || res.data.register?.closingValue == null) {
          setClosingValue(res.data.report?.expectedDinheiro ?? 0);
        } else {
          setClosingValue(Number(res.data.register.closingValue || 0));
        }

        const cDetailsRaw = res.data.register?.closingDetails || res.data.conferenceDetails || res.data.report?.closingDetails || res.data.report?.conferenceDetails;
        if (cDetailsRaw) {
          try {
            const cDetails = typeof cDetailsRaw === 'string' ? JSON.parse(cDetailsRaw) : cDetailsRaw;
            setAdjustCredit(cDetails.declaredCredit != null ? String(cDetails.declaredCredit) : '');
            setAdjustDebit(cDetails.declaredDebit != null ? String(cDetails.declaredDebit) : '');
            setAdjustPix(cDetails.declaredPix != null ? String(cDetails.declaredPix) : '');
            setAdjustCustom(cDetails.declaredCustom || {});
            setAdjustNotes(cDetails.notes || '');
            if (cDetails.declaredCash != null && (res.data.register?.status !== 'closed' || res.data.register?.closingValue == null)) {
              setClosingValue(Number(cDetails.declaredCash));
            }
          } catch {
            // fallback se não for JSON válido
          }
        } else {
          setAdjustCredit('');
          setAdjustDebit('');
          setAdjustPix('');
          setAdjustCustom({});
          setAdjustNotes('');
        }
      }
    } catch {
      toast.error('Falha ao gerar relatório detalhado');
    }
  };

  const handlePaymentEdited = async () => {
    setEditingSale(null);
    setLoading(true);
    try {
      await loadReport();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !registerId) return;
    setLoading(true);
    setData(null);
    setStep(1);
    setMobileTab('summary');
    setIsUnlockedByPin(false);
    setUnlockModalOpen(false);
    setCashierPinInput('');
    setAdjustModalOpen(false);
    loadReport(registerId).finally(() => setLoading(false));
  }, [isOpen, registerId]);

  // Cálculos reativos de recebimentos digitais declarados vs sistema
  const hasDigitalAdjustments = Boolean(
    adjustCredit !== '' ||
    adjustDebit !== '' ||
    adjustPix !== '' ||
    Object.keys(adjustCustom).length > 0 ||
    adjustNotes.trim()
  );

  const declaredCreditVal = adjustCredit !== '' ? parseFloat(adjustCredit) || 0 : Number(data?.report?.totalCredito || 0);
  const declaredDebitVal = adjustDebit !== '' ? parseFloat(adjustDebit) || 0 : Number(data?.report?.totalDebito || 0);
  const declaredPixVal = adjustPix !== '' ? parseFloat(adjustPix) || 0 : Number(data?.report?.totalPix || 0);

  const computedTotalDigital = declaredCreditVal + declaredDebitVal + declaredPixVal +
    (data?.report?.customMethods || []).reduce((acc: number, cm: any) => {
      const v = adjustCustom[cm.method] !== undefined ? parseFloat(adjustCustom[cm.method]) || 0 : Number(cm.total || 0);
      return acc + v;
    }, 0);

  const computedTotalVendas = Number(data?.report?.totalDinheiro || 0) + computedTotalDigital;

  if (!isOpen) return null;
  if (!mounted) return null;

  // Sem caixa aberto: mostra aviso em vez de travar
  if (!registerId) {
    const fallbackContent = (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md p-8 text-center shadow-2xl">
          <p className="text-zinc-400 text-lg">Nenhum caixa aberto no momento.</p>
          <button onClick={() => onClose(false)} className="mt-6 px-6 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition">Fechar</button>
        </div>
      </div>
    );
    return createPortal(fallbackContent, (isFoodTheme && document.getElementById('food-portals')) || document.body);
  }

  // Avança para a tela de confirmação (passo 2) — zera o campo para o operador preencher manualmente
  const goToConfirmation = () => {
    setClosingValue(0);
    setStep(2);
  };

  const buildClosingDetailsPayload = (overrideFields?: {
    credit?: string;
    debit?: string;
    pix?: string;
    custom?: Record<string, string>;
    notes?: string;
    cash?: number;
  }) => {
    const cred = overrideFields?.credit !== undefined ? overrideFields.credit : adjustCredit;
    const deb = overrideFields?.debit !== undefined ? overrideFields.debit : adjustDebit;
    const px = overrideFields?.pix !== undefined ? overrideFields.pix : adjustPix;
    const cust = overrideFields?.custom !== undefined ? overrideFields.custom : adjustCustom;
    const nts = overrideFields?.notes !== undefined ? overrideFields.notes : adjustNotes;
    const cashVal = overrideFields?.cash !== undefined ? overrideFields.cash : closingValue;

    const dCred = cred !== '' ? parseFloat(cred) || 0 : Number(data?.report?.totalCredito || 0);
    const dDeb = deb !== '' ? parseFloat(deb) || 0 : Number(data?.report?.totalDebito || 0);
    const dPix = px !== '' ? parseFloat(px) || 0 : Number(data?.report?.totalPix || 0);

    const formattedCustom: Record<string, number> = {};
    if (cust && typeof cust === 'object') {
      for (const [k, v] of Object.entries(cust)) {
        if (v !== '' && v !== undefined && v !== null) {
          formattedCustom[k] = parseFloat(String(v)) || 0;
        }
      }
    }

    const dDigital = dCred + dDeb + dPix +
      (data?.report?.customMethods || []).reduce((acc: number, cm: any) => {
        const v = formattedCustom[cm.method] !== undefined ? formattedCustom[cm.method] : Number(cm.total || 0);
        return acc + v;
      }, 0);

    const totalAjustado = Number(data?.report?.totalDinheiro || 0) + dDigital;
    const originalVendas = Number(data?.report?.totalVendas || 0);

    return {
      declaredCash: cashVal,
      declaredCredit: dCred,
      declaredDebit: dDeb,
      declaredPix: dPix,
      declaredCustom: formattedCustom,
      totalVendasOriginal: originalVendas,
      totalVendasAjustado: totalAjustado,
      diffDigital: totalAjustado - originalVendas,
      notes: nts.trim(),
      adjustedAt: new Date().toISOString(),
      adjustedBy: user?.name || operator?.name || 'Operador',
      dataVersion: data?.dataVersion || data?.report?.dataVersion || '',
    };
  };

  const handleSaveDraft = async () => {
    if (!registerId) return;
    setSubmitting(true);
    try {
      const closingDetails = buildClosingDetailsPayload();
      await api.patch(`/cash-registers/${registerId}/conference`, {
        conferenceDetails: closingDetails,
      });
      toast.success('Rascunho de conferência salvo com sucesso!');
      await loadReport(registerId, true);
    } catch (err: any) {
      if (err.response?.status === 409 || err.response?.data?.errorSource === 'version_mismatch') {
        await loadReport(registerId, true);
        toast.error('Novas movimentações foram registradas no caixa. Os totais do sistema foram atualizados, mas seus dados foram preservados. Revise e salve novamente.');
      } else {
        toast.error(err.response?.data?.message || 'Erro ao salvar rascunho de conferência');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Fecha o caixa de verdade (chamado apenas no passo 2)
  const handleClose = async () => {
    setSubmitting(true);
    try {
      const closingDetails = buildClosingDetailsPayload();
      const payload = {
        closingValue: canSeeTotals ? closingValue : null,
        closingDetails,
      };
      await api.post(`/cash-registers/${registerId}/close`, payload);
      toast.success('Caixa encerrado formalmente. Bom descanso!');
      onClose(true);
    } catch (err: any) {
      if (err.response?.status === 409 || err.response?.data?.errorSource === 'version_mismatch') {
        await loadReport(registerId, true);
        toast.error('Novas vendas foram registradas durante a conferência. Os valores do sistema foram atualizados, mas suas contagens foram preservadas. Revise e confirme novamente.');
      } else {
        toast.error(err.response?.data?.message || 'Erro ao fechar caixa');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAudit = async (customPayload?: any, andClose = false) => {
    setSubmitting(true);
    try {
      const closingDetails = customPayload !== undefined 
        ? buildClosingDetailsPayload(customPayload) 
        : buildClosingDetailsPayload();
      const valToSave = data?.register?.closingValue != null ? Number(data.register.closingValue) : closingValue;
      await api.patch(`/cash-registers/${registerId}/audit`, {
        closingValue: valToSave,
        closingDetails,
      });
      toast.success('Auditoria e ajustes salvos com sucesso!');
      if (andClose) {
        onClose(true);
      } else {
        await loadReport(registerId, true);
      }
      return true;
    } catch (err: any) {
      if (err.response?.status === 409 || err.response?.data?.errorSource === 'version_mismatch') {
        await loadReport(registerId, true);
        toast.error('Novas movimentações foram registradas no caixa. Os dados do sistema foram atualizados, mas suas contagens foram preservadas. Revise e confirme novamente.');
      } else {
        toast.error(err.response?.data?.message || 'Erro ao salvar auditoria');
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const modalBody = (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md p-4 lg:p-8 transition-all ${
      isFoodTheme ? 'bg-black/60 pract-food-shell food-adapted' : 'bg-black/90'
    } ${isPetshopTheme ? 'petcare-report-theme' : ''}`}>
      <div className={`w-full max-w-6xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full max-h-[95vh] lg:max-h-[90vh] ${
        isFoodTheme 
          ? 'bg-white border border-zinc-200/90 text-zinc-900 rounded-[2rem] shadow-2xl' 
          : `bg-zinc-950 border border-zinc-800 rounded-[2rem] shadow-[0_0_100px_rgba(239,68,68,0.1)] ${isPetshopTheme ? 'petcare-report-card' : ''}`
      }`}>
        <div className={`relative flex justify-between items-center p-4 md:p-6 border-b shrink-0 ${
          isFoodTheme 
            ? 'border-zinc-100 bg-white' 
            : `border-zinc-800 bg-zinc-900/50 ${isPetshopTheme ? 'petcare-report-header' : ''}`
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isFoodTheme ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : isPetshopTheme ? 'text-[var(--pet-pos-action)] bg-teal-50' : 'bg-red-500/10 text-red-500'
            }`}>
              <FileText size={20} />
            </div>
            <div>
              <h2 className={`text-xl md:text-2xl font-bold flex items-center gap-2 ${
                isFoodTheme ? 'text-zinc-900' : 'text-white'
              }`}>
                Auditoria de Fechamento
              </h2>
              {isFoodTheme && (
                <p className="text-xs text-zinc-500">
                  Confira os valores do turno e confirme o fechamento da gaveta.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isFoodTheme && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-bold">
                <ChefHat size={16} /> Pract Food
              </div>
            )}
            {isPetshopTheme && <PawPrint aria-hidden="true" className="petcare-report-watermark" size={54} />}
            <button 
              onClick={() => onClose(false)} 
              className={`p-2 rounded-full transition-colors ${
                isFoodTheme ? 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <X size={24}/>
            </button>
          </div>
        </div>

        {loading || !data ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-red-500" size={48} /></div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Abas responsivas para Mobile */}
            <div className={`flex lg:hidden border-b border-zinc-800 bg-zinc-900/80 p-2 gap-2 shrink-0 ${isPetshopTheme ? 'petcare-report-tabs' : ''}`}>
              <button
                type="button"
                onClick={() => setMobileTab('summary')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  mobileTab === 'summary'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText size={15} /> Resumo Financeiro
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('sales')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  mobileTab === 'sales'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Receipt size={15} /> Vendas ({data?.report?.countSales || 0})
              </button>
            </div>

            <div className={`flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden ${isPetshopTheme ? 'petcare-report-body' : ''}`}>
              {/* Lado Esquerdo: Resumo Financeiro e Declaração */}
              <div className={`w-full lg:w-[45%] h-auto lg:h-full flex-col border-b lg:border-b-0 lg:border-r border-zinc-800 bg-zinc-900/20 lg:overflow-y-auto custom-scrollbar shrink-0 ${isPetshopTheme ? 'petcare-report-summary-column' : ''} ${
                mobileTab === 'summary' ? 'flex' : 'hidden lg:flex'
              }`}>
                <div className={`p-4 md:p-6 space-y-4 md:space-y-6 flex-1 overflow-y-auto custom-scrollbar ${isPetshopTheme ? 'petcare-report-summary-content' : ''}`}>
                  {isUnlockedByPin && (
                    <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-400 text-xs font-bold animate-in fade-in duration-200">
                      <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /> Auditoria Desbloqueada via PIN</span>
                      <span className="text-[10px] uppercase bg-emerald-500/20 px-2 py-0.5 rounded font-mono">Visão Completa</span>
                    </div>
                  )}

                  {(data?.conferenceIsStale || data?.report?.conferenceIsStale) && (
                    <div className="flex items-center gap-2.5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 text-xs font-semibold animate-in fade-in duration-200">
                      <AlertOctagon size={16} className="shrink-0 text-amber-400" />
                      <span>Novas vendas ou movimentações foram registradas após o último rascunho de conferência. Os dados do sistema foram atualizados.</span>
                    </div>
                  )}

                  <div className={`flex justify-between items-center text-xs pb-2 border-b ${
                    isFoodTheme 
                      ? 'text-zinc-500 border-zinc-200/90' 
                      : `text-zinc-400 border-zinc-800 ${isPetshopTheme ? 'petcare-report-shift-meta' : ''}`
                  }`}>
                    <span>Abertura: <strong className={`text-sm ml-1 ${isFoodTheme ? 'text-zinc-800 font-bold' : 'text-zinc-300'}`}>{new Date(data.register.openingTime).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</strong></span>
                    <span>Vendas do Turno: <strong className={`text-sm ml-1 ${isFoodTheme ? 'text-zinc-800 font-bold' : 'text-zinc-300'}`}>{data.report.countSales}</strong></span>
                  </div>
                
                <div className="space-y-3">
                  <div className={`flex justify-between p-4 rounded-2xl border ${
                    isFoodTheme 
                      ? 'bg-[#f8faf8] border-emerald-100/90 shadow-xs' 
                      : `bg-zinc-950 border-zinc-800/80 ${isPetshopTheme ? 'petcare-report-metric-card' : ''}`
                  }`}>
                    <span className={isFoodTheme ? 'text-zinc-600 font-medium' : 'text-zinc-400'}>Fundo de Troco (Inicial)</span>
                    <span className={`font-bold ${isFoodTheme ? 'text-zinc-900' : 'text-white'}`}>{renderMoney(data.register.openingValue)}</span>
                  </div>
                  
                  <div className={`flex justify-between p-4 rounded-2xl border ${
                    isFoodTheme 
                      ? 'bg-[#eef7f0] border-emerald-200/90 text-emerald-800 shadow-xs' 
                      : `bg-emerald-500/5 text-emerald-400 border-emerald-500/10 ${isPetshopTheme ? 'petcare-report-cash-card' : ''}`
                  }`}>
                    <span className={isFoodTheme ? 'font-semibold text-emerald-800' : ''}>(+) Recebimentos em Dinheiro Físico</span>
                    <span className={`font-bold text-lg ${isFoodTheme ? 'text-emerald-800' : ''}`}>{renderMoney(data.report.totalDinheiro, { sign: '+' })}</span>
                  </div>
                  
                  {data.report.totalSuprimentos > 0 && (
                    <div className="flex flex-col p-4 bg-blue-500/5 text-blue-400 rounded-2xl border border-blue-500/10">
                      <div className="flex justify-between items-center w-full border-b border-blue-500/10 pb-2 mb-2">
                        <span>(+) Suprimentos Injetados (Reforço)</span>
                        <span className="font-bold text-lg">{renderMoney(data.report.totalSuprimentos, { sign: '+' })}</span>
                      </div>
                      <div className="space-y-1.5 mt-1">
                        {data.report.movements.filter((m: any) => m.type === 'IN').map((m: any) => (
                           <div key={m.id} className="flex justify-between text-xs text-blue-400/80 items-center">
                             <div className="flex items-center gap-2">
                               <span className="bg-blue-500/10 px-1.5 py-0.5 rounded font-mono border border-blue-500/20">{new Date(m.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                               <span className="line-clamp-1">{m.reason || 'Sem descrição informada'}</span>
                             </div>
                             <span className="font-bold whitespace-nowrap">{renderMoney(m.value)}</span>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.report.totalSangrias > 0 && (
                    <div className="flex flex-col p-4 bg-red-500/5 text-red-500 rounded-2xl border border-red-500/10">
                      <div className="flex justify-between items-center w-full border-b border-red-500/10 pb-2 mb-2">
                        <span>(-) Sangrias Transferidas (Vales, etc)</span>
                        <span className="font-bold text-lg">{renderMoney(data.report.totalSangrias, { sign: '-' })}</span>
                      </div>
                      <div className="space-y-1.5 mt-1">
                        {data.report.movements.filter((m: any) => m.type === 'OUT').map((m: any) => (
                           <div key={m.id} className="flex justify-between text-xs text-red-400/80 items-center">
                             <div className="flex items-center gap-2">
                               <span className="bg-red-500/10 px-1.5 py-0.5 rounded font-mono border border-red-500/20">{new Date(m.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                               <span className="line-clamp-1">{m.reason || 'Sem descrição informada'}</span>
                             </div>
                             <span className="font-bold whitespace-nowrap">{renderMoney(m.value)}</span>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className={`space-y-2.5 p-4 rounded-2xl border text-sm ${
                    isFoodTheme 
                      ? 'bg-white border-zinc-200/90 text-zinc-800 shadow-xs' 
                      : `bg-zinc-900/50 border border-zinc-800 ${isPetshopTheme ? 'petcare-report-digital-card' : ''}`
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`font-bold uppercase text-[10px] tracking-widest ${isFoodTheme ? 'text-zinc-500' : 'text-zinc-500'}`}>Recebimentos Digitais (Em Conta)</p>
                      {canSeeTotals && (
                        <button
                          type="button"
                          onClick={openAdjustModal}
                          className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl transition cursor-pointer ${
                            isFoodTheme 
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80' 
                              : 'text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25'
                          }`}
                          title="Corrigir valores reais apurados na maquininha / extrato"
                        >
                          <SlidersHorizontal size={12} />
                          {hasDigitalAdjustments ? 'Ajustado (Editar)' : 'Corrigir Valores'}
                        </button>
                      )}
                    </div>

                    <div className={`flex justify-between items-center ${isFoodTheme ? 'text-zinc-700' : 'text-indigo-400'}`}>
                      <span>Cartão de Crédito</span>
                      <div className="text-right">
                        <span className={`font-bold ${isFoodTheme ? 'text-zinc-900' : ''}`}>{renderMoney(adjustCredit !== '' ? parseFloat(adjustCredit) || 0 : data.report.totalCredito || 0)}</span>
                        {adjustCredit !== '' && canSeeTotals && (
                          <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalCredito || 0).toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    <div className={`flex justify-between items-center ${isFoodTheme ? 'text-zinc-700' : 'text-sky-400'}`}>
                      <span>Cartão de Débito</span>
                      <div className="text-right">
                        <span className={`font-bold ${isFoodTheme ? 'text-zinc-900' : ''}`}>{renderMoney(adjustDebit !== '' ? parseFloat(adjustDebit) || 0 : data.report.totalDebito || 0)}</span>
                        {adjustDebit !== '' && canSeeTotals && (
                          <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalDebito || 0).toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    <div className={`flex justify-between items-center ${isFoodTheme ? 'text-zinc-700' : 'text-teal-400'}`}>
                      <span>Transferências (Pix)</span>
                      <div className="text-right">
                        <span className={`font-bold ${isFoodTheme ? 'text-zinc-900' : ''}`}>{renderMoney(adjustPix !== '' ? parseFloat(adjustPix) || 0 : data.report.totalPix || 0)}</span>
                        {adjustPix !== '' && canSeeTotals && (
                          <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalPix || 0).toFixed(2)}</span>
                        )}
                      </div>
                    </div>

                    {(data.report.customMethods || []).map((cm: any) => {
                      const customVal = adjustCustom[cm.method] !== undefined ? parseFloat(adjustCustom[cm.method]) || 0 : Number(cm.total || 0);
                      return (
                        <div key={cm.method} className={`flex justify-between items-center ${isFoodTheme ? 'text-zinc-700' : 'text-purple-400'}`}>
                          <span>{cm.label}</span>
                          <div className="text-right">
                            <span className={`font-bold ${isFoodTheme ? 'text-zinc-900' : ''}`}>{renderMoney(customVal)}</span>
                            {adjustCustom[cm.method] !== undefined && canSeeTotals && (
                              <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(cm.total || 0).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {hasDigitalAdjustments && adjustNotes && (
                      <div className={`pt-2 border-t text-[11px] italic ${isFoodTheme ? 'border-zinc-200 text-amber-700' : 'border-zinc-800 text-amber-400/90'}`}>
                        Obs: {adjustNotes}
                      </div>
                    )}
                  </div>

                  {canSeeTotals && (
                    <div className={`flex justify-between p-4 rounded-2xl border mt-4 ${
                      isFoodTheme 
                        ? 'bg-[#f8faf8] border-emerald-100/90 text-zinc-900 shadow-xs' 
                        : `bg-zinc-800/20 text-white border-zinc-700/50 ${isPetshopTheme ? 'petcare-report-gross-card' : ''}`
                    }`}>
                      <div>
                        <span className={`font-bold block ${isFoodTheme ? 'text-zinc-800' : 'text-zinc-300'}`}>Faturamento Bruto</span>
                        <span className="text-xs text-zinc-500 block">
                          {hasDigitalAdjustments ? (
                            <span className={isFoodTheme ? 'text-amber-600 font-medium' : 'text-amber-400 font-medium'}>Ajustado (Sistema: R$ {Number(data.report.totalVendas || 0).toFixed(2)})</span>
                          ) : (
                            'Todas transações da sessão'
                          )}
                        </span>
                      </div>
                      <span className={`font-black text-xl self-center ${isFoodTheme ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        R$ {computedTotalVendas.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {canSeeTotals ? (
                  <div className={`p-5 rounded-2xl border ${
                    isFoodTheme 
                      ? 'border-l-4 border-l-rose-500 bg-[#fff1f1] border-rose-200 text-rose-900 shadow-xs' 
                      : `border-l-4 border-l-red-500 bg-red-500/10 border-red-500/20 ${isPetshopTheme ? 'petcare-report-expected-card' : ''}`
                  }`}>
                    <p className={`text-xs font-extrabold uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${isFoodTheme ? 'text-rose-700' : 'text-red-500'}`}>
                      <Crosshair size={14} className="shrink-0" /> Total Esperado na Gaveta
                    </p>
                    <p className={`text-4xl font-black drop-shadow-xs ${isFoodTheme ? 'text-rose-900' : 'text-red-400'}`}>R$ {Number(data.report.expectedDinheiro).toFixed(2)}</p>
                  </div>
                ) : (
                  <div className={`p-5 border-l-4 border-l-blue-500 bg-blue-500/10 rounded-r-2xl border border-blue-500/20 space-y-3 ${isPetshopTheme ? 'petcare-report-audit-card' : ''}`}>
                    <p className="text-xs text-blue-400 font-extrabold uppercase flex items-center gap-2"><EyeOff size={14}/> Auditoria Cega</p>
                    <p className="text-zinc-300 text-sm">Você não tem acesso ao valor esperado. O gerente fará a conferência da gaveta no fechamento.</p>
                    <button
                      type="button"
                      onClick={() => setUnlockModalOpen(true)}
                      className={`w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md shadow-blue-600/20 mt-1 ${isPetshopTheme ? 'petcare-report-unlock' : ''}`}
                    >
                      <KeyRound size={14} /> Inserir PIN do Caixa para Revelar
                    </button>
                  </div>
                )}

                {data.register.status === 'closed' ? (
                  <div className="pt-4 text-center bg-zinc-950 rounded-[2rem] p-6 border border-zinc-800 shadow-inner">
                     {data.register.closingValue == null ? (
                       canSeeTotals ? (
                         <div className="text-left">
                           <p className="text-amber-500 font-bold mb-2 flex items-center gap-2"><AlertOctagon size={16}/> Pendente de Auditoria</p>
                           <p className="text-zinc-400 text-sm mb-4">Este caixa foi fechado às cegas por um operador. Insira a contagem da gaveta para finalizar a auditoria.</p>
                           <div className="flex gap-2">
                             <input 
                               type="number" 
                               step="0.01"
                               value={closingValue || ''}
                               onChange={e => setClosingValue(parseFloat(e.target.value) || 0)}
                               placeholder="R$ 0,00"
                               className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white font-bold"
                             />
                             <button 
                               onClick={handleAudit}
                               disabled={submitting}
                               className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-6 rounded-xl flex items-center gap-2"
                             >
                               {submitting ? <Loader2 className="animate-spin" size={18}/> : 'Auditar'}
                             </button>
                           </div>
                         </div>
                       ) : (
                         <p className="text-amber-500 font-bold flex justify-center gap-2 items-center"><AlertOctagon size={18}/> Fechamento Pendente de Auditoria</p>
                       )
                     ) : (
                       <>
                         <p className="text-zinc-500 text-sm">Este caixa já foi auditado e encerrado formalmente.</p>
                         <p className="text-emerald-400 font-black text-2xl mt-4 flex justify-center gap-2 items-center">
                           Declarado: R$ {Number(data.register.closingValue).toFixed(2)}
                         </p>
                         {Number(data.register.closingValue) !== Number(data.report.expectedDinheiro) && (
                            <p className="text-red-400 text-sm mt-4 border border-red-500/30 bg-red-500/10 inline-block px-4 py-2 rounded-full font-bold">
                              <AlertOctagon size={16} className="inline mr-1 -mt-0.5"/> Diferença Constatada (Quebra): R$ {(Number(data.register.closingValue) - Number(data.report.expectedDinheiro)).toFixed(2)}
                            </p>
                         )}
                       </>
                     )}
                  </div>
                ) : (
                  // Sem input aqui — o operador digita o valor somente na próxima tela
                  <div className={`pt-2 p-4 rounded-2xl border text-center ${
                    isFoodTheme 
                      ? 'bg-[#fffbeb] border-amber-200 text-amber-900 shadow-xs' 
                      : `bg-zinc-900/40 border-zinc-800 ${isPetshopTheme ? 'petcare-report-next-step' : ''}`
                  }`}>
                    <p className={`text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-1.5 ${isFoodTheme ? 'text-amber-800' : 'text-zinc-500'}`}>
                      <Sparkles size={13} className="shrink-0" /> Próximo passo
                    </p>
                    <p className={`text-sm mt-1 ${isFoodTheme ? 'text-amber-900' : 'text-zinc-300'}`}>{canSeeTotals ? 'Você irá conferir e digitar o valor físico da gaveta na próxima tela.' : 'Você irá encerrar este turno definitivamente na próxima tela.'}</p>
                  </div>
                )}
                
                {data.register.status === 'closed' ? (
                  <div className="flex gap-3 mt-4">
                    {isAdmin && (
                      <button 
                        onClick={() => handleAudit(undefined, true)}
                        disabled={submitting}
                        className="flex-1 py-4 rounded-2xl font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
                      >
                        {submitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                        Salvar Auditoria
                      </button>
                    )}
                    <button 
                      onClick={() => onClose(true)}
                      className={`${isAdmin ? 'px-6' : 'w-full'} py-4 rounded-2xl font-bold bg-zinc-800 hover:bg-zinc-700 text-white transition-all flex items-center justify-center gap-2 text-base cursor-pointer`}
                    >
                      Fechar
                    </button>
                  </div>
                ) : (
                  <div className={`flex gap-2 mt-4 ${isPetshopTheme ? 'petcare-report-actions' : ''}`}>
                    {canSeeTotals && (
                      <button 
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={submitting}
                        className={`py-5 px-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm cursor-pointer shadow-md active:scale-95 disabled:opacity-60 ${
                          isFoodTheme 
                            ? 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50' 
                            : `bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 ${isPetshopTheme ? 'petcare-report-save-draft' : ''}`
                        }`}
                        title="Salvar rascunho de conferência"
                      >
                        {submitting ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                        Salvar Rascunho
                      </button>
                    )}
                    <button 
                      onClick={goToConfirmation}
                      className={`flex-1 py-5 rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 text-lg ${
                        isFoodTheme 
                          ? 'bg-[#047857] hover:bg-[#065f46] text-white' 
                          : `bg-red-600 hover:bg-red-500 text-white ${isPetshopTheme ? 'petcare-report-continue' : ''}`
                      }`}
                    >
                      Confirmar Gaveta e Continuar →
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lado Direito: Transações Detalhadas (Painel Rolável Grande) */}
            <div className={`w-full lg:w-[55%] h-auto lg:h-full flex-col shrink-0 ${
              isFoodTheme ? 'bg-white text-zinc-900' : 'bg-zinc-950/80'
            } ${isPetshopTheme ? 'petcare-report-sales-column' : ''} ${
              mobileTab === 'sales' ? 'flex' : 'hidden lg:flex'
            }`}>
              <div className={`p-4 md:p-6 border-b flex items-center gap-3 ${
                isFoodTheme ? 'bg-zinc-50/60 border-zinc-100' : `border-zinc-800/80 bg-zinc-900/30 ${isPetshopTheme ? 'petcare-report-sales-header' : ''}`
              }`}>
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                   isFoodTheme ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : `bg-zinc-800 text-zinc-400 ${isPetshopTheme ? 'petcare-report-sales-icon' : ''}`
                 }`}>
                   <Receipt size={22}/>
                 </div>
                 <div>
                    <h3 className={`text-lg font-bold tracking-tight ${isFoodTheme ? 'text-zinc-900' : 'text-white'}`}>Registro Individual de Operações</h3>
                    <p className={`text-xs mt-0.5 ${isFoodTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>Todas as {data.report.countSales} transações logadas neste turno.</p>
                 </div>
              </div>
              
              <div className={`flex-1 h-auto lg:h-full overflow-y-visible lg:overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 animate-fade-in ${isPetshopTheme ? 'petcare-report-sales-list' : ''}`}>
                {data.report.salesDetails && data.report.salesDetails.length > 0 ? (
                  data.report.salesDetails.map((s: any) => (
                    <div key={s.id} className={`rounded-2xl p-4 md:p-5 transition-all group relative overflow-hidden ${
                      isFoodTheme
                        ? 'bg-white border border-zinc-200/90 hover:border-emerald-400 shadow-xs'
                        : `bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 ${s.status === 'cancelled' ? 'opacity-40 border-red-900/20' : ''} ${isPetshopTheme ? 'petcare-report-sale-card' : ''}`
                    }`}>
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${s.status === 'cancelled' ? 'bg-red-500/40' : isFoodTheme ? 'bg-[#047857]' : 'bg-zinc-800 group-hover:bg-blue-500'} transition-colors`}></div>
                      
                      <div className={`flex justify-between items-start mb-4 border-b pb-4 ${isFoodTheme ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                          <span className={`font-bold px-2.5 py-1 rounded-lg border text-xs tracking-wider ${
                            isFoodTheme ? 'bg-white border-zinc-200 text-zinc-700' : 'text-zinc-300 bg-zinc-950 border-zinc-800 shadow-inner'
                          }`}>
                             {new Date(s.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                          </span>
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                            isFoodTheme ? 'bg-white text-zinc-400 border border-zinc-200' : 'text-zinc-600 bg-zinc-950'
                          }`}>ID: {s.id.split('-')[0]}</span>
                          {s.status === 'cancelled' && (
                            <span className="bg-red-500/10 text-red-500 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-red-500/20 animate-pulse">
                              Cancelada
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className={`font-black text-lg md:text-xl ${s.status === 'cancelled' ? 'text-zinc-500 line-through decoration-red-500/50 decoration-2' : isFoodTheme ? 'text-emerald-800' : 'text-emerald-400'}`}>
                            R$ {Number(s.total || 0).toFixed(2)}
                          </span>
                          {isAdmin && s.status !== 'cancelled' && data.register.status === 'open' && (
                            <button
                              onClick={() => handleInitiateCancel(s.id)}
                              className={`p-2 md:p-1.5 rounded-xl md:rounded-lg transition-all border active:scale-95 cursor-pointer ml-1 ${
                                isFoodTheme 
                                  ? 'bg-red-50 hover:bg-red-100 text-red-500 border-red-200/80 shadow-xs' 
                                  : 'bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20 shadow-lg'
                              }`}
                              title="Cancelar Venda"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <ul className="text-sm space-y-2 mb-5 ml-1">
                        {s.items.map((i: any) => (
                          <li key={i.id} className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                            isFoodTheme ? 'hover:bg-zinc-50 text-zinc-700' : `text-zinc-400 hover:bg-zinc-800/40 ${isPetshopTheme ? 'petcare-report-sale-item' : ''}`
                          }`}>
                             <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                               isFoodTheme ? 'bg-zinc-100 text-zinc-700 border border-zinc-200' : 'text-white bg-zinc-800'
                             }`}>{i.quantity}x</span> 
                             <span className={`flex-1 font-medium text-xs md:text-sm ${s.status === 'cancelled' ? 'line-through text-zinc-500' : isFoodTheme ? 'text-zinc-800 font-semibold' : ''}`}>{i.product?.name || 'Item Removido/Desconhecido'}</span>
                             <span className={`font-mono text-xs ${isFoodTheme ? 'text-zinc-500' : 'text-zinc-400'}`}>R$ {(Number(i.priceUnit || 0) * Number(i.quantity || 0)).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                      
                      <div className={`flex items-center justify-between gap-4 pt-4 border-t ${isFoodTheme ? 'border-zinc-100' : 'border-zinc-800/50'}`}>
                        <div className="flex flex-wrap gap-2">
                          {s.payments.map((p: any, idx: number) => (
                            <span key={idx} className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-lg border tracking-wider ${
                              isFoodTheme
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                : `bg-blue-500/10 text-blue-400 border-blue-500/20 ${isPetshopTheme ? 'petcare-report-payment' : ''}`
                            }`}>
                              {p.label || METHOD_DISPLAY[p.method] || p.method} (R$ {Number(p.value || 0).toFixed(2)})
                            </span>
                          ))}
                        </div>
                        {s.status !== 'cancelled' && data.register.status === 'open' && (
                          <button
                            onClick={() => setEditingSale(s)}
                            className="p-2 md:p-1.5 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl md:rounded-lg transition-colors border border-transparent hover:border-blue-500/20 shrink-0"
                            title="Editar Pagamento"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                      </div>

                      {s.status === 'cancelled' && s.cancelReason && (
                        <div className="mt-3 p-3 bg-red-500/5 rounded-xl border border-red-500/10 text-xs text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
                          <strong>Motivo do Cancelamento:</strong> {s.cancelReason}
                          {s.cancelledAt && (
                            <span className="block mt-1 text-[10px] text-zinc-500">
                              Cancelado em: {new Date(s.cancelledAt).toLocaleString('pt-BR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 py-20">
                    <div className="w-24 h-24 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-inner">
                      <Receipt size={40} className="text-zinc-700"/>
                    </div>
                    <p className="font-medium text-zinc-500">Nenhuma transação efetuada nesta sessão.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
        )}
      </div>

      <EditPaymentModal
        isOpen={!!editingSale}
        onClose={() => setEditingSale(null)}
        onSuccess={handlePaymentEdited}
        sale={editingSale}
      />

      {/* ═══ PASSO 2 — Confirmação Final de Fechamento ═══ */}
      {step === 2 && data && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center backdrop-blur-md p-4 animate-in fade-in duration-200 ${
          isFoodTheme ? 'bg-black/60' : 'bg-black/95'
        } ${isPetshopTheme ? 'petcare-report-confirm-theme' : ''}`}>
          <div className={`rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ${
            isFoodTheme 
              ? 'bg-white border border-zinc-200/90 text-zinc-900' 
              : `bg-zinc-950 border border-zinc-800 ${isPetshopTheme ? 'petcare-report-confirm-card' : ''}`
          }`}>

            {/* Header */}
            <div className={`flex items-center justify-between p-6 border-b ${
              isFoodTheme 
                ? 'border-zinc-100 bg-white' 
                : `border-zinc-800 bg-zinc-900/60 ${isPetshopTheme ? 'petcare-report-confirm-header' : ''}`
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isFoodTheme ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  <FileText className={isFoodTheme ? 'text-emerald-700' : isPetshopTheme ? 'text-[var(--pet-pos-action)]' : 'text-red-400'} size={20} />
                </div>
                <div>
                  <h2 className={`text-xl font-black tracking-tight ${isFoodTheme ? 'text-zinc-900' : 'text-white'}`}>Confirmação de Fechamento</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Revise os dados antes de encerrar definitivamente</p>
                </div>
              </div>
              <button onClick={() => setStep(1)} className={`p-2 rounded-full transition-colors ${
                isFoodTheme ? 'hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
              }`}>
                <X size={20} />
              </button>
            </div>

            <div className={`p-5 space-y-4 overflow-y-auto max-h-[80vh] custom-scrollbar ${isPetshopTheme ? 'petcare-report-confirm-content' : ''}`}>

              {/* Informação para operadores comuns: Auditoria Cega */}
              {!canSeeTotals && (
                <div className={`bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3 ${isPetshopTheme ? 'petcare-report-confirm-blind' : ''}`}>
                  <EyeOff className={`${isPetshopTheme ? 'text-[var(--pet-pos-action)]' : 'text-blue-400'} shrink-0`} size={20} />
                  <div>
                    <p className="text-blue-400 font-bold text-sm">Fechamento com Auditoria Cega</p>
                    <p className="text-zinc-400 text-xs mt-0.5">Os valores do turno foram registrados no sistema. A conferência da gaveta será realizada pelo gerente.</p>
                  </div>
                </div>
              )}

              {/* Campo principal — contar dinheiro na gaveta — só aparece para Gerentes */}
              {canSeeTotals && (
                <div className={`rounded-xl p-5 transition-colors border ${
                  isFoodTheme 
                    ? 'bg-zinc-50/80 border-zinc-200/90 focus-within:border-[#047857]' 
                    : `bg-zinc-900 border-zinc-800 focus-within:border-red-500 ${isPetshopTheme ? 'petcare-report-confirm-cash' : ''}`
                }`}>
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${isFoodTheme ? 'text-zinc-600' : 'text-zinc-500'}`}>Valor Físico em Caixa</p>
                  <div className="relative">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-xl ${isFoodTheme ? 'text-zinc-400' : 'text-zinc-500'}`}>R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={closingValue || ''}
                      onChange={e => setClosingValue(parseFloat(e.target.value) || 0)}
                      placeholder="0,00"
                      className={`w-full rounded-xl py-3 pl-14 pr-4 text-2xl font-black transition-colors shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none m-0 ${
                        isFoodTheme 
                          ? 'bg-white border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15' 
                          : `bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-700 focus:outline-none focus:border-red-500 ${isPetshopTheme ? 'petcare-report-confirm-input' : ''}`
                      }`}
                      style={{ WebkitAppearance: 'none', margin: 0 }}
                    />
                  </div>
                </div>
              )}

              {/* Banner de Status */}
              {closingValue > 0 && (() => {
                const diff = closingValue - Number(data.report.expectedDinheiro);
                const bateu = Math.abs(diff) < 0.01;
                const sobra = diff > 0.01;
                return (
                  <div className={`rounded-xl p-4 border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${bateu ? 'bg-emerald-500/10 border-emerald-500/30' : sobra ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'} ${isPetshopTheme ? 'petcare-report-confirm-status' : ''}`}>
                    <div>
                      {bateu ? (
                        <>
                          <p className="text-emerald-400 font-bold text-sm">Sem divergências</p>
                          <p className="text-emerald-400/70 text-xs mt-0.5">O valor físico bate com o sistema.</p>
                        </>
                      ) : sobra ? (
                        <>
                          <p className="text-amber-400 font-bold text-sm">Sobra de R$ {diff.toFixed(2)}</p>
                          <p className="text-amber-400/70 text-xs mt-0.5">O valor físico excede o esperado.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-red-400 font-bold text-sm">Quebra de R$ {Math.abs(diff).toFixed(2)}</p>
                          <p className="text-red-400/70 text-xs mt-0.5">O valor físico está abaixo do esperado.</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Grid: Dinheiro Físico + Digitais */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isPetshopTheme ? 'petcare-report-confirm-grid' : ''}`}>

                {/* Dinheiro Físico */}
                <div className={`rounded-xl p-4 space-y-2.5 border ${
                  isFoodTheme 
                    ? 'bg-zinc-50/80 border-zinc-200/90 text-zinc-800 shadow-xs' 
                    : `bg-zinc-900 border-zinc-800 ${isPetshopTheme ? 'petcare-report-confirm-summary' : ''}`
                }`}>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Dinheiro Físico</p>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Fundo inicial</span>
                    <span className="text-white font-medium">{renderMoney(data.register.openingValue)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Vendas físicas</span>
                    <span className="text-emerald-400 font-medium">{renderMoney(data.report.totalDinheiro, { sign: '+' })}</span>
                  </div>
                  {data.report.totalSuprimentos > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Suprimentos</span>
                      <span className="text-blue-400 font-medium">{renderMoney(data.report.totalSuprimentos, { sign: '+' })}</span>
                    </div>
                  )}
                  {data.report.totalSangrias > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Sangrias</span>
                      <span className="text-red-400 font-medium">{renderMoney(data.report.totalSangrias, { sign: '-' })}</span>
                    </div>
                  )}
                  {canSeeTotals && (
                    <div className="border-t border-zinc-800 pt-2.5 mt-2.5 flex justify-between items-center">
                      <span className="text-zinc-400 text-xs font-bold">Total Esperado</span>
                      <span className="text-white font-bold text-sm">R$ {Number(data.report.expectedDinheiro).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Recebimentos Digitais */}
                <div className={`rounded-xl p-4 space-y-2.5 border ${
                  isFoodTheme 
                    ? 'bg-zinc-50/80 border-zinc-200/90 text-zinc-800 shadow-xs' 
                    : `bg-zinc-900 border-zinc-800 ${isPetshopTheme ? 'petcare-report-confirm-summary petcare-report-confirm-digital' : ''}`
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recebimentos Digitais</p>
                    {hasDigitalAdjustments && (
                      <span className="text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                        Valores Ajustados
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Crédito</span>
                    <div className="text-right">
                      <span className="text-zinc-300 font-medium">{renderMoney(adjustCredit !== '' ? parseFloat(adjustCredit) || 0 : data.report.totalCredito || 0)}</span>
                      {adjustCredit !== '' && canSeeTotals && (
                        <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalCredito || 0).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Débito</span>
                    <div className="text-right">
                      <span className="text-zinc-300 font-medium">{renderMoney(adjustDebit !== '' ? parseFloat(adjustDebit) || 0 : data.report.totalDebito || 0)}</span>
                      {adjustDebit !== '' && canSeeTotals && (
                        <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalDebito || 0).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400">Pix</span>
                    <div className="text-right">
                      <span className="text-zinc-300 font-medium">{renderMoney(adjustPix !== '' ? parseFloat(adjustPix) || 0 : data.report.totalPix || 0)}</span>
                      {adjustPix !== '' && canSeeTotals && (
                        <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(data.report.totalPix || 0).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                  {(data.report.customMethods || []).map((cm: any) => {
                    const customVal = adjustCustom[cm.method] !== undefined ? parseFloat(adjustCustom[cm.method]) || 0 : Number(cm.total || 0);
                    return (
                      <div key={cm.method} className="flex justify-between items-center text-xs">
                        <span className="text-zinc-400">{cm.label}</span>
                        <div className="text-right">
                          <span className="text-zinc-300 font-medium">{renderMoney(customVal)}</span>
                          {adjustCustom[cm.method] !== undefined && canSeeTotals && (
                            <span className="text-[10px] text-zinc-500 block">Sistema: R$ {Number(cm.total || 0).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t border-zinc-800 pt-2.5 mt-2.5 flex justify-between items-center">
                    <span className="text-zinc-400 text-xs font-bold">Total Digital</span>
                    <span className="text-white font-bold text-sm">
                      {renderMoney(computedTotalDigital)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Resumo total - Apenas para Admins */}
              {isAdmin && (
                <div className={`flex justify-between items-center bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 ${isPetshopTheme ? 'petcare-report-confirm-revenue' : ''}`}>
                  <div>
                    <span className="text-zinc-400 text-xs font-bold uppercase block">Faturamento do Turno</span>
                    {hasDigitalAdjustments && (
                      <span className="text-[10px] text-amber-400/80 block">Original do Sistema: R$ {Number(data.report.totalVendas || 0).toFixed(2)}</span>
                    )}
                  </div>
                  <span className="text-emerald-400 font-black text-xl">R$ {computedTotalVendas.toFixed(2)}</span>
                </div>
              )}

              {/* Botões */}
              <div className={`flex gap-3 pt-2 ${isPetshopTheme ? 'petcare-report-confirm-actions' : ''}`}>
                <button
                  onClick={() => setStep(1)}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all text-sm ${
                    isFoodTheme 
                      ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200' 
                      : `bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white ${isPetshopTheme ? 'petcare-report-confirm-back' : ''}`
                  }`}
                >
                  Voltar
                </button>
                <button
                  onClick={handleClose}
                  disabled={submitting}
                  className={`flex-[2] py-3 rounded-xl font-bold disabled:opacity-60 text-white transition-all active:scale-95 flex items-center justify-center gap-2 text-sm ${
                    isFoodTheme 
                      ? 'bg-[#047857] hover:bg-[#065f46]' 
                      : `bg-red-600 hover:bg-red-500 ${isPetshopTheme ? 'petcare-report-confirm-submit' : ''}`
                  }`}
                >
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Encerrar Caixa'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal de Confirmação de Cancelamento de Venda ═══ */}
      {cancelSaleId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
                  <Trash2 className="text-red-400" size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Cancelar Venda</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Esta ação irá estornar o estoque automaticamente</p>
                </div>
              </div>
              <button
                onClick={() => setCancelSaleId(null)}
                className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-zinc-400 text-xs font-semibold uppercase tracking-wider block mb-2">
                  Motivo do Cancelamento <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Ex: Pedido errado, cliente desistiu, lançamento duplicado..."
                  rows={3}
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                <AlertOctagon size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400/80">
                  O estoque dos produtos será estornado automaticamente e a venda ficará marcada como cancelada no histórico.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-zinc-800">
              <button
                onClick={() => setCancelSaleId(null)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white transition-all text-sm cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={handleCancelSale}
                disabled={cancelling || !cancelReason.trim()}
                className="flex-[2] py-3 rounded-xl font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all active:scale-95 flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {cancelling ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                {cancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Modal de Inserção de PIN do Caixa / Gerente para Revelar Valores ═══ */}
      {unlockModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <KeyRound size={20} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">PIN do Caixa</h3>
                  <p className="text-xs text-zinc-400">Revelar valores e auditoria</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setUnlockModalOpen(false); setCashierPinInput(''); }}
                className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyCashierPin} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2 text-center">
                  Digite o PIN do Caixa ou do Gerente
                </label>
                <input
                  type="password"
                  autoFocus
                  value={cashierPinInput}
                  onChange={e => setCashierPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="••••"
                  className="w-full bg-zinc-950 border-2 border-zinc-800 focus:border-blue-500 rounded-2xl px-4 py-3.5 text-center text-3xl tracking-[0.5em] font-mono font-bold text-white outline-none transition-all"
                  maxLength={8}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setUnlockModalOpen(false); setCashierPinInput(''); }}
                  className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition font-semibold text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={verifyingCashierPin || cashierPinInput.length < 4}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition active:scale-95 text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer"
                >
                  {verifyingCashierPin ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                  Desbloquear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal de Ajuste/Conferência Opcional de Recebimentos Digitais ═══ */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 text-amber-400">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Conferência de Recebimentos Digitais</h3>
                  <p className="text-xs text-zinc-400">Ajuste opcional com base na maquininha / extrato</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-xs text-zinc-300 space-y-1">
                <p className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" />
                  Como funciona a correção de valores?
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  Caso algum pagamento tenha sido lançado no método incorreto pelo operador no PDV, você pode declarar os valores reais apurados. O faturamento e os relatórios do caixa refletirão os valores reais declarados.
                </p>
              </div>

              {/* Cartão de Crédito */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-indigo-400">Cartão de Crédito Real</label>
                  <span className="text-zinc-500">Sistema: R$ {Number(data.report.totalCredito || 0).toFixed(2)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tempCredit}
                    onChange={e => setTempCredit(e.target.value)}
                    placeholder={Number(data.report.totalCredito || 0).toFixed(2)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl py-2.5 pl-10 pr-4 text-white font-bold text-base outline-none transition"
                  />
                </div>
              </div>

              {/* Cartão de Débito */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-sky-400">Cartão de Débito Real</label>
                  <span className="text-zinc-500">Sistema: R$ {Number(data.report.totalDebito || 0).toFixed(2)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tempDebit}
                    onChange={e => setTempDebit(e.target.value)}
                    placeholder={Number(data.report.totalDebito || 0).toFixed(2)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl py-2.5 pl-10 pr-4 text-white font-bold text-base outline-none transition"
                  />
                </div>
              </div>

              {/* Pix */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-teal-400">Transferências (Pix) Real</label>
                  <span className="text-zinc-500">Sistema: R$ {Number(data.report.totalPix || 0).toFixed(2)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={tempPix}
                    onChange={e => setTempPix(e.target.value)}
                    placeholder={Number(data.report.totalPix || 0).toFixed(2)}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl py-2.5 pl-10 pr-4 text-white font-bold text-base outline-none transition"
                  />
                </div>
              </div>

              {/* Métodos Customizados */}
              {(data.report.customMethods || []).map((cm: any) => (
                <div key={cm.method} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-purple-400">{cm.label} Real</label>
                    <span className="text-zinc-500">Sistema: R$ {Number(cm.total || 0).toFixed(2)}</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={tempCustom[cm.method] ?? ''}
                      onChange={e => setTempCustom({ ...tempCustom, [cm.method]: e.target.value })}
                      placeholder={Number(cm.total || 0).toFixed(2)}
                      className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl py-2.5 pl-10 pr-4 text-white font-bold text-base outline-none transition"
                    />
                  </div>
                </div>
              ))}

              {/* Observação / Justificativa */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-zinc-400 block">Justificativa / Observação (Opcional)</label>
                <input
                  value={tempNotes}
                  onChange={e => setTempNotes(e.target.value)}
                  placeholder="Ex: Diferença de R$ 1,50 decorrente de erro na seleção de cartão no PDV"
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none transition placeholder:text-zinc-600"
                />
              </div>

              {/* Card Resumo do Impacto (Calculado em tempo real sobre o rascunho) */}
              {(() => {
                const tempDeclaredCreditVal = tempCredit !== '' ? parseFloat(tempCredit) || 0 : Number(data?.report?.totalCredito || 0);
                const tempDeclaredDebitVal = tempDebit !== '' ? parseFloat(tempDebit) || 0 : Number(data?.report?.totalDebito || 0);
                const tempDeclaredPixVal = tempPix !== '' ? parseFloat(tempPix) || 0 : Number(data?.report?.totalPix || 0);
                const tempDigitalVal = tempDeclaredCreditVal + tempDeclaredDebitVal + tempDeclaredPixVal +
                  (data?.report?.customMethods || []).reduce((acc: number, cm: any) => {
                    const v = tempCustom[cm.method] !== undefined ? parseFloat(tempCustom[cm.method]) || 0 : Number(cm.total || 0);
                    return acc + v;
                  }, 0);
                const tempTotalVendas = Number(data?.report?.totalDinheiro || 0) + tempDigitalVal;
                const tempDiff = tempTotalVendas - Number(data?.report?.totalVendas || 0);

                return (
                  <div className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-2xl space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Faturamento Original (Sistema):</span>
                      <span className="font-semibold text-zinc-200">R$ {Number(data.report.totalVendas || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Variação Total (Diferença):</span>
                      <span className={`font-bold ${tempDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {tempDiff >= 0 ? '+' : ''} R$ {tempDiff.toFixed(2)}
                      </span>
                    </div>
                    <div className="border-t border-zinc-800 pt-2 flex justify-between items-center">
                      <span className="text-sm font-bold text-white">Faturamento Real Declarado:</span>
                      <span className="text-lg font-black text-emerald-400">R$ {tempTotalVendas.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-zinc-800 flex gap-3 shrink-0 bg-zinc-900/40">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setTempCredit('');
                  setTempDebit('');
                  setTempPix('');
                  setTempCustom({});
                  setTempNotes('');
                  toast.info('Valores redefinidos para o padrão original. Clique em Aplicar para confirmar.');
                }}
                className="py-3 px-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60 text-zinc-400 hover:text-white transition font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                title="Limpar rascunho e usar valores originais"
              >
                <RotateCcw size={14} /> Restaurar Padrão
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  setAdjustCredit(tempCredit);
                  setAdjustDebit(tempDebit);
                  setAdjustPix(tempPix);
                  setAdjustCustom(tempCustom);
                  setAdjustNotes(tempNotes);
                  setAdjustModalOpen(false);

                  if (data?.register?.status === 'closed') {
                    await handleAudit({
                      credit: tempCredit,
                      debit: tempDebit,
                      pix: tempPix,
                      custom: tempCustom,
                      notes: tempNotes,
                    });
                  } else {
                    const hasAdj = Boolean(
                      tempCredit !== '' ||
                      tempDebit !== '' ||
                      tempPix !== '' ||
                      Object.keys(tempCustom).length > 0 ||
                      tempNotes.trim()
                    );
                    if (hasAdj) {
                      toast.success('Valores digitais ajustados aplicados com sucesso!');
                    } else {
                      toast.info('Valores originais do sistema restaurados.');
                    }
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold transition active:scale-95 text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                <span>{data?.register?.status === 'closed' ? 'Salvar e Aplicar Ajustes' : 'Aplicar Ajustes'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );

  return createPortal(modalBody, (isFoodTheme && document.getElementById('food-portals')) || document.body);
}
