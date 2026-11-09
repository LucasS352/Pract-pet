import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Home,
  Hourglass,
  Layers,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Printer,
  RefreshCw,
  CalendarDays,
  Search,
  Share2,
  Sparkles,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { usePetshopContext } from '@/layouts/PetshopLayout';
import type { Appointment } from './types';
import { Modal, pageClass, PageHeader, PetAvatar, primaryButton, secondaryButton } from './ui';
import { CancelAppointmentModal } from './CancelAppointmentModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';

// Helpers de formatação e horários
function time(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
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

// Helpers operacionais do Táxi Dog
const isPickupMode = (mode?: string | null) =>
  mode === 'pickup_only' || mode === 'pickup' || mode === 'round_trip' || mode === 'both';

const isDropoffMode = (mode?: string | null) =>
  mode === 'dropoff_only' || mode === 'dropoff' || mode === 'round_trip' || mode === 'both';

const isPreCheckinStatus = (status: string) =>
  status === 'scheduled' || status === 'confirmed' || status === 'requested';

const isInStoreStatus = (status: string) =>
  status === 'checked_in' ||
  status === 'in_progress' ||
  status === 'bathing' ||
  status === 'drying' ||
  status === 'grooming' ||
  status === 'finishing';

export default function PetshopTaxiDogPage() {
  const { tenant } = usePetshopContext();

  // Seletor de data
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtros de visualização
  const [activeTab, setActiveTab] = useState<'pickups' | 'dropoffs' | 'in_store' | 'delivered' | 'all'>('pickups');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de Manifesto de Rota
  const [openManifestModal, setOpenManifestModal] = useState(false);
  const [checkedStops, setCheckedStops] = useState<Record<string, boolean>>({});

  // Modais de Cancelamento e Reagendamento Fácil
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null);

  // Carrega agendamentos da data selecionada
  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${selectedDate}T00:00:00.000Z`;
      const to = `${selectedDate}T23:59:59.999Z`;
      const res = await api.get<Appointment[]>('/petshop/appointments', {
        params: { from, to },
      });
      setAppointments(res.data || []);
    } catch {
      toast.error('Não foi possível carregar as corridas do Táxi Dog.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  // Filtra apenas agendamentos com transporte habilitado e não cancelados
  const taxiAppointments = useMemo(() => {
    return appointments
      .filter(item => Boolean(item.transport?.enabled) && item.status !== 'cancelled')
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [appointments]);

  // 1. FALTA BUSCAR (Coleta pendente antes do check-in)
  const pendingPickups = useMemo(() => {
    return taxiAppointments.filter(
      item => isPickupMode(item.transport?.mode) && isPreCheckinStatus(item.status),
    );
  }, [taxiAppointments]);

  // 2. NO PET SHOP / EM CUIDADOS (Check-in realizado, em banho/tosa aguardando finalizar)
  const inStorePets = useMemo(() => {
    return taxiAppointments.filter(item => isInStoreStatus(item.status));
  }, [taxiAppointments]);

  // 3. PRONTOS PARA LEVAR AGORA (Finalizados na loja aguardando transporte de volta)
  const readyDropoffs = useMemo(() => {
    return taxiAppointments.filter(
      item => isDropoffMode(item.transport?.mode) && item.status === 'ready',
    );
  }, [taxiAppointments]);

  // 4. FILA GERAL DE ENTREGA (Prontos no topo + na loja em andamento)
  const dropoffQueue = useMemo(() => {
    const list = taxiAppointments.filter(
      item => isDropoffMode(item.transport?.mode) && item.status !== 'delivered',
    );
    const score = (status: string) => {
      if (status === 'ready') return 1; // 1º: Pronto para levar agora!
      if (isInStoreStatus(status)) return 2; // 2º: Na loja finalizando banho
      return 3; // 3º: Ainda a coletar
    };
    return [...list].sort((a, b) => {
      const diff = score(a.status) - score(b.status);
      if (diff !== 0) return diff;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [taxiAppointments]);

  // 5. ENTREGUES HOJE
  const deliveredPets = useMemo(() => {
    return taxiAppointments.filter(item => item.status === 'delivered');
  }, [taxiAppointments]);

  // Itens da aba ativa com busca textual
  const displayedItems = useMemo(() => {
    let base: Appointment[] = [];
    if (activeTab === 'pickups') base = pendingPickups;
    else if (activeTab === 'dropoffs') base = dropoffQueue;
    else if (activeTab === 'in_store') base = inStorePets;
    else if (activeTab === 'delivered') base = deliveredPets;
    else base = taxiAppointments;

    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase().trim();

    return base.filter(item => {
      const petName = item.pet?.name?.toLowerCase() || '';
      const tutorName = (item.pet?.customer?.name || (item as any).tutorName || '').toLowerCase();
      const addr = (item.transport?.address || '').toLowerCase();
      const ref = (item.transport?.reference || '').toLowerCase();
      const phone = (item.pet?.customer?.phone || '').toLowerCase();
      return (
        petName.includes(q) ||
        tutorName.includes(q) ||
        addr.includes(q) ||
        ref.includes(q) ||
        phone.includes(q)
      );
    });
  }, [activeTab, pendingPickups, dropoffQueue, inStorePets, deliveredPets, taxiAppointments, searchQuery]);

  // Ações de alteração de status
  const handleUpdateStatus = async (item: Appointment, newStatus: string) => {
    setUpdatingId(item.id);
    try {
      await api.patch(`/petshop/appointments/${item.id}/status`, { status: newStatus });
      toast.success(
        newStatus === 'checked_in'
          ? `Coleta confirmada! Check-in realizado para ${item.pet?.name || 'o pet'}.`
          : newStatus === 'delivered'
          ? `Entrega concluída com sucesso para ${item.pet?.name || 'o pet'}!`
          : `Status atualizado com sucesso.`
      );
      await loadAppointments();
    } catch {
      toast.error('Não foi possível atualizar o status do atendimento.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Disparo de mensagem no WhatsApp
  const handleSendWhatsApp = async (item: Appointment, type: 'pickup' | 'dropoff') => {
    setUpdatingId(item.id);
    try {
      const { data } = await api.post(`/petshop/appointments/${item.id}/taxi-departure`, { direction: type });
      toast.success(data.alreadySent ? 'Aviso de saída já enviado para este trajeto.' : 'Aviso de saída registrado para envio no WhatsApp.');
    } catch {
      toast.error('Não foi possível enviar o aviso de saída. Confira a modalidade e o status do atendimento.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Abrir no GPS / Google Maps
  const handleOpenGps = (address: string) => {
    if (!address) {
      toast.error('Endereço não informado.');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  // Abrir no Waze
  const handleOpenWaze = (address: string) => {
    if (!address) {
      toast.error('Endereço não informado.');
      return;
    }
    const url = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    window.open(url, '_blank');
  };

  // Compartilhar manifesto completo de rota no WhatsApp do motorista
  const handleShareManifestWhatsApp = () => {
    if (taxiAppointments.length === 0) {
      toast.error('Nenhuma corrida agendada para este dia.');
      return;
    }

    const lines = [
      `🚐 *ROTA DO TÁXI DOG — ${formatDate(selectedDate)}*`,
      `Estabelecimento: ${tenant?.name || 'Pet Shop'}`,
      `Total de corridas: ${taxiAppointments.length}`,
      '',
      `📥 *COLETAS A BUSCAR (${pendingPickups.length}):*`,
      ...pendingPickups.map((item, idx) => {
        const timeStr = time(item.startsAt);
        const pet = item.pet?.name || 'Pet';
        const tutor = item.pet?.customer?.name || 'Tutor';
        const phone = item.pet?.customer?.phone || '';
        const addr = item.transport?.address || 'Sem endereço';
        const ref = item.transport?.reference ? ` (Ref: ${item.transport.reference})` : '';
        return `${idx + 1}. [${timeStr}] *${pet}* (Tutor: ${tutor} - ${phone})\n📍 ${addr}${ref}`;
      }),
      '',
      `📤 *ENTREGAS / LEVAR:*`,
      ...dropoffQueue.map((item, idx) => {
        const pet = item.pet?.name || 'Pet';
        const tutor = item.pet?.customer?.name || 'Tutor';
        const phone = item.pet?.customer?.phone || '';
        const addr = item.transport?.address || 'Sem endereço';
        const isReady = item.status === 'ready' ? ' [🚀 PRONTO!]' : ' [⏳ Na Loja]';
        return `${idx + 1}. *${pet}*${isReady} (Tutor: ${tutor} - ${phone})\n📍 ${addr}`;
      }),
    ];

    const text = lines.join('\n');
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Imprimir manifesto de rota
  const handlePrintManifest = () => {
    window.print();
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div className={pageClass}>
      {/* 1. CABEÇALHO DA PÁGINA */}
      <PageHeader
        eyebrow="Área de Atendimento e Gestão"
        title="Táxi Dog · Coletas & Entregas"
        description="Painel operacional de transporte para motoristas e equipe. Rastreie coletas, pets na loja e organize as entregas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpenManifestModal(true)}
              disabled={taxiAppointments.length === 0}
              className={`${secondaryButton} flex items-center gap-1.5`}
            >
              <Navigation size={15} />
              <span>Manifesto de Rota</span>
            </button>
            <button
              type="button"
              onClick={handleShareManifestWhatsApp}
              disabled={taxiAppointments.length === 0}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
            >
              <Share2 size={15} />
              <span className="hidden sm:inline">Enviar Rota p/ WhatsApp</span>
              <span className="sm:hidden">WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={loadAppointments}
              disabled={loading}
              className={`${primaryButton} flex items-center gap-1.5`}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
          </div>
        }
      />

      {/* 2. SELETOR DE DATA OPERACIONAL */}
      <section
        aria-label="Seletor de data operacional"
        className="mb-6 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Car size={18} />
            </span>
            <div>
              <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Data das Corridas
              </p>
              <p className="text-[11px] text-zinc-400">
                {selectedDate === todayStr ? 'Visualizando coletas e entregas de Hoje' : `Visualizando: ${formatDate(selectedDate)}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-teal-800 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(tomorrowStr)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                selectedDate === tomorrowStr
                  ? 'bg-teal-800 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
              }`}
            >
              Amanhã
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
            />
          </div>
        </div>
      </section>

      {/* 3. CARDS DE RESUMO OPERACIONAL (4 KPIS DE TRANSPORTE) */}
      <section
        aria-label="Resumo das corridas de hoje"
        className="mb-6 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >
        {/* Card 1: Falta Buscar */}
        <div
          onClick={() => setActiveTab('pickups')}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-md flex items-center gap-3.5 ${
            activeTab === 'pickups'
              ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400/20'
              : 'border-zinc-200/90 bg-white'
          }`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <Truck size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600">Falta buscar</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <strong className="text-2xl font-extrabold text-zinc-900 tabular-nums">
                {pendingPickups.length}
              </strong>
              <span className="truncate text-xs text-zinc-400">coletas pendentes</span>
            </div>
          </div>
        </div>

        {/* Card 2: No Pet Shop (Em Cuidados) */}
        <div
          onClick={() => setActiveTab('in_store')}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-md flex items-center gap-3.5 ${
            activeTab === 'in_store'
              ? 'border-sky-400 bg-sky-50/60 ring-2 ring-sky-400/20'
              : 'border-zinc-200/90 bg-white'
          }`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <Hourglass size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600">No Pet Shop</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <strong className="text-2xl font-extrabold text-zinc-900 tabular-nums">
                {inStorePets.length}
              </strong>
              <span className="truncate text-xs text-zinc-400">em atendimento</span>
            </div>
          </div>
        </div>

        {/* Card 3: Prontos para Levar Agora */}
        <div
          onClick={() => setActiveTab('dropoffs')}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-md flex items-center gap-3.5 ${
            activeTab === 'dropoffs'
              ? 'border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-400/20'
              : readyDropoffs.length > 0
              ? 'border-emerald-200 bg-emerald-50/30'
              : 'border-zinc-200/90 bg-white'
          }`}
        >
          <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Home size={22} />
            {readyDropoffs.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-600" />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-emerald-800 font-bold">Prontos p/ levar</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <strong className="text-2xl font-extrabold text-emerald-900 tabular-nums">
                {readyDropoffs.length}
              </strong>
              <span className="truncate text-xs text-emerald-700">levar p/ casa agora</span>
            </div>
          </div>
        </div>

        {/* Card 4: Entregues Hoje */}
        <div
          onClick={() => setActiveTab('delivered')}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition hover:shadow-md flex items-center gap-3.5 ${
            activeTab === 'delivered'
              ? 'border-teal-400 bg-teal-50/60 ring-2 ring-teal-400/20'
              : 'border-zinc-200/90 bg-white'
          }`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800">
            <CheckCircle2 size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-600">Entregues</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <strong className="text-2xl font-extrabold text-zinc-900 tabular-nums">
                {deliveredPets.length}
              </strong>
              <span className="truncate text-xs text-zinc-400">corridas concluídas</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. BARRA DE BUSCA E ABAS OPERACIONAIS */}
      <section aria-label="Abas e busca" className="mb-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Abas */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('pickups')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'pickups'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>📥 Buscar no Endereço</span>
              <span
                className={`rounded-md px-1.5 py-0.2 text-[10px] font-extrabold ${
                  pendingPickups.length > 0 ? 'bg-amber-100 text-amber-900' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {pendingPickups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dropoffs')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'dropoffs'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>📤 Levar para Casa</span>
              <span
                className={`rounded-md px-1.5 py-0.2 text-[10px] font-extrabold ${
                  readyDropoffs.length > 0
                    ? 'bg-emerald-100 text-emerald-900 animate-pulse'
                    : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {readyDropoffs.length > 0 ? `${readyDropoffs.length} prontos` : dropoffQueue.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('in_store')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'in_store'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🏪 Na Loja (Cuidados)</span>
              <span className="rounded-md bg-zinc-200 text-zinc-600 px-1.5 py-0.2 text-[10px] font-extrabold">
                {inStorePets.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('delivered')}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'delivered'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🏁 Entregues</span>
              <span className="rounded-md bg-zinc-200 text-zinc-600 px-1.5 py-0.2 text-[10px] font-extrabold">
                {deliveredPets.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todas ({taxiAppointments.length})
            </button>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative w-full md:w-72">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar pet, tutor, endereço..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-8 py-2 text-xs text-zinc-900 placeholder-zinc-400 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 5. LISTAGEM DE CARDS OPERACIONAIS DE TRANSPORTE */}
      <section aria-label="Lista de corridas">
        {loading ? (
          <div className="grid place-items-center py-16 text-zinc-400">
            <RefreshCw size={24} className="animate-spin text-teal-700" />
            <span className="mt-2 text-xs font-medium">Carregando corridas do Táxi Dog...</span>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center shadow-xs">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-zinc-50 text-zinc-400 mb-3">
              <Car size={24} />
            </span>
            <h3 className="text-sm font-bold text-zinc-900">Nenhuma corrida encontrada</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">
              {searchQuery
                ? `Nenhum resultado corresponde à busca "${searchQuery}".`
                : activeTab === 'pickups'
                ? 'Todas as coletas do dia já foram realizadas ou não há pets agendados para busca.'
                : activeTab === 'dropoffs'
                ? 'Nenhum pet aguardando entrega no momento.'
                : 'Não há agendamentos com Táxi Dog cadastrados para esta data.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {displayedItems.map(item => {
              const tutorName = item.pet?.customer?.name || (item as any).tutorName || 'Tutor não informado';
              const phone = item.pet?.customer?.phone || '';
              const address = item.transport?.address || 'Endereço não cadastrado';
              const reference = item.transport?.reference;
              const mode = item.transport?.mode;
              const fee = item.transport?.fee ? Number(item.transport.fee) : 0;
              const isUpdating = updatingId === item.id;

              const isReady = item.status === 'ready';
              const isInStore = isInStoreStatus(item.status);
              const isDelivered = item.status === 'delivered';
              const isPreCheckin = isPreCheckinStatus(item.status);

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between ${
                    isReady
                      ? 'border-emerald-300 ring-2 ring-emerald-400/20 bg-emerald-50/15'
                      : 'border-zinc-200/90'
                  }`}
                >
                  {/* Topo do Card: Horário, Pet e Tutor */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <PetAvatar
                          pet={item.pet}
                          size="md"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <strong className="text-sm font-bold text-zinc-900">
                              {item.pet?.name || 'Pet'}
                            </strong>
                            <span className="text-[11px] font-medium text-zinc-400">
                              · {getPetSpeciesSize(item.pet)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 flex items-center gap-1">
                            <User size={12} className="text-zinc-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{tutorName}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-lg">
                          <Clock size={12} className="text-zinc-500" />
                          {time(item.startsAt)}
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-0.5">previsão</p>
                      </div>
                    </div>

                    {/* Badges de Status Operacional e Modalidade */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      {mode === 'pickup_only' && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          📥 Apenas Buscar
                        </span>
                      )}
                      {mode === 'dropoff_only' && (
                        <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                          📤 Apenas Levar
                        </span>
                      )}
                      {(mode === 'round_trip' || mode === 'both' || !mode) && (
                        <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          🚐 Buscar e Levar
                        </span>
                      )}

                      {/* Status Atual do Pet */}
                      {isReady && (
                        <span className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-900 flex items-center gap-1">
                          <Sparkles size={11} className="text-emerald-700" />
                          🚀 PRONTO P/ LEVAR
                        </span>
                      )}
                      {isInStore && (
                        <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 flex items-center gap-1">
                          <Hourglass size={11} />
                          Na Loja (Em Atendimento)
                        </span>
                      )}
                      {isPreCheckin && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 flex items-center gap-1">
                          <Clock size={11} />
                          Aguardando Coleta
                        </span>
                      )}
                      {isDelivered && (
                        <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Entregue com Sucesso
                        </span>
                      )}
                    </div>

                    {/* Bloco de Endereço em Destaque */}
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 mb-3 text-xs">
                      <div className="flex items-start gap-2">
                        <MapPin size={15} className="text-rose-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <strong className="text-zinc-900 block break-words">
                            {address}
                          </strong>
                          {reference && (
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              <span className="font-semibold text-zinc-700">Ref:</span> {reference}
                            </p>
                          )}
                          {phone && (
                            <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                              <Phone size={11} className="text-zinc-400" />
                              <a href={`tel:${phone.replace(/\D/g, '')}`} className="text-teal-800 hover:underline">
                                {phone}
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Serviços inclusos no atendimento */}
                    {item.services && item.services.length > 0 && (
                      <div className="mb-4 text-[11px] text-zinc-500 flex flex-wrap gap-1">
                        {item.services.map(s => (
                          <span
                            key={s.id}
                            className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-700 font-medium"
                          >
                            {s.nameSnapshot}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rodapé do Card: Ações do Motorista */}
                  <div className="pt-3 border-t border-zinc-100 space-y-2">
                    {/* Botões Rápidos de GPS e WhatsApp */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenGps(address)}
                        className="flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white px-2 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 shadow-2xs transition cursor-pointer"
                        title="Abrir no Google Maps"
                      >
                        <Navigation size={13} className="text-blue-600" />
                        <span>Maps</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenWaze(address)}
                        className="flex h-9 items-center justify-center gap-1 rounded-xl border border-zinc-200 bg-white px-2 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 shadow-2xs transition cursor-pointer"
                        title="Abrir no Waze"
                      >
                        <Car size={13} className="text-sky-500" />
                        <span>Waze</span>
                      </button>

                      {(item.status === 'scheduled' && isPickupMode(mode) || isReady && isDropoffMode(mode)) && <button
                        type="button"
                        onClick={() => handleSendWhatsApp(item, isReady ? 'dropoff' : 'pickup')}
                        disabled={!phone || isUpdating}
                        className="flex h-9 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        title="Avisar cliente pelo WhatsApp"
                      >
                        <MessageCircle size={13} className="text-emerald-600" />
                        <span>Avisar saída</span>
                      </button>}
                    </div>

                    {/* Botão Principal de Transição de Etapa */}
                    {isPreCheckin && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item, 'checked_in')}
                        disabled={isUpdating}
                        className="w-full flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                      >
                        {isUpdating ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Check size={16} strokeWidth={2.5} />
                        )}
                        <span>Confirmar Coleta (Fazer Check-in)</span>
                      </button>
                    )}

                    {isReady && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item, 'delivered')}
                        disabled={isUpdating}
                        className="w-full flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-xs transition disabled:opacity-50 cursor-pointer"
                      >
                        {isUpdating ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <span>Confirmar Entrega Realizada</span>
                      </button>
                    )}

                    {isInStore && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-sky-50 text-[11px] text-sky-900 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <Hourglass size={13} className="text-sky-700 animate-spin" />
                          Pet no banho & tosa
                        </span>
                        <span className="text-[10px] text-sky-700">Aguardando finalizar</span>
                      </div>
                    )}

                    {/* Ações Rápidas de Reagendamento e Cancelamento */}
                    {item.status !== 'delivered' && item.status !== 'cancelled' && (
                      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                        <button
                          type="button"
                          onClick={() => setAppointmentToReschedule(item)}
                          className="flex items-center gap-1 text-[11px] font-bold text-teal-800 hover:text-teal-950 transition cursor-pointer"
                          title="Reagendar data e horário"
                        >
                          <CalendarDays size={12} />
                          Reagendar
                        </button>
                        <button
                          type="button"
                          onClick={() => setAppointmentToCancel(item)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                          title="Cancelar ou marcar falta"
                        >
                          <XCircle size={12} />
                          Cancelar
                        </button>
                      </div>
                    )}

                    {isDelivered && (
                      <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-50 text-[11px] text-teal-800 font-bold">
                        <Check size={14} />
                        <span>Entrega finalizada hoje</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. MODAL DE MANIFESTO DE ROTA (PARA O MOTORISTA / IMPRESSÃO) */}
      {openManifestModal && (
        <Modal
          title={`Manifesto de Rota · ${formatDate(selectedDate)}`}
          onClose={() => setOpenManifestModal(false)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              Roteiro ordenado com checklist de coletas e entregas do motorista.
            </p>
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div>
              <p className="text-xs font-bold text-zinc-900">
                {taxiAppointments.length} paradas no roteiro
              </p>
              <p className="text-[11px] text-zinc-400">
                Marque cada parada conforme for realizando no trajeto
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintManifest}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer shadow-2xs"
              >
                <Printer size={14} />
                <span>Imprimir Rota</span>
              </button>
              <button
                type="button"
                onClick={handleShareManifestWhatsApp}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-800 cursor-pointer shadow-xs"
              >
                <Share2 size={14} />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
            {taxiAppointments.map((item, idx) => {
              const isChecked = Boolean(checkedStops[item.id]);
              const petName = item.pet?.name || 'Pet';
              const tutorName = item.pet?.customer?.name || (item as any).tutorName || 'Tutor';
              const phone = item.pet?.customer?.phone || '';
              const address = item.transport?.address || 'Sem endereço';
              const reference = item.transport?.reference;
              const isPickup = isPreCheckinStatus(item.status);
              const isReady = item.status === 'ready';

              return (
                <div
                  key={item.id}
                  onClick={() =>
                    setCheckedStops(prev => ({ ...prev, [item.id]: !prev[item.id] }))
                  }
                  className={`cursor-pointer rounded-xl border p-3 text-xs transition flex items-start gap-3 ${
                    isChecked
                      ? 'border-emerald-200 bg-emerald-50/40 opacity-70'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                >
                  <div
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                      isChecked
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-zinc-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check size={13} strokeWidth={3} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-zinc-900">
                        {idx + 1}. {petName} · <span className="font-semibold text-zinc-600">{tutorName}</span>
                      </span>
                      <span className="text-[11px] font-bold text-zinc-500 tabular-nums">
                        {time(item.startsAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-zinc-700 font-medium break-words">
                      📍 {address}
                      {reference && <span className="text-zinc-400 ml-1">({reference})</span>}
                    </p>

                    <div className="mt-1.5 flex items-center gap-2">
                      {isPickup && (
                        <span className="rounded bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.2">
                          📥 Buscar no endereço
                        </span>
                      )}
                      {isReady && (
                        <span className="rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold px-1.5 py-0.2">
                          🚀 Pronto p/ levar
                        </span>
                      )}
                      {phone && (
                        <span className="text-[10px] text-zinc-400">
                          📞 {phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    )}

    {/* Modal de Cancelamento Fácil */}
    {appointmentToCancel && (
      <CancelAppointmentModal
        appointment={appointmentToCancel}
        onClose={() => setAppointmentToCancel(null)}
        onSuccess={updated => {
          setAppointments(curr => curr.map(row => (row.id === updated.id ? updated : row)));
          void loadAppointments();
        }}
      />
    )}

    {/* Modal de Reagendamento Fácil */}
    {appointmentToReschedule && (
      <RescheduleAppointmentModal
        appointment={appointmentToReschedule}
        onClose={() => setAppointmentToReschedule(null)}
        onSuccess={updated => {
          setAppointments(curr => curr.map(row => (row.id === updated.id ? updated : row)));
          void loadAppointments();
        }}
      />
    )}
    </div>
  );
}
