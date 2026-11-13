import { useState } from 'react';
import { AlertCircle, AlertTriangle, Calendar, Check, Clock, Loader2, PackageCheck, UserX, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Modal, PetAvatar } from './ui';
import type { Appointment } from './types';

interface CancelAppointmentModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onSuccess: (updated: Appointment) => void;
}

const COMMON_CANCEL_REASONS = [
  'Cliente solicitou cancelamento',
  'Tutor não compareceu (No-Show)',
  'Imprevisto de transporte / Táxi Dog',
  'Saúde do pet / Imprevisto do tutor',
  'Imprevisto interno na loja / remarcado',
  'Outro motivo',
];

export function CancelAppointmentModal({ appointment, onClose, onSuccess }: CancelAppointmentModalProps) {
  const [selectedReason, setSelectedReason] = useState(COMMON_CANCEL_REASONS[0]);
  const [customNotes, setCustomNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!appointment) return null;

  const hasPackageService = appointment.services?.some(
    s => s.coverageStatus === 'reserved' || s.coverageStatus === 'consumed' || Boolean(s.customerPackageId),
  );

  const formattedDate = new Date(appointment.startsAt).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const startTime = new Date(appointment.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const endTime = new Date(appointment.endsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const handleConfirm = async (isNoShow = false) => {
    setSaving(true);
    try {
      const finalReason = isNoShow
        ? 'Não compareceu (No-Show)' + (customNotes.trim() ? ` · ${customNotes.trim()}` : '')
        : selectedReason === 'Outro motivo'
          ? (customNotes.trim() || 'Cancelado sem motivo detalhado')
          : `${selectedReason}${customNotes.trim() ? ` (${customNotes.trim()})` : ''}`;

      const targetStatus = isNoShow ? 'no_show' : 'cancelled';

      const { data: updated } = await api.patch(`/petshop/appointments/${appointment.id}/status`, {
        status: targetStatus,
        cancelReason: finalReason,
        stageNotes: finalReason,
      });

      toast.success(
        isNoShow
          ? `Agendamento de ${appointment.pet?.name} marcado como Não Compareceu (No-Show).`
          : `Agendamento de ${appointment.pet?.name} cancelado com sucesso.`,
      );
      onSuccess(updated);
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Erro ao cancelar agendamento.';
      if (msg.includes('Identifique o colaborador') || msg.includes('PIN') || error.response?.status === 403) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('petshop-require-pin', {
              detail: {
                onSuccess: () => {
                  void handleConfirm();
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

  return (
    <Modal title="Cancelar Agendamento" onClose={onClose} maxWidth="sm:max-w-lg">
      <div className="space-y-4">
        {/* Resumo do Pet e Horário */}
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5">
          <PetAvatar pet={appointment.pet} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-zinc-900 truncate">{appointment.pet?.name}</h4>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
                <Clock size={11} className="text-zinc-400" />
                {startTime} às {endTime}
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5 truncate">
              Tutor: <strong>{appointment.customer?.name}</strong>
              {appointment.customer?.phone && ` · ${appointment.customer.phone}`}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">
              {formattedDate} · {appointment.services.map(s => s.nameSnapshot).join(', ')}
            </p>
          </div>
        </div>

        {/* Alerta de Estorno de Pacote */}
        {hasPackageService && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3 flex items-start gap-2.5 text-xs text-teal-900">
            <PackageCheck size={18} className="text-teal-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-teal-950 block">Sessão de Pacote Vinculada</strong>
              <p className="text-teal-800 text-[11px] mt-0.5 leading-relaxed">
                Este atendimento possui serviços cobertos por pacote. Ao confirmar o cancelamento, a sessão reservada voltará <strong>automaticamente para o saldo do cliente</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Seleção do Motivo */}
        <div>
          <label className="block text-xs font-bold text-zinc-700 mb-2">
            Motivo do cancelamento:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {COMMON_CANCEL_REASONS.map(reason => {
              const active = selectedReason === reason;
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(reason)}
                  className={`flex items-center justify-between text-left px-3 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                    active
                      ? 'border-rose-300 bg-rose-50 text-rose-900 font-bold shadow-2xs'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <span className="truncate">{reason}</span>
                  {active && <Check size={13} className="text-rose-600 shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Observação Adicional */}
        <div>
          <label className="block text-xs font-semibold text-zinc-600 mb-1">
            Observações adicionais (opcional):
          </label>
          <textarea
            value={customNotes}
            onChange={e => setCustomNotes(e.target.value)}
            placeholder="Ex: Tutor ligou pedindo cancelamento por motivo de viagem..."
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-800 placeholder-zinc-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </div>

        {/* Ações */}
        <div className="pt-2 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition cursor-pointer disabled:opacity-50"
          >
            Voltar
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleConfirm(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer disabled:opacity-50"
              title="Marcar que o cliente não compareceu"
            >
              <UserX size={14} className="text-amber-700" />
              Não Compareceu (No-Show)
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleConfirm(false)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Confirmar Cancelamento
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
