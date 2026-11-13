import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Calendar,
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
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { usePetshopContext } from '@/layouts/PetshopLayout';
import type { Appointment } from './types';
import { Modal, pageClass, PageHeader, PetAvatar, primaryButton, secondaryButton } from './ui';
import { CancelAppointmentModal } from './CancelAppointmentModal';
import { RescheduleAppointmentModal } from './RescheduleAppointmentModal';
import { buildGoogleMapsRoutes, isMobileMapsClient, qualifyRouteAddresses, requireRouteAddresses } from './taxi-route';
import { isPickupMode, isDropoffMode, isPreCheckinStatus, isInStoreStatus, needsTaxiStop, summarizeTaxiAppointments } from './taxi-operations';

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

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

export default function PetshopTaxiDogPage() {
  const navigate = useNavigate();
  const { tenant, operator, isOperatorAccount, openOperatorModal } = usePetshopContext();

  // Seletor de data
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return localDateKey(now);
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
  // Ordem sequencial das paradas escolhidas pelo motorista: [id1, id2, id3...]
  const [routeOrder, setRouteOrder] = useState<string[]>([]);

  // Cidade padrão da loja ou salva no dispositivo (opcional)
  const defaultRouteCity = useMemo(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('practpet_route_city');
      if (saved) return saved;
    }
    if (tenant?.municipio && tenant?.uf) return `${tenant.municipio}, ${tenant.uf}`;
    return tenant?.municipio || '';
  }, [tenant]);

  const [routeCity, setRouteCity] = useState(defaultRouteCity);

  useEffect(() => {
    if (defaultRouteCity && !routeCity) {
      setRouteCity(defaultRouteCity);
    }
  }, [defaultRouteCity]);

  const handleRouteCityChange = (val: string) => {
    setRouteCity(val);
    try {
      if (val.trim()) localStorage.setItem('practpet_route_city', val.trim());
      else localStorage.removeItem('practpet_route_city');
    } catch {}
  };

  const [routeLinks, setRouteLinks] = useState<string[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const loadController = useRef<AbortController | null>(null);

  // Manipulação da ordem de paradas da rota
  const getStopNumber = (id: string) => {
    const idx = routeOrder.indexOf(id);
    return idx >= 0 ? idx + 1 : 0;
  };

  const toggleRouteStop = (id: string) => {
    setRouteOrder(current => {
      const idx = current.indexOf(id);
      if (idx >= 0) return current.filter(itemId => itemId !== id);
      return [...current, id];
    });
  };

  const moveStop = (id: string, direction: 'up' | 'down') => {
    setRouteOrder(current => {
      const idx = current.indexOf(id);
      if (idx < 0) return current;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= current.length) return current;
      const next = [...current];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const clearRoute = () => {
    setRouteOrder([]);
  };

  // Modais de Cancelamento e Reagendamento Fácil
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null);

  // Carrega agendamentos da data selecionada
  const loadAppointments = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    try {
      const from = new Date(`${selectedDate}T00:00:00`).toISOString();
      const to = new Date(`${selectedDate}T23:59:59.999`).toISOString();
      const [res, overdue] = await Promise.all([
        api.get<Appointment[]>('/petshop/appointments', { params: { from, to }, signal: controller.signal }),
        api.get<Appointment[]>('/petshop/appointments/overdue-pickups', { params: { before: from }, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      const current = res.data || [];
      const older = overdue.data || [];
      setOverdueCount(older.length);
      setAppointments([...new Map([...older, ...current].map(item => [item.id, item])).values()]);
    } catch {
      if (!controller.signal.aborted) toast.error('Não foi possível carregar as corridas do Táxi Dog.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadAppointments();
    return () => loadController.current?.abort();
  }, [loadAppointments]);

  useEffect(() => { setRouteLinks([]); }, [selectedDate, appointments, checkedStops, routeOrder, routeCity]);

  // Filtra apenas agendamentos com transporte habilitado e não cancelados
  const operation = useMemo(() => summarizeTaxiAppointments(appointments), [appointments]);
  const taxiAppointments = operation.all;

  const selectAllInSequence = useCallback(() => {
    const pending = taxiAppointments
      .filter(item => !checkedStops[item.id] && needsTaxiStop(item))
      .map(item => item.id);
    setRouteOrder(pending);
  }, [taxiAppointments, checkedStops]);

  // 1. FALTA BUSCAR (Coleta pendente antes do check-in)
  const pendingPickups = operation.pickups;

  // 2. NO PET SHOP / EM CUIDADOS (Check-in realizado, em banho/tosa aguardando finalizar)
  const inStorePets = operation.inStore;

  // 3. PRONTOS PARA LEVAR AGORA (Finalizados na loja aguardando transporte de volta)
  const readyDropoffs = operation.ready;

  // 4. FILA GERAL DE ENTREGA (Prontos no topo + na loja em andamento)
  const dropoffQueue = operation.dropoffs;

  // 5. ENTREGUES HOJE
  const deliveredPets = operation.delivered;

  // Itens da aba ativa com busca textual
  const displayedItems = useMemo(() => {
    let base: Appointment[] = [];
    if (activeTab === 'pickups') base = pendingPickups;
    else if (activeTab === 'dropoffs') base = readyDropoffs;
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
    if (isOperatorAccount && !operator) {
      openOperatorModal(() => {
        void handleUpdateStatus(item, newStatus);
      });
      return;
    }

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
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Não foi possível atualizar o status do atendimento.';
      if (msg.includes('Identifique o colaborador') || msg.includes('PIN') || err?.response?.status === 403) {
        openOperatorModal(() => {
          void handleUpdateStatus(item, newStatus);
        });
        return;
      }
      toast.error(msg);
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

    const hasOrderedStops = routeOrder.length > 0;
    const orderedStops = hasOrderedStops
      ? routeOrder
          .map(id => taxiAppointments.find(item => item.id === id))
          .filter((item): item is Appointment => Boolean(item && !checkedStops[item.id]))
      : [];

    const lines = hasOrderedStops && orderedStops.length > 0
      ? [
          `🚐 *ROTEIRO DO TÁXI DOG — ${formatDate(selectedDate)}*`,
          `Estabelecimento: ${tenant?.name || 'Pet Shop'}`,
          `Total na rota: ${orderedStops.length} parada(s) organizada(s)`,
          '',
          `*ORDEM DAS PARADAS (1ª à ${orderedStops.length}ª):*`,
          ...orderedStops.map((item, idx) => {
            const timeStr = time(item.startsAt);
            const pet = item.pet?.name || 'Pet';
            const tutor = item.pet?.customer?.name || (item as any).tutorName || 'Tutor';
            const phone = item.pet?.customer?.phone || '';
            const addr = item.transport?.address || 'Sem endereço';
            const ref = item.transport?.reference ? ` (Ref: ${item.transport.reference})` : '';
            const modeLabel = isPreCheckinStatus(item.status) ? '📥 Buscar' : '📤 Levar';
            return `${idx + 1}ª Parada [${timeStr}] - *${pet}* (${modeLabel})\n📍 ${addr}${ref}\nTutor: ${tutor}${phone ? ` (${phone})` : ''}\n`;
          }),
        ]
      : [
          `🚐 *ROTA DO TÁXI DOG — ${formatDate(selectedDate)}*`,
          `Estabelecimento: ${tenant?.name || 'Pet Shop'}`,
          `Total de corridas: ${taxiAppointments.length}`,
          '',
          `📥 *COLETAS A BUSCAR (${pendingPickups.length}):*`,
          ...pendingPickups.map((item, idx) => {
            const timeStr = time(item.startsAt);
            const pet = item.pet?.name || 'Pet';
            const tutor = item.pet?.customer?.name || (item as any).tutorName || 'Tutor';
            const phone = item.pet?.customer?.phone || '';
            const addr = item.transport?.address || 'Sem endereço';
            const ref = item.transport?.reference ? ` (Ref: ${item.transport.reference})` : '';
            return `${idx + 1}. [${timeStr}] *${pet}* (Tutor: ${tutor} - ${phone})\n📍 ${addr}${ref}`;
          }),
          '',
          `📤 *ENTREGAS / LEVAR:*`,
          ...dropoffQueue.map((item, idx) => {
            const pet = item.pet?.name || 'Pet';
            const tutor = item.pet?.customer?.name || (item as any).tutorName || 'Tutor';
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

  // Abrir rota completa no Google Maps (com múltiplas paradas / waypoints na ordem selecionada)
  const handleOpenGoogleMapsRoute = () => {
    try {
      let stops: Appointment[] = [];
      if (routeOrder.length > 0) {
        stops = routeOrder
          .map(id => taxiAppointments.find(item => item.id === id))
          .filter((item): item is Appointment => Boolean(item && !checkedStops[item.id] && needsTaxiStop(item)));
      } else {
        stops = taxiAppointments.filter(item => !checkedStops[item.id] && needsTaxiStop(item));
      }

      if (!stops.length) {
        toast.error('Selecione pelo menos uma parada pendente para montar a rota.');
        return;
      }
      const validAddresses = requireRouteAddresses(stops.map(item => item.transport?.address));
      const mobile = isMobileMapsClient(navigator.userAgent, window.matchMedia('(pointer: coarse)').matches, window.innerWidth);
      const links = buildGoogleMapsRoutes(qualifyRouteAddresses(validAddresses, routeCity), mobile);
      setRouteLinks(links);
      if (links.length === 1) window.open(links[0], '_blank', 'noopener,noreferrer');
      else toast.info(`O roteiro tem ${links.length} trechos. Abra cada um em ordem para visitar todas as paradas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível montar a rota.');
    }
  };

  // Imprimir manifesto de rota
  const handlePrintManifest = () => {
    window.print();
  };

  const [startingRoute, setStartingRoute] = useState(false);

  // Iniciar rota no Maps e notificar clientes individualmente via WhatsApp
  const handleStartRouteAndNotify = async () => {
    if (routeOrder.length === 0) {
      toast.error('Selecione pelo menos uma parada nos cards abaixo para iniciar a rota.');
      return;
    }

    const stops = routeOrder
      .map(id => taxiAppointments.find(item => item.id === id))
      .filter((item): item is Appointment => Boolean(item && needsTaxiStop(item)));

    if (!stops.length) {
      toast.error('Nenhuma parada pendente na rota selecionada.');
      return;
    }

    try {
      // 1. Abre a rota no Google Maps
      const validAddresses = requireRouteAddresses(stops.map(item => item.transport?.address));
      const mobile = isMobileMapsClient(navigator.userAgent, window.matchMedia('(pointer: coarse)').matches, window.innerWidth);
      const links = buildGoogleMapsRoutes(qualifyRouteAddresses(validAddresses, routeCity), mobile);
      setRouteLinks(links);
      if (links.length === 1) {
        window.open(links[0], '_blank', 'noopener,noreferrer');
      } else if (links.length > 1) {
        window.open(links[0], '_blank', 'noopener,noreferrer');
        toast.info(`O roteiro tem ${links.length} trechos. O 1º trecho foi aberto no Maps.`);
      }

      // 2. Notifica clientes individualmente pelo WhatsApp através da automação
      setStartingRoute(true);
      const res = await api.post<{ total: number; sent: number; results: any[] }>(
        '/petshop/appointments/batch-taxi-departure',
        { appointmentIds: routeOrder },
      );

      const sentCount = res.data?.sent ?? 0;
      if (sentCount > 0) {
        toast.success(`Rota iniciada no Google Maps! ${sentCount} tutor(es) notificado(s) individualmente via WhatsApp.`);
      } else {
        toast.success('Rota iniciada no Google Maps! (Notificações pausadas ou sem telefone cadastrado).');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Erro ao iniciar a rota.');
    } finally {
      setStartingRoute(false);
    }
  };

  const todayStr = localDateKey(new Date());
  const tomorrowStr = localDateKey(new Date(Date.now() + 86400000));

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
              className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              <Navigation size={15} />
              <span className="hidden sm:inline">Manifesto de Rota</span>
              <span className="sm:hidden">Rota</span>
            </button>
            <button
              type="button"
              onClick={handleShareManifestWhatsApp}
              disabled={taxiAppointments.length === 0}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
            >
              <Share2 size={15} />
              <span>WhatsApp</span>
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

      {/* 2. SELETOR DE DATA OPERACIONAL (Fiel ao Mockup Image 2) */}
      <section
        aria-label="Seletor de data operacional"
        className="mb-4 sm:mb-6 rounded-2xl border border-zinc-200/90 bg-white p-3.5 sm:p-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700 shrink-0">
              <Calendar size={18} />
            </span>
            <div>
              <p className="text-xs font-bold text-zinc-900">
                Data das corridas
              </p>
              <p className="text-[11px] text-zinc-400">
                Coletas e entregas de hoje.
              </p>
              {overdueCount > 0 && (
                <p className="text-[10px] font-bold text-amber-800">
                  + {overdueCount} coleta{overdueCount === 1 ? '' : 's'} pendente{overdueCount === 1 ? '' : 's'} de dias anteriores
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-[#0d6e5a] text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(tomorrowStr)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedDate === tomorrowStr
                  ? 'bg-[#0d6e5a] text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80'
              }`}
            >
              Amanhã
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
            />
          </div>
        </div>
      </section>

      {/* 3. CARDS DE RESUMO OPERACIONAL (4 KPIS - Fiel ao Mockup Image 2) */}
      <section
        aria-label="Resumo das corridas do período"
        className="mb-4 sm:mb-6 grid gap-2.5 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >
        {/* Card 1: Falta Buscar */}
        <div
          onClick={() => setActiveTab('pickups')}
          className={`cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition flex items-center gap-3 ${
            activeTab === 'pickups'
              ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-400/20'
              : 'border-amber-200/80 bg-white hover:border-amber-300'
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <Truck size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Falta buscar</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">
                {pendingPickups.length}
              </strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">coletas pendentes</span>
            </div>
          </div>
        </div>

        {/* Card 2: No Pet Shop */}
        <div
          onClick={() => setActiveTab('in_store')}
          className={`cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition flex items-center gap-3 ${
            activeTab === 'in_store'
              ? 'border-sky-400 bg-sky-50/60 ring-2 ring-sky-400/20'
              : 'border-zinc-200/90 bg-white hover:border-zinc-300'
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <Hourglass size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">No Pet Shop</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">
                {inStorePets.length}
              </strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">em atendimento</span>
            </div>
          </div>
        </div>

        {/* Card 3: Prontos p/ levar */}
        <div
          onClick={() => setActiveTab('dropoffs')}
          className={`cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition flex items-center gap-3 ${
            activeTab === 'dropoffs'
              ? 'border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-400/20'
              : 'border-emerald-200/80 bg-white hover:border-emerald-300'
          }`}
        >
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Home size={20} />
            {readyDropoffs.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600" />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" />
              Prontos p/ levar
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-emerald-950 tabular-nums">
                {readyDropoffs.length}
              </strong>
              <span className="truncate text-[11px] sm:text-xs text-emerald-700">levar p/ casa</span>
            </div>
          </div>
        </div>

        {/* Card 4: Entregues */}
        <div
          onClick={() => setActiveTab('delivered')}
          className={`cursor-pointer rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition flex items-center gap-3 ${
            activeTab === 'delivered'
              ? 'border-teal-400 bg-teal-50/60 ring-2 ring-teal-400/20'
              : 'border-zinc-200/90 bg-white hover:border-zinc-300'
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800">
            <CheckCircle2 size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-700">Entregues</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-xl sm:text-2xl font-black text-zinc-900 tabular-nums">
                {deliveredPets.length}
              </strong>
              <span className="truncate text-[11px] sm:text-xs text-zinc-500">corridas concluídas</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3.1 BARRA DE ROTA MONTADA NO TÁXI DOG (INICIAR ROTA & NOTIFICAR) */}
      {routeOrder.length > 0 && (
        <section
          aria-label="Controle de rota montada"
          className="mb-4 sm:mb-6 rounded-2xl border-2 border-teal-600 bg-teal-50/90 p-3.5 sm:p-4 shadow-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-teal-800 text-white font-black text-xs">
                  🚗
                </span>
                <strong className="text-sm font-extrabold text-teal-950">
                  Rota do Táxi Dog Montada · {routeOrder.length} parada(s)
                </strong>
                <span className="text-[11px] font-semibold text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md">
                  Sequência das paradas
                </span>
              </div>
              <p className="text-xs text-teal-900 font-medium break-words">
                {routeOrder.map((id, i) => {
                  const apt = taxiAppointments.find(a => a.id === id);
                  const pet = apt?.pet?.name || 'Pet';
                  const isPre = apt ? isPreCheckinStatus(apt.status) : false;
                  return `${i + 1}ª ${pet} (${isPre ? 'Buscar' : 'Levar'})`;
                }).join(' ➔ ')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={clearRoute}
                className="h-10 px-3.5 rounded-xl border border-teal-200 bg-white text-xs font-bold text-red-600 hover:bg-red-50 hover:border-red-200 transition cursor-pointer shadow-2xs"
              >
                Limpar Rota
              </button>

              <button
                type="button"
                onClick={handleStartRouteAndNotify}
                disabled={startingRoute}
                className="h-10 px-4 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-black flex items-center gap-2 shadow-xs hover:shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {startingRoute ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Iniciando rota & avisando...</span>
                  </>
                ) : (
                  <>
                    <Navigation size={14} />
                    <span>Iniciar Rota no Maps & Notificar Clientes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 4. BARRA DE BUSCA E ABAS OPERACIONAIS */}
      <section aria-label="Abas e busca" className="mb-6 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Abas (Fiel ao Mockup Image 2) */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-2xl overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('pickups')}
              className={`rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'pickups'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>📦 Buscar</span>
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
              className={`rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'dropoffs'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>📦 Prontos p/ Levar</span>
              <span
                className={`rounded-md px-1.5 py-0.2 text-[10px] font-extrabold ${
                  readyDropoffs.length > 0
                    ? 'bg-emerald-100 text-emerald-900 animate-pulse'
                    : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {readyDropoffs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('in_store')}
              className={`rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'in_store'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>🏬 Loja</span>
              <span className="rounded-md bg-zinc-200 text-zinc-600 px-1.5 py-0.2 text-[10px] font-extrabold">
                {inStorePets.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>📑 Todas</span>
              <span className="rounded-md bg-zinc-200 text-zinc-600 px-1.5 py-0.2 text-[10px] font-extrabold">
                {taxiAppointments.length}
              </span>
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
                          {new Date(item.startsAt).getTime() < Date.now() ? 'Coleta atrasada' : 'Aguardando Coleta'}
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

                    {/* Botão de Ordem na Rota (Diretamente no Card) */}
                    {needsTaxiStop(item) && (
                      <div className="mb-3 pt-2 border-t border-zinc-100">
                        {getStopNumber(item.id) > 0 ? (
                          <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-teal-900">
                              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-700 text-white text-[10px] font-black">
                                {getStopNumber(item.id)}
                              </span>
                              <span>{getStopNumber(item.id)}ª PARADA DA ROTA</span>
                            </span>
                            <div className="inline-flex items-center rounded-lg border border-teal-200 bg-white p-0.5 shadow-2xs">
                              <button
                                type="button"
                                disabled={getStopNumber(item.id) === 1}
                                onClick={() => moveStop(item.id, 'up')}
                                title="Mover para parada anterior"
                                className="px-2 py-0.5 text-xs font-black text-teal-800 hover:bg-teal-50 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={getStopNumber(item.id) === routeOrder.length}
                                onClick={() => moveStop(item.id, 'down')}
                                title="Mover para próxima parada"
                                className="px-2 py-0.5 text-xs font-black text-teal-800 hover:bg-teal-50 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleRouteStop(item.id)}
                                title="Remover da rota"
                                className="px-2 py-0.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleRouteStop(item.id)}
                            className="w-full flex h-8 items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-600/70 bg-teal-50/60 hover:bg-teal-100/70 text-xs font-bold text-teal-800 transition cursor-pointer"
                          >
                            <span>+ Incluir na rota</span>
                            <span className="text-[11px] font-semibold text-teal-600">
                              ({routeOrder.length + 1}ª parada)
                            </span>
                          </button>
                        )}
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
                        onClick={() => navigate(`/petshop/agenda?date=${localDateKey(new Date(item.startsAt))}&appointment=${encodeURIComponent(item.id)}`)}
                        disabled={isUpdating}
                        className="w-full flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-xs transition disabled:opacity-50 cursor-pointer"
                      >
                        {isUpdating ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <span>Entrega realizada · Abrir cobrança</span>
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
              Manifesto operacional de transporte do dia. Marque cada visita como concluída após atender.
            </p>

            {overdueCount > 0 && <p className="text-xs font-semibold text-amber-800">Inclui {overdueCount} coleta{overdueCount === 1 ? '' : 's'} pendente{overdueCount === 1 ? '' : 's'} de dias anteriores.</p>}

            {/* Barra de Ações e Resumo Ordenado */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-zinc-900">
                    {routeOrder.length > 0 ? (
                      <span>
                        🚗 <strong className="text-teal-800 font-extrabold">{routeOrder.length} parada(s)</strong> na rota ordenada
                      </span>
                    ) : (
                      <span>{taxiAppointments.length} paradas no manifesto</span>
                    )}
                  </p>
                  {routeOrder.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearRoute}
                      className="text-[11px] font-bold text-red-600 hover:text-red-800 underline cursor-pointer"
                    >
                      Limpar rota
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={selectAllInSequence}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                    >
                      Marcar todas em sequência (1ª, 2ª, 3ª...)
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500">
                  {routeOrder.length > 0
                    ? 'Paradas na ordem selecionada. Use a tela principal para iniciar a navegação no Maps.'
                    : 'Você pode selecionar e ordenar as paradas diretamente nos cards da tela principal.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintManifest}
                  className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 px-3 py-2 text-xs font-bold hover:bg-zinc-50 cursor-pointer shadow-2xs transition"
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareManifestWhatsApp}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-2 text-xs font-bold hover:bg-emerald-100 cursor-pointer shadow-2xs transition"
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
                    {needsTaxiStop(item) && !isChecked && (
                      <div className="mt-2" onClick={event => event.stopPropagation()}>
                        {getStopNumber(item.id) > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-black text-white shadow-xs">
                              <Navigation size={12} className="rotate-45" />
                              {getStopNumber(item.id)}ª PARADA
                            </span>
                            <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                              <button
                                type="button"
                                disabled={getStopNumber(item.id) === 1}
                                onClick={() => moveStop(item.id, 'up')}
                                title="Mover para parada anterior"
                                className="px-2 py-0.5 text-xs font-black text-zinc-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={getStopNumber(item.id) === routeOrder.length}
                                onClick={() => moveStop(item.id, 'down')}
                                title="Mover para próxima parada"
                                className="px-2 py-0.5 text-xs font-black text-zinc-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleRouteStop(item.id)}
                                title="Remover da rota"
                                className="px-2 py-0.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleRouteStop(item.id)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-teal-600/70 bg-teal-50/60 px-3 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 hover:border-teal-700 cursor-pointer transition shadow-2xs"
                          >
                            + Definir como {routeOrder.length + 1}ª parada
                          </button>
                        )}
                      </div>
                    )}

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
