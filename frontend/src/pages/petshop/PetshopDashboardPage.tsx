import { buildWhatsAppMessage } from './appointment-media';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Clock3,
  ExternalLink,
  Layers,
  Loader2,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Package,
  PawPrint,
  Play,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  UserCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { usePetshopContext } from '@/layouts/PetshopLayout';
import { resolveAppointmentStages, type Appointment } from './types';
import { Modal, PetAvatar, PetHeroShowcase } from './ui';
import { PhotoUploadField } from './PhotoUploadField';
import { TaxiDogWidget } from './TaxiDogWidget';
import { CancelAppointmentModal } from './CancelAppointmentModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { getFullUrl } from '@/lib/getFullUrl';

type Overview = {
  metrics: {
    pets: number;
    tutors: number;
    products?: number;
    services?: number;
    today: number;
    inProgress: number;
    vaccinesDue: number;
  };
  nextAppointments: Appointment[];
};

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  ready: {
    label: '✓ Pronto p/ busca',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  bathing: {
    label: 'Em atendimento',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  grooming: {
    label: 'Em atendimento',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  finishing: {
    label: 'Em atendimento',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  checked_in: {
    label: 'Em atendimento',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  requested: {
    label: 'Aguardando confirmação',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  scheduled: {
    label: '✓ Confirmado',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  confirmed: {
    label: '✓ Confirmado',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  delivered: {
    label: '✓ Concluído',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  cancelled: {
    label: 'Cancelado',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  no_show: {
    label: 'Não compareceu',
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  },
};

const activeStatuses = new Set(['requested', 'scheduled', 'confirmed', 'checked_in', 'bathing', 'grooming', 'finishing', 'ready']);
const productionStatuses = new Set(['checked_in', 'bathing', 'grooming', 'finishing']);

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function time(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value;
  }
}

function localAppointmentDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

function getPetSpeciesSize(pet: any): string {
  if (!pet) return 'Pet';
  if (pet.species === 'cat') return 'Gato';
  const sizeMap: Record<string, string> = {
    mini: 'Mini',
    small: 'Pequeno',
    medium: 'Médio',
    large: 'Grande',
    giant: 'Gigante',
  };
  const size = sizeMap[pet.size || ''] || 'Médio';
  return `Cão (${size})`;
}

function getElapsedMinutes(item: Appointment): number {
  try {
    const refDate = item.checkedInAt || (item as any).updatedAt || item.startsAt;
    const elapsed = Math.floor((Date.now() - new Date(refDate).getTime()) / 60000);
    return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  } catch {
    return 0;
  }
}

export default function PetshopDashboardPage() {
  const { isRestrictedStaff, operator, isOperatorAccount, openOperatorModal } = usePetshopContext();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const loadRequest = useRef(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string>('');

  // Modal de Foto e Etapa Rápida
  const [stageModalItem, setStageModalItem] = useState<Appointment | null>(null);
  const [stageForm, setStageForm] = useState({
    status: '',
    stagePhotoUrl: '',
    stageNotes: '',
    notifyTutor: false, // Desflegado por padrão conforme solicitado
  });
  const [savingStage, setSavingStage] = useState(false);

  const [pendingReservations, setPendingReservations] = useState<Appointment[]>([]);
  const [operators, setOperators] = useState<any[]>([]);

  // Modais de Cancelamento e Reagendamento Fácil
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++loadRequest.current;
    setError('');
    setLoading(true);
    try {
      const range = todayRange();
      const [overviewResponse, pendingResponse, appointmentsResponse, operatorsResponse] = await Promise.all([
        api.get<Overview>('/petshop/overview', { signal }),
        api.get<Appointment[]>('/petshop/pending-reservations', { signal }),
        api.get<Appointment[]>('/petshop/appointments', { params: range, signal }),
        api.get('/operators', { signal }).catch(() => ({ data: [] })),
      ]);
      if (signal?.aborted || request !== loadRequest.current) return;
      setOverview(overviewResponse.data);
      setPendingReservations(pendingResponse.data || []);
      setAppointments(appointmentsResponse.data || []);
      setOperators(Array.isArray(operatorsResponse.data) ? operatorsResponse.data : []);
    } catch (requestError: any) {
      if (!signal?.aborted && request === loadRequest.current && requestError?.code !== 'ERR_CANCELED') {
        setError(requestError?.response?.data?.message || 'Não foi possível carregar a operação de hoje.');
      }
    } finally {
      if (!signal?.aborted && request === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const [, refreshClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => refreshClock(n => n + 1), 30000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  const activeAppointments = useMemo(
    () => appointments.filter(item => activeStatuses.has(item.status)),
    [appointments]
  );
  const inProduction = useMemo(
    () => activeAppointments.filter(item => productionStatuses.has(item.status)),
    [activeAppointments]
  );
  const ready = useMemo(
    () => activeAppointments.filter(item => item.status === 'ready'),
    [activeAppointments]
  );
  const requested = useMemo(
    () => pendingReservations,
    [pendingReservations]
  );
  const agendaCount = useMemo(
    () => appointments.filter(item => !['cancelled', 'no_show'].includes(item.status)).length,
    [appointments]
  );

  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter(item => ['scheduled', 'confirmed', 'requested', 'checked_in'].includes(item.status))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [appointments]);

  const rawDateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);

  // Ação rápida de avanço de status
  const changeStatus = async (item: Appointment, newStatus: string) => {
    if (isOperatorAccount && !operator) {
      openOperatorModal(() => {
        void changeStatus(item, newStatus);
      });
      return;
    }

    setUpdatingId(item.id);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${item.id}/status`, {
        status: newStatus,
      });
      setAppointments(curr => curr.map(row => (row.id === item.id ? updated : row)));
      setPendingReservations(curr => curr.filter(row => row.id !== item.id));
      const label = STATUS_CONFIG[newStatus]?.label || newStatus;
      toast.success(`${item.pet.name} atualizado(a) para "${label}".`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Não foi possível atualizar o atendimento.';
      if (msg.includes('Identifique o colaborador') || msg.includes('PIN') || err.response?.status === 403) {
        openOperatorModal(() => {
          void changeStatus(item, newStatus);
        });
        return;
      }
      toast.error(msg);
    } finally {
      setUpdatingId('');
    }
  };

  const nextCareStage = (item: Appointment) => {
    const stages = resolveAppointmentStages(item);
    return stages[stages.indexOf(item.status) + 1] || null;
  };

  const openStageModal = (item: Appointment) => {
    setStageModalItem(item);
    setStageForm({
      status: item.status === 'scheduled' || item.status === 'confirmed' || item.status === 'requested' ? 'bathing' : item.status,
      stagePhotoUrl: item.stagePhotoUrl || '',
      stageNotes: item.stageNotes || '',
      notifyTutor: false, // Desmarcado por padrão
    });
  };

  const notifyTutorDirect = async (item: Appointment) => {
    try {
      const cleanPhone = (item.customer?.phone || '').replace(/\D/g, '');
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const msg = buildWhatsAppMessage(item, null, item.stageNotes);
      window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
      toast.success(`Aviso WhatsApp preparado para ${item.customer.name}!`);
    } catch {
      toast.error('Não foi possível preparar o aviso no WhatsApp.');
    }
  };

  const submitStageModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!stageModalItem) return;

    if (isOperatorAccount && !operator) {
      openOperatorModal(() => {
        void submitStageModal(e);
      });
      return;
    }

    setSavingStage(true);
    try {
      const { data: updated } = await api.patch(`/petshop/appointments/${stageModalItem.id}/status`, {
        status: stageForm.status,
        stagePhotoUrl: stageForm.stagePhotoUrl || null,
        stageNotes: stageForm.stageNotes || null,
        notifyTutor: stageForm.notifyTutor && Boolean(stageForm.stagePhotoUrl),
      });
      setAppointments(curr => curr.map(row => (row.id === stageModalItem.id ? updated : row)));
      toast.success(`Foto e etapa salvas para ${stageModalItem.pet.name}!`);

      if (stageForm.notifyTutor && stageForm.stagePhotoUrl) toast.success('Foto colocada na fila do WhatsApp do tutor.');
      setStageModalItem(null);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao salvar foto.';
      if (msg.includes('Identifique o colaborador') || msg.includes('PIN') || err.response?.status === 403) {
        openOperatorModal(() => {
          void submitStageModal(e);
        });
        return;
      }
      toast.error(msg);
    } finally {
      setSavingStage(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse" role="status" aria-label="Carregando operação de hoje">
          <div className="h-7 w-52 rounded bg-zinc-200" />
          <div className="mt-3 h-4 w-80 max-w-full rounded bg-zinc-200" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(item => (
              <div key={item} className="h-28 rounded-2xl bg-zinc-100" />
            ))}
          </div>
          <div className="mt-6 h-96 rounded-2xl bg-zinc-100" />
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center p-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-xs">
          <h1 className="text-lg font-bold text-zinc-900">Não foi possível abrir a visão de hoje</h1>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <button
            onClick={() => load()}
            className="mt-5 min-h-11 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 transition cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* 1. Header do Painel - Mobile (Fiel ao Mockup Image 1) */}
      <div className="md:hidden relative overflow-hidden rounded-3xl border border-[#cfe5df] bg-gradient-to-br from-[#eaf4f1] via-[#f7fbf9] to-white p-4 shadow-2xs">
        <div className="pointer-events-none absolute right-1 -top-1 h-28 w-36 select-none opacity-95">
          <span className="absolute -left-2 -top-1 text-[#0d6e5a]/15">
            <PawPrint size={32} />
          </span>
          <img
            src="/petcare/hero-dog-cat.webp"
            alt=""
            className="h-full w-full object-contain object-right-top"
          />
        </div>

        <div className="relative z-10 pr-24">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 border border-emerald-200/70 px-3 py-1 text-[11px] font-bold text-[#0d6e5a] mb-2">
            <CalendarDays size={13} className="text-[#0d6e5a]" />
            <span>{dateLabel}</span>
          </span>
          <h1 className="text-2xl font-black tracking-tight text-teal-950">
            Operação de hoje
          </h1>
          <p className="mt-1 text-xs text-zinc-500 leading-snug">
            Agenda, andamento dos serviços e pendências do estabelecimento.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-2xs hover:bg-zinc-50 transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
          <Link
            to="/petshop/agenda?new=1"
            className="flex items-center gap-1.5 rounded-2xl bg-[#0d6e5a] hover:bg-[#0a5747] px-4 py-2 text-xs font-bold text-white shadow-xs transition"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Novo atendimento</span>
          </Link>
        </div>
      </div>

      {/* 1. Header do Painel - Desktop */}
      <header className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
            <CalendarDays aria-hidden="true" size={14} className="text-teal-700" />
            {dateLabel}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900">
            Operação de hoje
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Agenda, andamento dos serviços e pendências do estabelecimento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <PetHeroShowcase />
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <Link
              to="/petshop/agenda?new=1"
              className="flex h-10 items-center gap-1.5 rounded-xl bg-teal-800 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-teal-900"
            >
              <Plus aria-hidden="true" size={15} strokeWidth={2.5} />
              Novo atendimento
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error} Os últimos dados carregados continuam visíveis.</span>
          <button onClick={() => load()} className="font-bold underline underline-offset-4">
            Tentar novamente
          </button>
        </div>
      )}

      {/* 2. Top 4 Cards de Resumo Operacional (Fiel ao Mockup Image 1) */}
      <section aria-label="Resumo da operação" className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Agenda de hoje */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <CalendarDays size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Agenda de hoje</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{agendaCount}</strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">atendimentos</span>
            </div>
          </div>
        </div>

        {/* Card 2: Em atendimento */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <Clock3 size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Em atendimento</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{inProduction.length}</strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">serviços em andamento</span>
            </div>
          </div>
        </div>

        {/* Card 3: Prontos para retirada */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <CheckCircle2 size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Prontos para retirada</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{ready.length}</strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">pets prontos</span>
            </div>
          </div>
        </div>

        {/* Card 4: Pendentes / Aguardando confirmação */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-700">
            <AlertTriangle size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Pendentes / Aguardando confirmação</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">{requested.length}</strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">solicitações</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Grade Central: Tabela da Agenda Operacional (Esquerda) e Widgets de Acompanhamento (Direita) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_390px] gap-5 items-start">
        {/* Coluna Esquerda: Agenda operacional do dia */}
        <section className="rounded-3xl border border-zinc-200/90 bg-white shadow-2xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4 sm:px-5">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <ClipboardList size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                  Agenda operacional do dia
                </h2>
                <p className="text-xs text-zinc-500 truncate">
                  Atendimentos programados, status em tempo real e ações de operação.
                </p>
              </div>
            </div>
            <Link
              to="/petshop/agenda"
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-[#0d6e5a] hover:bg-emerald-100 transition"
            >
              <span>Ver agenda completa →</span>
            </Link>
          </div>

          {activeAppointments.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <CalendarDays className="mb-3 text-zinc-300" size={32} />
              <h3 className="text-xs font-bold text-zinc-700">Nenhum atendimento programado para hoje</h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm">
                A agenda de hoje está livre. Clique em novo atendimento para agendar.
              </p>
              <Link
                to="/petshop/agenda?new=1"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0a5747] transition shadow-xs"
              >
                <Plus size={14} /> Novo atendimento
              </Link>
            </div>
          ) : (
            <>
              {/* Lista de Cards Nativa para Mobile (< md - Fiel ao Mockup Image 1) */}
              <div className="p-3.5 space-y-3 md:hidden bg-zinc-50/40">
                {activeAppointments.map(item => {
                  const statusInfo = STATUS_CONFIG[item.status] || {
                    label: item.status,
                    badgeClass: 'bg-zinc-50 text-zinc-700 border-zinc-200',
                  };
                  const primaryService = item.services[0]?.nameSnapshot || 'Serviço';
                  const hasMore = item.services.length > 1;
                  const isReady = item.status === 'ready';
                  const isInProgress = ['bathing', 'grooming', 'finishing', 'checked_in'].includes(item.status);

                  return (
                    <div
                      key={`mob-${item.id}`}
                      className="rounded-2xl border border-zinc-200/90 bg-white p-3.5 space-y-2.5 shadow-2xs"
                    >
                      {/* Top Row: Avatar + Time / Name / Tutor / Species + Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <PetAvatar pet={item.pet} size="md" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-teal-800 text-xs font-bold px-2 py-0.5">
                                <Clock size={11} className="text-teal-700" />
                                {time(item.startsAt)}
                              </span>
                              <strong className="text-xs font-extrabold text-zinc-900 truncate">
                                {item.pet?.name}
                              </strong>
                            </div>
                            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                              👤 Tutor: {item.customer?.name || 'Não informado'}
                            </p>
                            <p className="text-[11px] text-zinc-500 truncate">
                              🐾 {getPetSpeciesSize(item.pet)}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            isReady
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isInProgress
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : statusInfo.badgeClass
                          }`}
                        >
                          {isReady && item.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(item.transport.mode)
                            ? '✓ Pronto p/ levar'
                            : isReady
                            ? '✓ Pronto p/ busca'
                            : isInProgress
                            ? 'Em atendimento'
                            : statusInfo.label}
                        </span>
                      </div>

                      {/* Middle Row: Service Details Bar */}
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50/90 border border-zinc-100/90 px-3 py-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Scissors size={13} className="text-teal-700 shrink-0" />
                            <p className="font-bold text-zinc-800 truncate text-xs">
                              {primaryService}
                            </p>
                            {hasMore && (
                              <span className="rounded-md bg-zinc-200 px-1.5 py-0.2 text-[10px] font-bold text-zinc-700">
                                +{item.services.length - 1}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 flex items-center gap-1 mt-0.5">
                            <UserRound size={11} className="text-zinc-400 shrink-0" />
                            <span className="truncate">
                              {item.professional?.name ? `Profissional: ${item.professional.name}` : 'Profissional a definir'}
                            </span>
                          </p>
                        </div>

                        {item.transport?.enabled && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900 shadow-2xs">
                            🚐 Táxi Dog
                          </span>
                        )}
                      </div>

                      {/* Bottom Row: Actions Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {isInProgress && (
                          <>
                            {nextCareStage(item) && (
                              <button
                                type="button"
                                disabled={updatingId === item.id}
                                onClick={() => changeStatus(item, nextCareStage(item)!)}
                                className="rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                              >
                                Avançar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openStageModal(item)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            >
                              <Camera size={13} />
                              <span>Foto</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
                              className="rounded-xl bg-[#094e40] hover:bg-[#063b30] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                            >
                              Atendimento →
                            </button>
                          </>
                        )}

                        {isReady && (
                          <>
                            <button
                              type="button"
                              onClick={() => openStageModal(item)}
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            >
                              <Camera size={13} />
                              <span>Foto</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
                              className="rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                            >
                              Atendimento →
                            </button>
                          </>
                        )}

                        {!isInProgress && !isReady && (
                          <>
                            <button
                              type="button"
                              disabled={updatingId === item.id}
                              onClick={() => changeStatus(item, 'bathing')}
                              className="rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Play size={11} fill="currentColor" />
                              <span>Iniciar Banho</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setAppointmentToReschedule(item)}
                              className="rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                              title="Reagendar"
                            >
                              <CalendarDays size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAppointmentToCancel(item)}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              title="Cancelar"
                            >
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabela Desktop (>= md) */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/70 text-[11px] font-semibold text-zinc-400">
                    <th className="py-2.5 px-4 font-semibold">Horário</th>
                    <th className="py-2.5 px-3 font-semibold">Pet</th>
                    <th className="py-2.5 px-3 font-semibold">Tutor</th>
                    <th className="py-2.5 px-3 font-semibold">Serviço</th>
                    <th className="py-2.5 px-3 font-semibold">Profissional</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs">
                  {activeAppointments.map(item => {
                    const statusInfo = STATUS_CONFIG[item.status] || {
                      label: item.status,
                      badgeClass: 'bg-zinc-50 text-zinc-700 border-zinc-200',
                    };
                    const primaryService = item.services[0]?.nameSnapshot || 'Serviço';
                    const hasMore = item.services.length > 1;

                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/70 transition">
                        {/* Horário */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <strong className="block text-xs font-bold text-zinc-900 tabular-nums">
                            {time(item.startsAt)}
                          </strong>
                          <span className="block text-[10px] text-zinc-400 tabular-nums">
                            até {time(item.endsAt)}
                          </span>
                        </td>

                        {/* Pet */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <PetAvatar pet={item.pet} size="sm" />
                            <div>
                              <div className="font-bold text-zinc-900">{item.pet?.name}</div>
                              <div className="text-[10px] text-zinc-400">{getPetSpeciesSize(item.pet)}</div>
                            </div>
                          </div>
                        </td>

                        {/* Tutor */}
                        <td className="py-3 px-3 whitespace-nowrap text-zinc-700">
                          {item.customer?.name}
                        </td>

                        {/* Serviço */}
                        <td className="py-3 px-3 text-zinc-700 max-w-[200px]" title={item.services.map(s => s.nameSnapshot).join(', ')}>
                          <div className="truncate font-medium">{primaryService} {hasMore && <span className="text-[10px] text-zinc-400 font-semibold">+{item.services.length - 1}</span>}</div>
                          {item.transport?.enabled && (
                            <span
                              title={`Táxi Dog (${item.transport.mode === 'pickup_only' || item.transport.mode === 'pickup' ? 'Apenas Buscar' : item.transport.mode === 'dropoff_only' || item.transport.mode === 'dropoff' ? 'Apenas Levar' : 'Buscar e Levar'})${item.transport.address || item.customer?.address ? ` · ${item.transport.address || item.customer?.address}` : ''}`}
                              className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-300 text-[10px] font-bold text-amber-900 px-1.5 py-0.2 mt-0.5"
                            >
                              🚐 Táxi Dog
                            </span>
                          )}
                        </td>

                        {/* Profissional */}
                        <td className="py-3 px-3 whitespace-nowrap text-zinc-600">
                          <div className="flex items-center gap-1.5 text-xs">
                            <UserRound size={13} className="text-zinc-400" />
                            <span>{item.professional?.name || 'A definir'}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.badgeClass}`}
                          >
                            {['bathing', 'grooming', 'finishing', 'checked_in'].includes(item.status) && (
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                            )}
                            {item.status === 'ready' && item.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(item.transport.mode) ? 'Pronto p/ levar' : statusInfo.label}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Se Pronto: Ver foto e Ver atendimento */}
                            {item.status === 'ready' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openStageModal(item)}
                                  className="h-7 px-2.5 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                                >
                                  Ver foto
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
                                  className="h-7 px-2.5 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                                >
                                  Ver atendimento →
                                </button>
                              </>
                            )}

                            {/* Se Em atendimento */}
                            {['bathing', 'grooming', 'finishing'].includes(item.status) && (
                              <>
                              {nextCareStage(item) && <button type="button" disabled={updatingId === item.id} onClick={() => changeStatus(item, nextCareStage(item)!)} className="h-7 px-2.5 rounded-lg bg-teal-800 text-[11px] font-bold text-white disabled:opacity-50">Avançar</button>}
                              <button type="button" onClick={() => openStageModal(item)} className="h-7 px-2.5 rounded-lg border border-zinc-200 text-[11px]">Foto</button>
                              <button
                                type="button"
                                onClick={() => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
                                className="h-7 px-2.5 rounded-lg border border-zinc-200 bg-white text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
                              >
                                Ver atendimento →
                              </button>
                              </>
                            )}

                            {/* Se Aguardando confirmação (requested) */}
                            {item.status === 'requested' && (
                              <>
                                <button
                                  type="button"
                                  disabled={updatingId === item.id}
                                  onClick={() => changeStatus(item, 'scheduled')}
                                  className="h-7 px-3 rounded-lg bg-teal-800 text-[11px] font-bold text-white hover:bg-teal-900 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {updatingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToReschedule(item)}
                                  className="h-7 px-2 rounded-lg border border-teal-200 bg-teal-50 text-[11px] font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer flex items-center gap-1"
                                  title="Reagendar horário"
                                >
                                  <CalendarDays size={12} />
                                  Reagendar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToCancel(item)}
                                  className="h-7 px-2 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1"
                                  title="Cancelar agendamento"
                                >
                                  <XCircle size={12} />
                                  Cancelar
                                </button>
                              </>
                            )}

                            {/* Se Confirmado / Agendado */}
                            {(item.status === 'scheduled' || item.status === 'confirmed') && (
                              <>
                                <button
                                  type="button"
                                  disabled={updatingId === item.id}
                                  onClick={() => changeStatus(item, 'checked_in')}
                                  className="h-7 px-3 rounded-lg bg-teal-800 text-[11px] font-bold text-white hover:bg-teal-900 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {updatingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <PawPrint size={12} />}
                                  Check-in
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToReschedule(item)}
                                  className="h-7 px-2 rounded-lg border border-teal-200 bg-teal-50 text-[11px] font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer flex items-center gap-1"
                                  title="Reagendar horário"
                                >
                                  <CalendarDays size={12} />
                                  Reagendar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToCancel(item)}
                                  className="h-7 px-2 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1"
                                  title="Cancelar agendamento"
                                >
                                  <XCircle size={12} />
                                  Cancelar
                                </button>
                              </>
                            )}

                            {/* Se Check-in feito: Iniciar */}
                            {item.status === 'checked_in' && (
                              <>
                                <button
                                  type="button"
                                  disabled={updatingId === item.id}
                                  onClick={() => changeStatus(item, 'bathing')}
                                  className="h-7 px-3 rounded-lg bg-teal-800 text-[11px] font-bold text-white hover:bg-teal-900 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {updatingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} fill="currentColor" />}
                                  Iniciar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToReschedule(item)}
                                  className="h-7 w-7 grid place-items-center rounded-lg border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                                  title="Reagendar horário"
                                >
                                  <CalendarDays size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppointmentToCancel(item)}
                                  className="h-7 w-7 grid place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                                  title="Cancelar agendamento"
                                >
                                  <XCircle size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
                                  className="h-7 w-7 grid place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 transition cursor-pointer"
                                  title="Mais detalhes"
                                >
                                  <MoreHorizontal size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        {/* Coluna Direita: 4 Cartões Empilhados (Táxi Dog, Pendências, Prontos, Em atendimento) */}
        <aside className="space-y-4">
          {/* Cartão Táxi Dog & Entregas de Hoje */}
          <TaxiDogWidget
            appointments={appointments}
            onSelectAppointment={(item) => navigate(`/petshop/agenda?appointment=${item.id}&date=${localAppointmentDate(item.startsAt)}`)}
            onChangeStatus={changeStatus}
            title="Táxi Dog · Entregas de Hoje"
            subtitle="Coletas e entregas programadas para hoje"
            dateLabel="Hoje"
          />
          {/* Cartão 1: Reservas pendentes */}
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600" />
                <h3 className="text-xs font-bold text-zinc-900">Reservas pendentes</h3>
              </div>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                {requested.length}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">
              Todas as reservas aguardando confirmação, em ordem de agendamento.
            </p>

            {requested.length === 0 ? (
              <p className="text-xs text-zinc-400 italic py-2">Nenhuma solicitação pendente.</p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {requested.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <PetAvatar pet={item.pet} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{item.pet?.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {item.services[0]?.nameSnapshot || 'Serviço'} • {item.professional?.name || item.customer?.name}
                        </p><p className="text-xs font-semibold text-teal-800">{new Date(item.startsAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        Aguardando confirmação
                      </span>
                      <button
                        type="button"
                        onClick={() => changeStatus(item, 'scheduled')}
                        className="h-6 px-2 rounded-md bg-teal-800 text-[10px] font-bold text-white hover:bg-teal-900 transition cursor-pointer"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cartão 2: Prontos para retirada */}
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <h3 className="text-xs font-bold text-zinc-900">Pets prontos</h3>
              </div>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800">
                {ready.length}
              </span>
            </div>

            {ready.length === 0 ? (
              <p className="text-xs text-zinc-400 italic py-2">Nenhum pet aguardando retirada.</p>
            ) : (
              <div className="space-y-2.5">
                {ready.slice(0, 4).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <PetAvatar pet={item.pet} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{item.pet?.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {item.services[0]?.nameSnapshot || 'Serviço'} • {item.customer?.name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => notifyTutorDirect(item)}
                      className="h-6 px-2.5 rounded-md border border-emerald-300 bg-white text-[10px] font-bold text-emerald-800 hover:bg-emerald-50 transition cursor-pointer shrink-0"
                    >
                      Avisar tutor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cartão 3: Em atendimento agora */}
          <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock3 size={15} className="text-sky-600" />
                <h3 className="text-xs font-bold text-zinc-900">Em atendimento agora</h3>
              </div>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-800">
                {inProduction.length}
              </span>
            </div>

            {inProduction.length === 0 ? (
              <p className="text-xs text-zinc-400 italic py-2">Nenhum serviço em execução no momento.</p>
            ) : (
              <div className="space-y-2.5">
                {inProduction.slice(0, 4).map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 first:border-t-0 first:pt-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <PetAvatar pet={item.pet} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-zinc-900 truncate">{item.pet?.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate">
                          {item.services[0]?.nameSnapshot || 'Serviço'} • {item.professional?.name || item.customer?.name}
                        </p><p className="text-xs font-semibold text-teal-800">{new Date(item.startsAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
                      <Clock size={11} className="text-zinc-400" />
                      {getElapsedMinutes(item)} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* 4. Linha Inferior: 3 Cartões (Próximos atendimentos, Base do estabelecimento, Atalhos rápidos) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Próximos atendimentos */}
        <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-2">
                <Calendar size={15} className="text-teal-700" />
                Próximos atendimentos
              </h3>
              <Link
                to="/petshop/agenda"
                className="text-[11px] font-bold text-teal-800 hover:underline flex items-center gap-0.5"
              >
                Ver agenda →
              </Link>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">Próximos da agenda de hoje.</p>

            {upcomingAppointments.length === 0 ? (
              <p className="text-xs text-zinc-400 italic py-3">Sem outros atendimentos agendados para hoje.</p>
            ) : (
              <div className="space-y-2 py-1">
                {upcomingAppointments.slice(0, 4).map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-xs text-zinc-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <strong className="font-bold text-zinc-900 tabular-nums">{time(item.startsAt)}</strong>
                    <span className="font-semibold text-zinc-800 truncate">{item.pet?.name}</span>
                    <span className="text-zinc-300">•</span>
                    <span className="text-zinc-500 truncate">{item.services[0]?.nameSnapshot || 'Serviço'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Card 2: Base do estabelecimento */}
        <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-2 mb-1">
              <Layers size={15} className="text-teal-700" />
              Base do estabelecimento
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">
              Cadastros do Pet Care e recursos integrados com o PDV.
            </p>

            <div className="grid grid-cols-4 gap-2 text-center">
              <Link
                to="/petshop/pets"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2.5 hover:bg-zinc-100/70 transition"
              >
                <div className="flex justify-center text-teal-700 mb-1">
                  <PawPrint size={15} />
                </div>
                <strong className="block text-base font-extrabold text-zinc-900 tabular-nums">
                  {overview?.metrics.pets ?? 0}
                </strong>
                <span className="block text-[10px] text-zinc-500 font-medium truncate">Pets ativos</span>
              </Link>

              <Link
                to="/petshop/tutores"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2.5 hover:bg-zinc-100/70 transition"
              >
                <div className="flex justify-center text-teal-700 mb-1">
                  <Users size={15} />
                </div>
                <strong className="block text-base font-extrabold text-zinc-900 tabular-nums">
                  {overview?.metrics.tutors ?? 0}
                </strong>
                <span className="block text-[10px] text-zinc-500 font-medium truncate">Tutores</span>
              </Link>

              <Link
                to="/petshop/produtos"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2.5 hover:bg-zinc-100/70 transition"
              >
                <div className="flex justify-center text-teal-700 mb-1">
                  <Package size={15} />
                </div>
                <strong className="block text-base font-extrabold text-zinc-900 tabular-nums">
                  {overview?.metrics.products ?? 0}
                </strong>
                <span className="block text-[10px] text-zinc-500 font-medium truncate">Produtos</span>
              </Link>

              <Link
                to="/petshop/servicos"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2.5 hover:bg-zinc-100/70 transition"
              >
                <div className="flex justify-center text-teal-700 mb-1">
                  <Scissors size={15} />
                </div>
                <strong className="block text-base font-extrabold text-zinc-900 tabular-nums">
                  {overview?.metrics.services ?? 5}
                </strong>
                <span className="block text-[10px] text-zinc-500 font-medium truncate">Serviços</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Card 3: Atalhos rápidos */}
        <section className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-2 mb-1">
              <Sparkles size={15} className="text-teal-700" />
              Atalhos rápidos
            </h3>
            <p className="text-[11px] text-zinc-400 mb-4">Ações mais utilizadas no dia a dia.</p>

            <div className="grid grid-cols-5 gap-1.5 text-center">
              <Link
                to="/petshop/agenda?new=1"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2 hover:bg-zinc-100/70 transition flex flex-col items-center justify-center gap-1"
                title="Novo agendamento"
              >
                <CalendarDays size={16} className="text-teal-700" />
                <span className="text-[9px] font-semibold text-zinc-700 leading-tight">Nova agenda</span>
              </Link>

              <Link
                to="/petshop/servicos?new=1"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2 hover:bg-zinc-100/70 transition flex flex-col items-center justify-center gap-1"
                title="Cadastrar serviço"
              >
                <Scissors size={16} className="text-teal-700" />
                <span className="text-[9px] font-semibold text-zinc-700 leading-tight">Novo serviço</span>
              </Link>

              <Link
                to="/petshop/pacotes?new=1"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2 hover:bg-zinc-100/70 transition flex flex-col items-center justify-center gap-1"
                title="Vender pacote"
              >
                <Layers size={16} className="text-teal-700" />
                <span className="text-[9px] font-semibold text-zinc-700 leading-tight">Pacote cliente</span>
              </Link>

              <Link
                to="/petshop/whatsapp"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2 hover:bg-zinc-100/70 transition flex flex-col items-center justify-center gap-1"
                title="Automações de WhatsApp"
              >
                <MessageSquare size={16} className="text-teal-700" />
                <span className="text-[9px] font-semibold text-zinc-700 leading-tight">WhatsApp</span>
              </Link>

              <Link
                to="/petshop/equipe/comissoes"
                className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-2 hover:bg-zinc-100/70 transition flex flex-col items-center justify-center gap-1"
                title="Comissões e Fechamento"
              >
                <Clock3 size={16} className="text-teal-700" />
                <span className="text-[9px] font-semibold text-zinc-700 leading-tight">Comissões</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Modal Rápido: Foto e Recado da Etapa */}
      {stageModalItem && (
        <Modal
          title={`Foto e Recado · ${stageModalItem.pet?.name}`}
          onClose={() => setStageModalItem(null)}
          maxWidth="sm:max-w-xl"
        >
          <form onSubmit={submitStageModal} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 flex items-center gap-2.5">
                <PetAvatar pet={stageModalItem.pet} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-900 truncate">{stageModalItem.pet?.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    Tutor(a): {stageModalItem.customer?.name}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Etapa atual do pet *
                </label>
                <select
                  value={stageForm.status}
                  onChange={e => setStageForm({ ...stageForm, status: e.target.value })}
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 outline-none focus:border-teal-600"
                  required
                >
                  <option value="checked_in">Check-in (Chegou na loja)</option>
                  <option value="bathing">No banho</option>
                  <option value="grooming">Na tosa</option>
                  <option value="finishing">Finalização / Secagem</option>
                  <option value="ready">Pronto p/ busca</option>
                </select>
              </div>
            </div>

            <PhotoUploadField
              label="Foto do pet nesta etapa (aparece no painel do tutor)"
              value={stageForm.stagePhotoUrl}
              onChange={url => setStageForm({ ...stageForm, stagePhotoUrl: url })}
            />

            <div className="rounded-xl border border-zinc-200 p-3 bg-zinc-50/30">
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Recado carinhoso para o tutor (opcional)
              </label>
              <textarea
                value={stageForm.stageNotes}
                onChange={e => setStageForm({ ...stageForm, stageNotes: e.target.value })}
                rows={2}
                placeholder="Ex: Tomou banho quentinho, comportou super bem e já está secando!"
                className="w-full rounded-lg border border-zinc-200 bg-white p-2.5 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-teal-600"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={stageForm.notifyTutor}
                onChange={e => setStageForm({ ...stageForm, notifyTutor: e.target.checked })}
                disabled={!stageForm.stagePhotoUrl}
                className="rounded text-teal-700 focus:ring-teal-500"
              />
              <span>
                Enviar a foto desta etapa pelo WhatsApp conectado para <strong>{stageModalItem.customer?.name}</strong>
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStageModalItem(null)}
                className="h-9 px-4 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingStage}
                className="h-9 px-4 rounded-xl bg-teal-800 text-xs font-bold text-white hover:bg-teal-900 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingStage && <Loader2 size={13} className="animate-spin" />}
                Salvar etapa e foto
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de Cancelamento Fácil */}
      {appointmentToCancel && (
        <CancelAppointmentModal
          appointment={appointmentToCancel}
          onClose={() => setAppointmentToCancel(null)}
          onSuccess={updated => {
            setAppointments(curr => curr.map(row => (row.id === updated.id ? updated : row)));
            load();
          }}
        />
      )}

      {/* Modal de Reagendamento Fácil */}
      {appointmentToReschedule && (
        <RescheduleAppointmentModal
          appointment={appointmentToReschedule}
          operators={operators}
          onClose={() => setAppointmentToReschedule(null)}
          onSuccess={updated => {
            setAppointments(curr => curr.map(row => (row.id === updated.id ? updated : row)));
            load();
          }}
        />
      )}
    </div>
  );
}
