import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Clock, Loader2, ShieldAlert, Sparkles, User } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Modal, PetAvatar } from './ui';
import type { Appointment } from './types';

interface RescheduleAppointmentModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onSuccess: (updated: Appointment) => void;
  operators?: Array<{ id: string; name: string }>;
}

const QUICK_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '13:00', '13:30', '14:00',
  '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00',
];

const COMMON_RESCHEDULE_REASONS = [
  'Tutor solicitou nova data',
  'Tutor atrasou / pediu outro horário',
  'Imprevisto de transporte / Táxi Dog',
  'Reorganização da agenda interna',
];

const COMPLETED_ADJUST_REASONS = [
  'Correção de data (feriado / lançamento errado)',
  'Ajuste de data solicitado pela administração',
  'Correção de horário retroativo',
];

function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function RescheduleAppointmentModal({
  appointment,
  onClose,
  onSuccess,
  operators = [],
}: RescheduleAppointmentModalProps) {
  const currentStartDate = useMemo(
    () => (appointment?.startsAt ? new Date(appointment.startsAt) : new Date()),
    [appointment?.startsAt],
  );
  const currentEndDate = useMemo(
    () => (appointment?.endsAt ? new Date(appointment.endsAt) : new Date()),
    [appointment?.endsAt],
  );

  const defaultDurationMinutes = useMemo(() => {
    if (!appointment) return 60;
    const serviceTotal = (appointment.services || [])
      .filter(s => !s.comboParentId)
      .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    if (serviceTotal > 0) return serviceTotal;
    const diffMs = currentEndDate.getTime() - currentStartDate.getTime();
    return diffMs > 0 ? Math.round(diffMs / 60_000) : 60;
  }, [appointment, currentStartDate, currentEndDate]);

  const isCompleted = appointment?.status === 'delivered';

  const [confirmedCompletedAlert, setConfirmedCompletedAlert] = useState(false);
  const [syncCommissionDate, setSyncCommissionDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatDateForInput(currentStartDate));
  const [selectedTime, setSelectedTime] = useState(() => {
    const h = String(currentStartDate.getHours()).padStart(2, '0');
    const m = String(currentStartDate.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  });
  const [selectedProfId, setSelectedProfId] = useState(() => appointment?.professionalId || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    const start = new Date(appointment.startsAt);
    const h = String(start.getHours()).padStart(2, '0');
    const m = String(start.getMinutes()).padStart(2, '0');
    setConfirmedCompletedAlert(false);
    setSyncCommissionDate(false);
    setSelectedDate(formatDateForInput(start));
    setSelectedTime(`${h}:${m}`);
    setSelectedProfId(appointment.professionalId || '');
    setReason(appointment.status === 'delivered' ? 'Correção de data (feriado / lançamento errado)' : '');
  }, [appointment?.id, appointment?.startsAt, appointment?.status, appointment?.professionalId]);

  const dateShortcuts = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(today.getDate() + 2);
    const in3Days = new Date();
    in3Days.setDate(today.getDate() + 3);

    if (isCompleted) {
      return [
        { label: 'Ontem', sub: yesterday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), dateStr: formatDateForInput(yesterday) },
        { label: 'Hoje', sub: today.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), dateStr: formatDateForInput(today) },
        {
          label: dayAfter.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
          sub: dayAfter.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          dateStr: formatDateForInput(dayAfter),
        },
        {
          label: tomorrow.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
          sub: tomorrow.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          dateStr: formatDateForInput(tomorrow),
        },
      ];
    }

    return [
      { label: 'Hoje', sub: '', dateStr: formatDateForInput(today) },
      { label: 'Amanhã', sub: '', dateStr: formatDateForInput(tomorrow) },
      {
        label: dayAfter.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        sub: dayAfter.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        dateStr: formatDateForInput(dayAfter),
      },
      {
        label: in3Days.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        sub: in3Days.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        dateStr: formatDateForInput(in3Days),
      },
    ];
  }, [isCompleted]);

  const newSchedulePreview = useMemo(() => {
    if (!selectedDate || !selectedTime) return null;
    try {
      const [h, m] = selectedTime.split(':').map(Number);
      const [year, month, day] = selectedDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, h, m, 0, 0);
      if (Number.isNaN(start.getTime())) return null;
      const end = new Date(start.getTime() + defaultDurationMinutes * 60_000);
      return { start, end };
    } catch {
      return null;
    }
  }, [selectedDate, selectedTime, defaultDurationMinutes]);

  if (!appointment) return null;

  const submitReschedule = async () => {
    if (!newSchedulePreview) {
      toast.error('Selecione uma data e horário válidos.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        startsAt: newSchedulePreview.start.toISOString(),
        endsAt: newSchedulePreview.end.toISOString(),
        professionalId: selectedProfId ? selectedProfId : null,
        rescheduleReason: reason.trim() || undefined,
        ...(isCompleted
          ? {
              allowCompletedReschedule: true,
              syncCommissionDate,
            }
          : {}),
      };

      const { data: updated } = await api.patch(`/petshop/appointments/${appointment.id}`, payload);

      toast.success(
        isCompleted
          ? `Data de ${appointment.pet?.name} ajustada para ${newSchedulePreview.start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${selectedTime}!`
          : `Atendimento de ${appointment.pet?.name} reagendado para ${newSchedulePreview.start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${selectedTime}!`,
      );
      onSuccess(updated);
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Erro ao reagendar atendimento.';
      if (msg.includes('Identifique') || msg.includes('PIN') || error.response?.status === 403) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('petshop-require-pin', {
              detail: {
                onSuccess: () => {
                  void submitReschedule();
                },
              },
            }),
          );
        }
        return;
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const isCurrentSchedule =
    selectedDate === formatDateForInput(currentStartDate) &&
    selectedTime === `${String(currentStartDate.getHours()).padStart(2, '0')}:${String(currentStartDate.getMinutes()).padStart(2, '0')}`;

  if (isCompleted && !confirmedCompletedAlert) {
    return (
      <Modal title="Ajustar Data — Atendimento Concluído" onClose={onClose} maxWidth="sm:max-w-md">
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-amber-950">
                  Este atendimento já está concluído!
                </h4>
                <p className="mt-1 text-xs font-semibold text-amber-900">
                  Deseja alterar o dia ou horário mesmo assim?
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2.5 text-xs text-zinc-700 space-y-1">
              <p>
                <strong>{appointment.pet?.name}</strong> · Tutor: <strong>{appointment.customer?.name}</strong>
              </p>
              <p className="text-zinc-600">
                Data registrada atualmente:{' '}
                <strong>
                  {currentStartDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às{' '}
                  {currentStartDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </p>
              <p className="text-[11px] text-amber-900 pt-1">
                • O status continuará <strong>Concluído</strong>, sem alterar pagamentos recebidos nem duplicar sessões de pacote.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => setConfirmedCompletedAlert(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 text-xs font-bold text-white hover:bg-amber-800 shadow-xs transition cursor-pointer"
            >
              <Calendar size={14} />
              Sim, alterar dia mesmo assim
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={isCompleted ? 'Ajustar Data do Atendimento Concluído' : 'Reagendar Atendimento'}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
    >
      <div className="space-y-4">
        {isCompleted && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-700" />
            <span>
              Modo de correção de data: o atendimento permanecerá <strong>Concluído</strong> e os pagamentos e sessões do pacote continuam preservados.
            </span>
          </div>
        )}

        {/* Card do Atendimento */}
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5">
          <PetAvatar pet={appointment.pet} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-zinc-900 truncate">{appointment.pet?.name}</h4>
              <span className="text-[11px] font-semibold text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
                Duração: {defaultDurationMinutes} min
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5 truncate">
              Tutor: <strong>{appointment.customer?.name}</strong>
              {appointment.customer?.phone && ` · ${appointment.customer.phone}`}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Horário atual:{' '}
              <span className="font-semibold text-zinc-700">
                {currentStartDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às{' '}
                {currentStartDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </p>
          </div>
        </div>

        {/* 1. SELEÇÃO DA NOVA DATA */}
        <div>
          <label className="block text-xs font-bold text-zinc-800 mb-1.5 flex items-center gap-1.5">
            <Calendar size={13} className="text-teal-700" />
            1. Escolha a nova data:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            {dateShortcuts.map(item => {
              const active = selectedDate === item.dateStr;
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    active
                      ? 'border-teal-600 bg-teal-50 text-teal-900 ring-2 ring-teal-500/30 shadow-xs'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <span className="capitalize">{item.label}</span>
                  {item.sub && <span className="text-[10px] font-normal text-zinc-500">{item.sub}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 shrink-0">Ou selecione:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-2xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
            />
          </div>
        </div>

        {/* 2. SELEÇÃO DO NOVO HORÁRIO */}
        <div>
          <label className="block text-xs font-bold text-zinc-800 mb-1.5 flex items-center gap-1.5">
            <Clock size={13} className="text-teal-700" />
            2. Escolha o novo horário:
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
            {QUICK_TIME_SLOTS.map(slot => {
              const active = selectedTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedTime(slot)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer tabular-nums text-center ${
                    active
                      ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-zinc-500 shrink-0">Horário livre:</span>
            <input
              type="time"
              value={selectedTime}
              onChange={e => setSelectedTime(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 shadow-2xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
            />
          </div>
        </div>

        {/* 3. PROFISSIONAL RESPONSÁVEL */}
        <div>
          <label className="block text-xs font-bold text-zinc-800 mb-1.5 flex items-center gap-1.5">
            <User size={13} className="text-teal-700" />
            3. Profissional responsável:
          </label>
          <select
            value={selectedProfId}
            onChange={e => setSelectedProfId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-2xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          >
            <option value="">A definir / Qualquer profissional disponível</option>
            {operators.map(op => (
              <option key={op.id} value={op.id}>
                {op.name}
              </option>
            ))}
          </select>
        </div>

        {isCompleted && (
          <label className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={syncCommissionDate}
              onChange={e => setSyncCommissionDate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
            />
            <span>
              Atualizar também a data das <strong>comissões pendentes</strong> deste atendimento para o novo dia escolhido (comissões já aprovadas/pagas não são alteradas).
            </span>
          </label>
        )}

        {/* 4. MOTIVO */}
        <div>
          <label className="block text-xs font-semibold text-zinc-600 mb-1">
            {isCompleted ? 'Motivo do ajuste:' : 'Motivo do reagendamento (opcional):'}
          </label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {(isCompleted ? COMPLETED_ADJUST_REASONS : COMMON_RESCHEDULE_REASONS).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="text-[10px] font-medium rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={isCompleted ? 'Ex: Lançado no feriado por engano...' : 'Ex: Tutor pediu para remarcar para depois do almoço...'}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
          />
        </div>

        {/* PREVIEW DO NOVO HORÁRIO */}
        {newSchedulePreview && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-700" />
              <div>
                <strong className="text-xs font-bold text-emerald-950 block">
                  {isCompleted ? 'Nova data do atendimento:' : 'Novo horário agendado:'}
                </strong>
                <span className="text-[11px] text-emerald-800 capitalize">
                  {newSchedulePreview.start.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                  })}{' '}
                  · {selectedTime} às{' '}
                  {newSchedulePreview.end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            {isCurrentSchedule && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                Horário inalterado
              </span>
            )}
          </div>
        )}

        {/* BOTÕES DE AÇÃO */}
        <div className="pt-2 border-t border-zinc-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition cursor-pointer disabled:opacity-50"
          >
            Voltar
          </button>

          <button
            type="button"
            disabled={saving || !newSchedulePreview || isCurrentSchedule}
            onClick={() => void submitReschedule()}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            {isCompleted ? 'Salvar Ajuste de Data' : 'Confirmar Reagendamento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
