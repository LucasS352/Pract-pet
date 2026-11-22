import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Coins, CreditCard, Layers, Loader2, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { CustomerPetPackage, PetService } from './types';
import { money, resolveEffectivePetServicePrice } from './types';
import { inputClass, labelClass, Modal, primaryButton, secondaryButton } from './ui';

export type ExchangeChargeMode = 'none' | 'add_to_package' | 'charge_at_checkout' | 'charge_now';

type SessionExchangeTarget = {
  mode: 'session';
  contractId: string;
  contractName: string;
  contractPaymentStatus?: string;
  appointmentId: string;
  appointmentStatus: string;
  pet?: { id?: string; name?: string; species?: string | null; size?: string | null; coatType?: string | null } | null;
  oldAppointmentServiceId: string;
  oldServiceId: string;
  oldServiceName: string;
  oldServicePrice?: number;
  packageUnitValue?: number;
  existingUnpaidDiffTotal?: number;
  otherPendingTotal?: number;
  currentProfessionalId?: string | null;
};

type CreditExchangeTarget = {
  mode: 'credit';
  contractId: string;
  contractName: string;
  contractPaymentStatus?: string;
  pet?: { id?: string; name?: string; species?: string | null; size?: string | null; coatType?: string | null } | null;
  oldServiceId: string;
  oldServiceName: string;
  availableQuantity: number;
  oldServicePrice?: number;
  packageUnitValue?: number;
};

export type ExchangePackageServiceTarget = SessionExchangeTarget | CreditExchangeTarget;

interface ExchangePackageServiceModalProps {
  target: ExchangePackageServiceTarget | null;
  services: PetService[];
  operators?: Array<{ id: string; name: string; jobTitle?: string | null; active?: boolean }>;
  onClose: () => void;
  onSuccess: (result: {
    appointment?: any;
    contract?: CustomerPetPackage;
    differenceAmount: number;
    chargeMode: ExchangeChargeMode;
    payNow?: boolean;
    totalPendingAfterSwap?: number;
  }) => void;
}

const QUICK_REASONS_SESSION = [
  'Troca solicitada pelo tutor',
  'Lançado errado na venda do pacote',
  'Upgrade para Tosa',
];

const QUICK_REASONS_CREDIT = [
  'Conversão de crédito solicitada pelo tutor',
  'Lançamento incorreto na contratação',
];

function parseMoneyInput(raw: string): number {
  const normalized = String(raw || '').replace(/[^\d.,]/g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function roundMoney(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/** Modal simples e guiado para trocar um serviço reservado ou converter saldo de pacote. */
export function ExchangePackageServiceModal({
  target,
  services,
  operators = [],
  onClose,
  onSuccess,
}: ExchangePackageServiceModalProps) {
  const [newServiceId, setNewServiceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [keepPackageValue, setKeepPackageValue] = useState(false);
  const [replacePreviousDiff, setReplacePreviousDiff] = useState(true);
  const [differenceInput, setDifferenceInput] = useState('0,00');
  const [chargeMode, setChargeMode] = useState<ExchangeChargeMode>('charge_now');
  const [payExistingNow, setPayExistingNow] = useState(false);
  const [responsibleId, setResponsibleId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isPendingPackage = target?.contractPaymentStatus === 'pending';

  const selectableServices = useMemo(() => {
    if (!target) return [];
    return services.filter(s => s.active !== false && s.id !== target.oldServiceId);
  }, [services, target]);

  const selectedNewService = useMemo(
    () => selectableServices.find(s => s.id === newServiceId) || null,
    [selectableServices, newServiceId],
  );

  const oldReferencePrice = useMemo(() => {
    if (!target) return 0;
    const oldSvc = services.find(s => s.id === target.oldServiceId);
    const catalogPrice = oldSvc ? resolveEffectivePetServicePrice(oldSvc, target.pet).price : 0;
    if (catalogPrice > 0) return catalogPrice;
    if (typeof target.oldServicePrice === 'number' && Number.isFinite(target.oldServicePrice) && target.oldServicePrice > 0) {
      return target.oldServicePrice;
    }
    return 0;
  }, [target, services]);

  const packageUnitValue = useMemo(() => {
    if (!target) return 0;
    const raw = Number(target.packageUnitValue || 0);
    return Number.isFinite(raw) && raw > 0 ? roundMoney(raw) : 0;
  }, [target]);

  const nextEffectiveInfo = useMemo(() => {
    if (!selectedNewService || !target) return null;
    return resolveEffectivePetServicePrice(selectedNewService, target.pet);
  }, [selectedNewService, target]);

  const nextServicePrice = nextEffectiveInfo ? roundMoney(nextEffectiveInfo.price) : 0;
  const catalogDelta = useMemo(
    () => (selectedNewService ? roundMoney(nextServicePrice - oldReferencePrice) : 0),
    [selectedNewService, nextServicePrice, oldReferencePrice],
  );
  const packageUnitDelta = useMemo(
    () => (selectedNewService && packageUnitValue > 0 ? roundMoney(nextServicePrice - packageUnitValue) : null),
    [selectedNewService, nextServicePrice, packageUnitValue],
  );

  const suggestedDiff = useMemo(() => {
    if (!selectedNewService || !target) return 0;
    const unitDiff = Math.max(0, catalogDelta);
    const mult = target.mode === 'credit' ? Math.max(1, quantity) : 1;
    return roundMoney(unitDiff * mult);
  }, [selectedNewService, target, catalogDelta, quantity]);

  const existingUnpaidDiffTotal = target?.mode === 'session' ? roundMoney(target.existingUnpaidDiffTotal || 0) : 0;
  const otherPendingTotal = target?.mode === 'session' ? roundMoney(target.otherPendingTotal || 0) : 0;

  useEffect(() => {
    if (!target) return;
    setNewServiceId('');
    setQuantity(1);
    setKeepPackageValue(false);
    setReplacePreviousDiff(true);
    setDifferenceInput('0,00');
    setChargeMode(isPendingPackage ? 'add_to_package' : 'charge_now');
    setPayExistingNow(false);
    setResponsibleId(target.mode === 'session' ? (target.currentProfessionalId || '') : '');
    setReason(target.mode === 'session' ? 'Troca solicitada pelo tutor' : 'Conversão de saldo do pacote');
  }, [target, isPendingPackage]);

  useEffect(() => {
    if (!selectedNewService) {
      setDifferenceInput('0,00');
      return;
    }
    setDifferenceInput(suggestedDiff.toFixed(2).replace('.', ','));
  }, [selectedNewService, suggestedDiff]);

  if (!target) return null;

  const rawTypedDiff = parseMoneyInput(differenceInput);
  const differenceAmount = keepPackageValue ? 0 : rawTypedDiff;
  const shouldReplaceUnpaidFees = target.mode === 'session' && existingUnpaidDiffTotal > 0 && replacePreviousDiff;
  const canSubmit = Boolean(newServiceId) && !saving && (target.mode === 'session' || (quantity >= 1 && quantity <= target.availableQuantity));

  const effectiveChargeMode: ExchangeChargeMode =
    differenceAmount <= 0
      ? 'none'
      : target.mode === 'credit'
        ? (isPendingPackage ? 'add_to_package' : 'none')
        : chargeMode === 'add_to_package' && !isPendingPackage
          ? 'charge_now'
          : chargeMode;

  const remainingPreviousDiff = shouldReplaceUnpaidFees ? 0 : existingUnpaidDiffTotal;
  const addedDirectToAppointment = effectiveChargeMode === 'add_to_package' ? 0 : differenceAmount;
  const finalAppointmentPending = target.mode === 'session'
    ? roundMoney(remainingPreviousDiff + otherPendingTotal + addedDirectToAppointment)
    : 0;

  const wantPayNow = target.mode === 'session' && (
    (differenceAmount > 0 && effectiveChargeMode === 'charge_now') ||
    (differenceAmount === 0 && finalAppointmentPending > 0 && payExistingNow)
  );
  const amountToPayNow = differenceAmount > 0 && effectiveChargeMode === 'charge_now'
    ? finalAppointmentPending
    : wantPayNow
      ? finalAppointmentPending
      : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newServiceId || saving) return;

    if (target.mode === 'credit' && differenceAmount > 0 && !isPendingPackage) {
      toast.error('Para saldo ainda não agendado de pacote já pago, converta sem diferença (R$ 0,00) ou cobre a diferença direto no agendamento da sessão.');
      return;
    }

    setSaving(true);
    try {
      if (target.mode === 'session') {
        const { data } = await api.post<{ appointment: any; contract: CustomerPetPackage }>(
          `/petshop/packages/contracts/${target.contractId}/exchange-session-service`,
          {
            appointmentId: target.appointmentId,
            oldAppointmentServiceId: target.oldAppointmentServiceId,
            oldServiceId: target.oldServiceId,
            newServiceId,
            differenceAmount,
            chargeMode: effectiveChargeMode,
            keepPackageValue,
            replaceUnpaidUpgradeFees: shouldReplaceUnpaidFees,
            reason: reason.trim() || 'Troca de serviço no pacote',
            ...(responsibleId ? { commissionRecipientId: responsibleId, professionalId: responsibleId } : {}),
          },
        );
        toast.success(`Serviço alterado para ${selectedNewService?.name || 'novo serviço'}!`);
        onSuccess({
          appointment: data.appointment,
          contract: data.contract,
          differenceAmount,
          chargeMode: effectiveChargeMode,
          payNow: wantPayNow && finalAppointmentPending > 0,
          totalPendingAfterSwap: finalAppointmentPending,
        });
      } else {
        const { data } = await api.post<CustomerPetPackage>(
          `/petshop/packages/contracts/${target.contractId}/exchange-credit`,
          {
            oldServiceId: target.oldServiceId,
            newServiceId,
            quantity,
            differenceAmount,
            chargeMode: effectiveChargeMode === 'add_to_package' ? 'add_to_package' : 'none',
            reason: reason.trim() || 'Conversão de saldo do pacote',
          },
        );
        toast.success(`Saldo convertido para ${selectedNewService?.name || 'novo serviço'}!`);
        onSuccess({
          contract: data,
          differenceAmount,
          chargeMode: effectiveChargeMode,
        });
      }
      onClose();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível concluir a troca de serviço.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={target.mode === 'session' ? 'Trocar serviço do pacote' : 'Converter saldo livre do pacote'}
      subtitle={`${target.pet?.name ? `${target.pet.name} · ` : ''}${target.contractName}`}
      onClose={() => { if (!saving) onClose(); }}
      maxWidth="sm:max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* De -> Para */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Serviço atual no pacote</span>
              <p className="text-sm font-bold text-zinc-900">{target.oldServiceName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                {oldReferencePrice > 0 && (
                  <span className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-zinc-700 tabular-nums">
                    Valor avulso: {money(oldReferencePrice)}
                  </span>
                )}
                {packageUnitValue > 0 && (
                  <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 font-semibold text-teal-800 tabular-nums">
                    Sessão no pacote: {money(packageUnitValue)}
                  </span>
                )}
                {existingUnpaidDiffTotal > 0 && (
                  <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 tabular-nums">
                    Diferença anterior pendente: {money(existingUnpaidDiffTotal)}
                  </span>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
              {target.mode === 'session' ? '1 sessão reservada' : `${target.availableQuantity} sessão(ões) livre(s)`}
            </span>
          </div>

          {target.mode === 'credit' && target.availableQuantity > 1 && (
            <label className="block">
              <span className={labelClass}>Quantas sessões converter?</span>
              <input
                type="number"
                min={1}
                max={target.availableQuantity}
                value={quantity}
                onChange={e => setQuantity(Math.min(target.availableQuantity, Math.max(1, Number(e.target.value) || 1)))}
                className={inputClass}
              />
            </label>
          )}

          <label className="block">
            <span className={labelClass}>Novo serviço desejado *</span>
            <select
              required
              value={newServiceId}
              onChange={e => setNewServiceId(e.target.value)}
              className={inputClass}
            >
              <option value="">Escolha o novo serviço...</option>
              {selectableServices.map(svc => {
                const eff = resolveEffectivePetServicePrice(svc, target.pet);
                return (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} · {money(eff.price)} ({eff.duration} min)
                  </option>
                );
              })}
            </select>
          </label>

          {target.mode === 'session' && selectedNewService && (
            <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-900">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-teal-700" />
              <span>
                As etapas da Agenda serão atualizadas automaticamente para <strong>{selectedNewService.name}</strong> e o histórico de sessões anteriores continuará intacto.
              </span>
            </div>
          )}
        </div>

        {/* Acerto de valor transparente */}
        {selectedNewService && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 space-y-3">
            {/* Comparativo claro de preços e diferença */}
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-amber-200/70 bg-white p-2.5 text-xs">
              <div>
                <span className="block text-[10px] font-semibold uppercase text-zinc-500">Serviço atual</span>
                <strong className="text-sm font-bold text-zinc-800 tabular-nums">
                  {money(oldReferencePrice)}
                </strong>
                {packageUnitValue > 0 && (
                  <span className="block text-[10px] text-teal-700 tabular-nums">
                    Pacote: {money(packageUnitValue)}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase text-zinc-500">Novo serviço</span>
                <strong className="text-sm font-bold text-zinc-900 tabular-nums">
                  {money(nextServicePrice)}
                </strong>
                {target.mode === 'credit' && quantity > 1 && (
                  <span className="block text-[10px] text-zinc-500 tabular-nums">× {quantity} sessões</span>
                )}
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-semibold uppercase text-zinc-500">Diferença</span>
                <strong
                  className={`text-sm font-bold tabular-nums ${
                    catalogDelta > 0 ? 'text-amber-700' : catalogDelta < 0 ? 'text-sky-700' : 'text-zinc-700'
                  }`}
                >
                  {catalogDelta > 0
                    ? `+${money(catalogDelta)}`
                    : catalogDelta < 0
                      ? `-${money(Math.abs(catalogDelta))}`
                      : 'R$ 0,00'}
                </strong>
                <span className="block text-[10px] text-zinc-500">
                  {catalogDelta > 0 ? 'Serviço maior' : catalogDelta < 0 ? 'Mais barato' : 'Mesmo valor'}
                </span>
              </div>
            </div>

            {packageUnitDelta !== null && packageUnitDelta !== catalogDelta && (
              <p className="text-[11px] text-zinc-600 px-0.5">
                Diferença calculada sobre o valor unitário do pacote ({money(packageUnitValue)}):{' '}
                <strong className="text-zinc-900 tabular-nums">
                  {packageUnitDelta >= 0 ? `+${money(packageUnitDelta)}` : `-${money(Math.abs(packageUnitDelta))}`}
                </strong>
              </p>
            )}

            {/* Checkbox claro para manter o valor atual do pacote */}
            <label
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                keepPackageValue
                  ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-500'
                  : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              <input
                type="checkbox"
                checked={keepPackageValue}
                onChange={e => setKeepPackageValue(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck size={14} className={keepPackageValue ? 'text-emerald-700' : 'text-zinc-500'} />
                  Manter o valor atual do pacote (sem cobrar diferença — R$ 0,00)
                </span>
                <span className="block text-[11px] text-zinc-600 mt-0.5">
                  Faz a troca mantendo a cobertura do pacote sem adicionar diferença extra.
                </span>
              </span>
            </label>

            {/* Controle de diferença editável quando NÃO está mantendo valor do pacote */}
            {!keepPackageValue && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                    <Coins size={15} className="text-amber-700" />
                    <span>Ajustar valor da diferença a cobrar (R$)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[140px] flex-1">
                    <input
                      inputMode="decimal"
                      aria-label="Diferença de valor em reais"
                      value={differenceInput}
                      onChange={e => setDifferenceInput(e.target.value)}
                      placeholder="0,00"
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDifferenceInput('0,00')}
                    className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    Zerar (R$ 0,00)
                  </button>
                  {suggestedDiff > 0 && (
                    <button
                      type="button"
                      onClick={() => setDifferenceInput(suggestedDiff.toFixed(2).replace('.', ','))}
                      className="min-h-11 rounded-lg border border-amber-300 bg-amber-100/80 px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100 cursor-pointer"
                    >
                      Dif. serviços (+{money(suggestedDiff)})
                    </button>
                  )}
                  {packageUnitDelta !== null && packageUnitDelta > 0 && packageUnitDelta !== suggestedDiff && (
                    <button
                      type="button"
                      onClick={() => setDifferenceInput((packageUnitDelta * (target.mode === 'credit' ? quantity : 1)).toFixed(2).replace('.', ','))}
                      className="min-h-11 rounded-lg border border-teal-300 bg-teal-50 px-3 text-xs font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
                    >
                      Sobre pacote (+{money(packageUnitDelta * (target.mode === 'credit' ? quantity : 1))})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Checkbox se já existe diferença anterior não paga neste atendimento */}
            {target.mode === 'session' && existingUnpaidDiffTotal > 0 && (
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replacePreviousDiff}
                  onChange={e => setReplacePreviousDiff(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                />
                <span>
                  {keepPackageValue
                    ? `Remover também a diferença anterior não paga (${money(existingUnpaidDiffTotal)}) para voltar ao valor do pacote`
                    : `Substituir a diferença anterior não paga (${money(existingUnpaidDiffTotal)}) em vez de somar`}
                </span>
              </label>
            )}

            {/* Quadro "Quanto vai ficar após a troca" */}
            <div
              className={`rounded-xl border px-3 py-2.5 text-xs ${
                (target.mode === 'session' ? finalAppointmentPending : differenceAmount) > 0
                  ? 'border-teal-300 bg-teal-50/70 text-teal-950'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-950'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {target.mode === 'session' ? 'Valor que vai ficar neste atendimento:' : 'Valor ajustado desta conversão:'}
                </span>
                <strong className="text-base font-extrabold tabular-nums">
                  {target.mode === 'session'
                    ? effectiveChargeMode === 'add_to_package'
                      ? `${money(finalAppointmentPending)} no atendimento (+${money(differenceAmount)} no pacote)`
                      : finalAppointmentPending > 0
                        ? money(finalAppointmentPending)
                        : 'R$ 0,00 (coberto pelo pacote)'
                    : differenceAmount > 0
                      ? `+${money(differenceAmount)} no contrato`
                      : 'R$ 0,00 (coberto pelo pacote)'}
                </strong>
              </div>
              {target.mode === 'session' && (remainingPreviousDiff > 0 || otherPendingTotal > 0) && (
                <p className="mt-1 text-[11px] opacity-85">
                  Composição:{' '}
                  {[
                    differenceAmount > 0 ? `troca ${money(differenceAmount)}` : null,
                    remainingPreviousDiff > 0 ? `diferença anterior ${money(remainingPreviousDiff)}` : null,
                    otherPendingTotal > 0 ? `outros adicionais/táxi ${money(otherPendingTotal)}` : null,
                  ].filter(Boolean).join(' + ') || 'somente pacote'}
                </p>
              )}
            </div>

            {/* Escolha de cobrança / Pagar agora */}
            {differenceAmount > 0 && target.mode === 'session' && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-zinc-800">Como deseja cobrar o valor de {money(finalAppointmentPending > 0 ? finalAppointmentPending : differenceAmount)}?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setChargeMode('charge_now')}
                    className={`flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition cursor-pointer ${
                      effectiveChargeMode === 'charge_now'
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600 text-teal-950'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <CreditCard size={15} className="mt-0.5 shrink-0 text-teal-700" />
                    <span>
                      <strong className="block">Pagar / Cobrar agora</strong>
                      <span className="text-[11px] text-zinc-500">Abre o pagamento na hora (Pix/Cartão/Dinheiro)</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChargeMode('charge_at_checkout')}
                    className={`flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition cursor-pointer ${
                      effectiveChargeMode === 'charge_at_checkout'
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600 text-teal-950'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <ArrowRight size={15} className="mt-0.5 shrink-0 text-teal-700" />
                    <span>
                      <strong className="block">Cobrar na saída</strong>
                      <span className="text-[11px] text-zinc-500">Fica pendente na Agenda para cobrar ao finalizar</span>
                    </span>
                  </button>

                  {isPendingPackage && (
                    <button
                      type="button"
                      onClick={() => setChargeMode('add_to_package')}
                      className={`sm:col-span-2 flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition cursor-pointer ${
                        effectiveChargeMode === 'add_to_package'
                          ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600 text-emerald-950'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <Layers size={15} className="mt-0.5 shrink-0 text-emerald-700" />
                      <span>
                        <strong className="block">Cobrar junto com o pacote (Pacote ainda pendente)</strong>
                        <span className="text-[11px] text-zinc-600">Soma +{money(differenceAmount)} direto no contrato e na comanda do pacote</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quando diferença desta troca é R$ 0,00 mas ainda existe pendente no atendimento, oferecer Pagar agora */}
            {differenceAmount === 0 && target.mode === 'session' && finalAppointmentPending > 0 && (
              <label
                className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                  payExistingNow
                    ? 'border-teal-600 bg-teal-50 text-teal-950 ring-1 ring-teal-600'
                    : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={payExistingNow}
                  onChange={e => setPayExistingNow(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                />
                <CreditCard size={15} className="shrink-0 text-teal-700" />
                <span className="font-semibold">
                  Pagar agora o saldo pendente deste atendimento ({money(finalAppointmentPending)})
                </span>
              </label>
            )}

            {differenceAmount > 0 && target.mode === 'credit' && !isPendingPackage && (
              <p className="rounded-lg border border-amber-300 bg-amber-100/70 px-3 py-2 text-xs text-amber-950">
                Este pacote já está pago. Para saldo livre ainda não agendado, mantenha o valor atual do pacote (<strong>R$ 0,00</strong>) ou agende a sessão na Agenda e troque por lá com <strong>Pagar agora</strong>.
              </p>
            )}

            {differenceAmount > 0 && target.mode === 'credit' && isPendingPackage && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                Como este pacote ainda está <strong>pendente de pagamento</strong>, os <strong>+{money(differenceAmount)}</strong> serão somados ao valor total do contrato.
              </p>
            )}
          </div>
        )}

        {/* Profissional & Motivo */}
        {target.mode === 'session' && operators.length > 0 && (
          <label className="block">
            <span className={`${labelClass} flex items-center gap-1`}>
              <UserRound size={13} className="text-teal-700" />
              Quem fará o novo serviço? (opcional — também pode apontar depois nas etapas)
            </span>
            <select
              value={responsibleId}
              onChange={e => setResponsibleId(e.target.value)}
              className={inputClass}
            >
              <option value="">Manter / Definir depois nas etapas</option>
              {operators.filter(op => op.active !== false).map(op => (
                <option key={op.id} value={op.id}>
                  {op.name}{op.jobTitle ? ` · ${op.jobTitle}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <label className={labelClass}>Motivo da troca</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(target.mode === 'session' ? QUICK_REASONS_SESSION : QUICK_REASONS_CREDIT).map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                  reason === preset
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={300}
            placeholder="Descreva o motivo..."
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3">
          <button type="button" disabled={saving} onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={!canSubmit} className={`${primaryButton} inline-flex items-center gap-1.5`}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : wantPayNow && amountToPayNow > 0 ? <CreditCard size={15} /> : <Check size={15} />}
            <span>
              {saving
                ? 'Aplicando troca...'
                : wantPayNow && amountToPayNow > 0
                  ? `Confirmar troca e pagar ${money(amountToPayNow)}`
                  : 'Confirmar troca'}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
