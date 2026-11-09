import { uniqueStagePhotos } from './appointment-media';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  Camera,
  Car,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Heart,
  Info,
  MapPin,
  Package,
  PawPrint,
  RefreshCw,
  Scissors,
  Search,
  ShieldCheck,
  Sparkles,
  Syringe,
  UserRound,
  X,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { resolveAppointmentSteps, type StageHistoryEntry } from './types';
import { inputClass, labelClass, PetAvatar, PetHeroShowcase, primaryButton } from './ui';
import './petshop.css';

const appointmentStatus: Record<string, string> = {
  requested: 'Aguardando confirmação',
  scheduled: 'Horário confirmado',
  checked_in: 'Recebido (Check-in)',
  bathing: 'No banho',
  grooming: 'Na tosa',
  finishing: 'Em finalização / perfume',
  ready: 'Pronto para buscar!',
  delivered: 'Entregue ao tutor',
};

const trackerSteps = [
  { key: 'checked_in', label: 'Recebido', shortDesc: 'Pet acomodado com carinho' },
  { key: 'bathing', label: 'Banho', shortDesc: 'Banho quentinho e higiene' },
  { key: 'grooming', label: 'Tosa & Cuidados', shortDesc: 'Estética, unhas e pelagem' },
  { key: 'finishing', label: 'Finalização', shortDesc: 'Secagem, escova e perfume' },
  { key: 'ready', label: 'Pronto!', shortDesc: 'Pode vir buscar seu pet!' },
] as const;

const liveStatuses = new Set(['checked_in', 'bathing', 'grooming', 'finishing', 'ready']);

function playReadyChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.36);
    });
  } catch {}
}

function resolvePortalServicePrice(service: any, pet?: any): { price: number; durationMinutes: number } {
  const basePrice = Number(service?.price || 0);
  const baseDuration = Number(service?.durationMinutes || 60);
  if (!pet || !Array.isArray(service?.pricingRules) || service.pricingRules.length === 0) {
    return { price: basePrice, durationMinutes: baseDuration };
  }
  const species = pet.species || 'all';
  const size = pet.size || 'all';
  const coatType = pet.coatType || 'all';
  let bestRule: any = null;
  let bestScore = -1;
  for (const r of service.pricingRules) {
    const spOk = r.species === 'all' || r.species === species;
    const szOk = r.size === 'all' || r.size === size;
    const ctOk = r.coatType === 'all' || r.coatType === coatType;
    if (!spOk || !szOk || !ctOk) continue;
    let score = 0;
    if (r.size === size && size !== 'all') score += 4;
    if (r.coatType === coatType && coatType !== 'all') score += 2;
    if (r.species === species && species !== 'all') score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestRule = r;
    }
  }
  if (bestRule) {
    return {
      price: Number(bestRule.price ?? basePrice),
      durationMinutes: Number(bestRule.durationMinutes || baseDuration),
    };
  }
  return { price: basePrice, durationMinutes: baseDuration };
}

function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function PetClientPortalPage() {
  const { shopId = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption?: string; petName: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'schedule' | 'appointments' | 'pets' | 'packages'>('schedule');
  const [serviceSearch, setServiceSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Estado do formulário de agendamento
  const [form, setForm] = useState({
    petId: '',
    startsAt: '',
    serviceIds: [] as string[],
    transport: false,
    transportType: 'round_trip', // round_trip, pickup_only, dropoff_only
    notes: '',
  });

  // Modais de cancelamento e reagendamento pelo cliente tutor
  const [clientCancelModal, setClientCancelModal] = useState<any | null>(null);
  const [clientCancelReason, setClientCancelReason] = useState('');
  const [clientCancelSaving, setClientCancelSaving] = useState(false);

  const [clientRescheduleModal, setClientRescheduleModal] = useState<any | null>(null);
  const [clientRescheduleStartsAt, setClientRescheduleStartsAt] = useState('');
  const [clientRescheduleSaving, setClientRescheduleSaving] = useState(false);

  const previousStatusesRef = useRef<Record<string, string>>({});
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || '';

  const load = useCallback(
    async (silent = false) => {
      if (!token) {
        setError('Link de acesso incompleto.');
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        const response = await api.get(`/petshop/public/${shopId}`, {
          headers: { 'X-Pet-Portal-Token': token },
          skipAuthRedirect: true,
        } as any);
        const payload = response.data;

        // Notificação sonora caso algum pet fique pronto
        const appointments: any[] = payload.appointments || [];
        appointments.forEach(app => {
          const prev = previousStatusesRef.current[app.id];
          if (prev && prev !== app.status && app.status === 'ready') {
            playReadyChime();
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate([200, 100, 200]);
              } catch {}
            }
          }
          previousStatusesRef.current[app.id] = app.status;
        });

        setData(payload);
        setLastUpdated(new Date());
        setError('');
        setForm(current => {
          if (!current.petId && payload.customer?.pets?.[0]) {
            return { ...current, petId: payload.customer.pets[0].id };
          }
          return current;
        });
      } catch (requestError: any) {
        if (!silent) {
          setError(requestError.response?.data?.message || 'Não foi possível abrir sua área.');
        }
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [shopId, token],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  // Atualização em tempo real a cada 15s
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(true);
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [load, token]);

  const selectedPet = useMemo(() => {
    if (!data?.customer?.pets?.length) return null;
    return data.customer.pets.find((p: any) => p.id === form.petId) || data.customer.pets[0];
  }, [data, form.petId]);

  // Checa se o pet selecionado tem pacote ativo com sessões disponíveis
  const activePackageForSelectedPet = useMemo(() => {
    if (!data?.packages?.length || !selectedPet) return null;
    return data.packages.find((pkg: any) => pkg.petId === selectedPet.id && pkg.status === 'active');
  }, [data, selectedPet]);

  // Verifica se um serviço específico é coberto pelo pacote ativo do pet
  const isServiceCoveredByPackage = useCallback(
    (serviceId: string) => {
      if (!activePackageForSelectedPet?.items?.length) return false;
      const item = activePackageForSelectedPet.items.find((i: any) => i.serviceId === serviceId);
      return item && item.totalQty > item.usedQty;
    },
    [activePackageForSelectedPet],
  );

  const categories = useMemo(() => {
    if (!data?.services?.length) return [];
    const set = new Set<string>();
    data.services.forEach((s: any) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [data]);

  const filteredServices = useMemo(() => {
    if (!data?.services?.length) return [];
    return data.services.filter((svc: any) => {
      const matchSearch =
        !serviceSearch ||
        svc.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        (svc.description && svc.description.toLowerCase().includes(serviceSearch.toLowerCase()));
      const matchCat = categoryFilter === 'all' || svc.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [data, serviceSearch, categoryFilter]);

  const liveAppointments = useMemo(
    () => (data?.appointments || []).filter((item: any) => liveStatuses.has(item.status)),
    [data],
  );

  const upcomingAppointments = useMemo(
    () => (data?.appointments || []).filter((item: any) => !liveStatuses.has(item.status)),
    [data],
  );

  // Cálculo do total estimado e duração dos serviços selecionados
  const summaryEstimate = useMemo(() => {
    if (!data?.services?.length || !form.serviceIds.length) {
      return { total: 0, durationMinutes: 0, coveredCount: 0 };
    }
    let total = 0;
    let durationMinutes = 0;
    let coveredCount = 0;

    data.services.forEach((svc: any) => {
      if (form.serviceIds.includes(svc.id)) {
        const resolved = resolvePortalServicePrice(svc, selectedPet);
        durationMinutes += resolved.durationMinutes;
        if (isServiceCoveredByPackage(svc.id)) {
          coveredCount++;
        } else {
          total += resolved.price;
        }
      }
    });

    return { total, durationMinutes, coveredCount };
  }, [data, form.serviceIds, selectedPet, isServiceCoveredByPackage]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.petId) {
      setError('Por favor, selecione o pet.');
      return;
    }
    if (!form.serviceIds.length) {
      setError('Por favor, selecione ao menos um serviço para o atendimento.');
      return;
    }
    if (!form.startsAt) {
      setError('Por favor, informe a data e horário desejados.');
      return;
    }
    if (form.transport && !data.customer?.address?.trim()) {
      setError('Para solicitar Táxi Dog, confirme primeiro seu endereço com o pet shop.');
      return;
    }

    setSending(true);
    setError('');

    // Prepara as notas com transporte se flegado
    let compiledNotes = form.notes.trim();
    if (form.transport) {
      const transportLabels: Record<string, string> = {
        round_trip: 'Buscar e Levar (Ida e Volta)',
        pickup_only: 'Apenas Buscar no Tutor',
        dropoff_only: 'Apenas Levar para Casa',
      };
      const clientAddr = data.customer?.address || 'Endereço a confirmar';
      const transportNote = `[Solicitado Táxi Dog: ${transportLabels[form.transportType] || 'Sim'} · Endereço: ${clientAddr}]`;
      compiledNotes = compiledNotes ? `${compiledNotes}\n${transportNote}` : transportNote;
    }

    try {
      await api.post(
        `/petshop/public/${shopId}/appointments`,
        {
          petId: form.petId,
          serviceIds: form.serviceIds,
          startsAt: new Date(form.startsAt).toISOString(),
          notes: compiledNotes,
          transport: form.transport ? { enabled: true, mode: form.transportType, address: data.customer?.address || '' } : undefined,
        },
        { headers: { 'X-Pet-Portal-Token': token }, skipAuthRedirect: true } as any,
      );
      setSent(true);
      await load(true);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Não foi possível enviar a solicitação.');
    } finally {
      setSending(false);
    }
  };

  const handleSelectDay = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(9, 0, 0, 0);
    // Formata para YYYY-MM-DDTHH:mm
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
    setForm(prev => ({ ...prev, startsAt: localISOTime }));
  };

  const handleClientCancelConfirm = async () => {
    if (!clientCancelModal) return;
    setClientCancelSaving(true);
    try {
      await api.patch(
        `/petshop/public/${shopId}/appointments/${clientCancelModal.id}/cancel`,
        { reason: clientCancelReason.trim() || 'Cancelado pelo tutor via portal' },
        { headers: { 'X-Pet-Portal-Token': token }, skipAuthRedirect: true } as any,
      );
      toast.success('Agendamento cancelado com sucesso.');
      setClientCancelModal(null);
      setClientCancelReason('');
      await load(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao cancelar agendamento.');
    } finally {
      setClientCancelSaving(false);
    }
  };

  const handleClientRescheduleConfirm = async () => {
    if (!clientRescheduleModal || !clientRescheduleStartsAt) {
      toast.error('Selecione uma nova data e horário.');
      return;
    }
    setClientRescheduleSaving(true);
    try {
      await api.patch(
        `/petshop/public/${shopId}/appointments/${clientRescheduleModal.id}/reschedule`,
        { startsAt: new Date(clientRescheduleStartsAt).toISOString() },
        { headers: { 'X-Pet-Portal-Token': token }, skipAuthRedirect: true } as any,
      );
      toast.success('Horário reagendado com sucesso!');
      setClientRescheduleModal(null);
      setClientRescheduleStartsAt('');
      await load(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao reagendar horário.');
    } finally {
      setClientRescheduleSaving(false);
    }
  };

  if (error && !data) {
    return (
      <div className="petcare-shell grid min-h-screen place-items-center p-6 text-center">
        <div className="pc-panel max-w-md p-7">
          <PawPrint aria-hidden="true" className="mx-auto mb-4 text-[var(--pc-text-muted)]" size={36} />
          <h1 className="text-xl font-semibold">Acesso indisponível</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--pc-text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="petcare-shell grid min-h-screen place-items-center" role="status">
        <div className="flex items-center gap-3 text-sm font-medium text-[var(--pc-text-secondary)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--pc-border-strong)] border-t-[var(--pc-action)]" />
          Preparando a área do seu pet…
        </div>
      </div>
    );
  }

  return (
    <div className="petcare-shell min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header do Pet Shop (com Safe-Area nativa para Notch do iPhone) */}
      <header
        className="sticky top-0 z-30 border-b border-[var(--pc-border)] bg-white/95 backdrop-blur"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {data.shop.logoUrl ? (
              <img
                src={getFullUrl(data.shop.logoUrl)}
                alt={`Logo de ${data.shop.name}`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-xl object-contain border border-zinc-200"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-xl bg-teal-800 text-white font-bold"
              >
                <PawPrint size={20} />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-zinc-900 leading-tight">{data.shop.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Agendamento Online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load(false)}
              disabled={refreshing}
              title="Atualizar dados"
              className="flex min-h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-teal-700' : ''} />
              <span className="hidden sm:inline">Atualizar</span>
              {lastUpdated && (
                <span className="text-[11px] font-normal text-zinc-400">
                  {formatTime(lastUpdated.toISOString())}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {/* 2. Banner de Acompanhamento ao Vivo Simplificado (Apenas se houver pet hoje) */}
        {liveAppointments.length > 0 && (
          <section className="mb-5 space-y-2.5" aria-label="Status do atendimento de hoje">
            {liveAppointments.map((app: any) => {
              const isReady = app.status === 'ready';
              const rawSteps = resolveAppointmentSteps(app);
              const appointmentSteps = rawSteps.map(s => {
                const defaultTrack = trackerSteps.find(t => t.key === s.key);
                return {
                  key: s.key,
                  label: s.label || defaultTrack?.label || s.key,
                };
              });
              const currentStepIndex = appointmentSteps.findIndex(s => s.key === app.status);

              return (
                <div
                  key={app.id}
                  className={`rounded-2xl border p-3.5 sm:p-4 transition-all shadow-xs ${
                    isReady
                      ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
                      : 'border-teal-200 bg-teal-50/60 text-teal-950'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PetAvatar pet={app.pet} size="md" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              isReady ? 'bg-emerald-600 text-white' : 'bg-teal-700 text-white'
                            }`}
                          >
                            {isReady ? <BellRing size={12} /> : <Clock3 size={12} />}
                            {isReady ? app.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(app.transport.mode) ? 'Pronto para entrega!' : 'Pronto para buscar!' : appointmentStatus[app.status] || 'Em atendimento'}
                          </span>
                          <span className="text-xs text-zinc-500 font-medium">
                            Início às {formatTime(app.startsAt)}
                          </span>
                        </div>
                        <h2 className="text-sm font-bold text-zinc-900 mt-0.5">
                          {isReady
                            ? app.transport?.enabled && ['round_trip', 'both', 'dropoff_only', 'dropoff'].includes(app.transport.mode)
                              ? `✨ ${app.pet.name} está prontinho(a)! Avisaremos quando o Táxi Dog sair para a entrega.`
                              : `✨ ${app.pet.name} está prontinho(a)! Você já pode vir buscar!`
                            : `🐾 ${app.pet.name} está sendo cuidado(a) com muito carinho.`}
                        </h2>
                        <p className="text-xs text-zinc-600">
                          {app.services.map((s: any) => s.nameSnapshot).join(' + ')}
                          {app.transport?.enabled && ' · 🚐 Com Táxi Dog'}
                        </p>
                      </div>
                    </div>

                    {/* Botão de Foto se enviada */}
                    {app.stagePhotoUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxPhoto({
                            url: getFullUrl(app.stagePhotoUrl),
                            caption: app.stageNotes,
                            petName: app.pet.name,
                          })
                        }
                        className="inline-flex items-center gap-1.5 self-start sm:self-center rounded-xl bg-white border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-2xs hover:bg-teal-50 transition"
                      >
                        <Camera size={13} />
                        Ver foto enviada
                      </button>
                    )}
                  </div>

                  {/* Mini trilha de progresso discreta */}
                  <div className="mt-3 pt-2.5 border-t border-black/5 flex items-center justify-between text-[11px] font-medium text-zinc-500">
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {appointmentSteps.map((st, idx) => {
                        const isDone = idx < currentStepIndex || isReady;
                        const isCurrent = idx === currentStepIndex && !isReady;
                        return (
                          <span
                            key={st.key}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                              isCurrent
                                ? 'bg-teal-700 text-white shadow-2xs'
                                : isDone
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-black/5 text-zinc-400'
                            }`}
                          >
                            {isDone ? '✓ ' : ''}
                            {st.label}
                          </span>
                        );
                      })}
                    </div>
                    <span className="hidden sm:inline text-[11px] text-zinc-400">
                      Avisos automáticos enviados no seu WhatsApp
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 3. Saudação & Apresentação */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-zinc-200/90 bg-gradient-to-r from-teal-900 via-teal-800 to-teal-900 p-5 text-white shadow-xs">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700/60 border border-teal-500/30 px-3 py-1 text-xs font-semibold text-teal-100">
              <Sparkles size={13} /> Área Exclusiva do Cliente
            </span>
            <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight">
              Olá, {data.customer.name.split(' ')[0]}!
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-teal-100/90 max-w-xl">
              Agende os cuidados do seu pet com rapidez, consulte os serviços disponíveis e acompanhe seus horários.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {data.packages?.length > 0 && (
              <div className="rounded-xl bg-white/10 backdrop-blur-xs border border-white/15 px-3 py-2 text-right">
                <span className="block text-[10px] uppercase font-bold text-teal-200">Seu Pacote Ativo</span>
                <span className="text-xs font-semibold text-white">
                  {data.packages[0]?.name || 'Plano de Cuidados'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Abas Principais de Navegação (Cabe 100% no celular sem cortar) */}
        <nav
          className={`mb-6 grid gap-1.5 p-1.5 bg-zinc-100 rounded-2xl border border-zinc-200/80 ${
            data.packages?.length > 0 ? 'grid-cols-4' : 'grid-cols-3'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1.5 text-xs font-bold transition text-center cursor-pointer select-none ${
              activeTab === 'schedule'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
            }`}
          >
            <Calendar size={14} className="shrink-0" />
            <span className="truncate">Agendar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('appointments')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1.5 text-xs font-bold transition text-center cursor-pointer select-none ${
              activeTab === 'appointments'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
            }`}
          >
            <CalendarCheck2 size={14} className="shrink-0" />
            <span className="truncate">Horários</span>
            {upcomingAppointments.length > 0 && (
              <span
                className={`rounded-full px-1.5 text-[9px] font-extrabold ${
                  activeTab === 'appointments'
                    ? 'bg-white text-teal-800'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {upcomingAppointments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pets')}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1.5 text-xs font-bold transition text-center cursor-pointer select-none ${
              activeTab === 'pets'
                ? 'bg-teal-800 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
            }`}
          >
            <PawPrint size={14} className="shrink-0" />
            <span className="truncate">Pets ({data.customer.pets.length})</span>
          </button>

          {data.packages?.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('packages')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1.5 text-xs font-bold transition text-center cursor-pointer select-none ${
                activeTab === 'packages'
                  ? 'bg-teal-800 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70'
              }`}
            >
              <Package size={14} className="shrink-0" />
              <span className="truncate">Pacotes</span>
            </button>
          )}
        </nav>

        {/* 5. ABA 1: NOVO AGENDAMENTO (FOCO PRINCIPAL) */}
        {activeTab === 'schedule' && (
          <section aria-labelledby="schedule-heading">
            {sent ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8 text-center animate-in fade-in duration-200 max-w-xl mx-auto shadow-sm">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm mb-3">
                  <CheckCircle2 size={30} />
                </div>
                <h2 className="text-xl font-bold text-emerald-950">Solicitação Enviada com Sucesso!</h2>
                <p className="mt-2 text-sm text-emerald-800 leading-relaxed">
                  Recebemos seu pedido de agendamento para <strong>{selectedPet?.name}</strong>. Nossa equipe irá
                  confirmar a disponibilidade e você receberá uma notificação pelo WhatsApp!
                </p>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-white p-4 text-left text-xs space-y-1.5 shadow-2xs">
                  <p className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Resumo do Pedido</p>
                  <p className="text-zinc-900 font-medium">
                    📅 <strong>Data e Hora:</strong>{' '}
                    {form.startsAt ? new Date(form.startsAt).toLocaleString('pt-BR') : 'A definir'}
                  </p>
                  <p className="text-zinc-900 font-medium">
                    🐾 <strong>Pet:</strong> {selectedPet?.name}
                  </p>
                  {form.transport && (
                    <p className="text-amber-800 font-semibold">
                      🚐 <strong>Com Táxi Dog Solicitado</strong>
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setForm(prev => ({ ...prev, serviceIds: [], notes: '' }));
                    }}
                    className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition cursor-pointer"
                  >
                    Agendar para outro Pet
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('appointments')}
                    className="rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 transition cursor-pointer"
                  >
                    Ver Meus Horários
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                {/* Passo 1: Seleção do Pet */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-800 text-white text-xs font-extrabold">
                          1
                        </span>
                        Para qual pet é o agendamento?
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Selecione o animal para agendamento dos cuidados
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {data.customer.pets.map((pet: any) => {
                      const isSelected = form.petId === pet.id;
                      const pkg = data.packages?.find(
                        (p: any) => p.petId === pet.id && p.status === 'active',
                      );
                      const sizeLabels: Record<string, string> = {
                        mini: 'Mini / Porte Pequeno',
                        small: 'Porte Pequeno',
                        medium: 'Porte Médio',
                        large: 'Porte Grande',
                        giant: 'Porte Gigante',
                      };

                      return (
                        <div
                          key={pet.id}
                          onClick={() => setForm(prev => ({ ...prev, petId: pet.id }))}
                          className={`relative flex items-center gap-3.5 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                            isSelected
                              ? 'border-teal-700 bg-teal-50/70 shadow-xs'
                              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'
                          }`}
                        >
                          <PetAvatar pet={pet} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-zinc-900 truncate">{pet.name}</h3>
                              {isSelected && (
                                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-700 text-white text-[10px]">
                                  <Check size={12} strokeWidth={3} />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 truncate">
                              {pet.breed || (pet.species === 'cat' ? 'Gato' : 'Cão')}
                            </p>
                            <p className="text-[11px] text-zinc-400 font-medium">
                              {sizeLabels[pet.size] || 'Porte padrão'}
                            </p>

                            {pkg && (
                              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                <Package size={10} /> Pacote Ativo
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Passo 2: Seleção de Serviços com Preços Dinâmicos */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-800 text-white text-xs font-extrabold">
                          2
                        </span>
                        Quais serviços você gostaria de solicitar?
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Selecione os cuidados desejados para{' '}
                        <strong className="text-zinc-800">{selectedPet?.name || 'seu pet'}</strong>
                      </p>
                    </div>

                    {/* Busca Rápida de Serviços */}
                    <div className="relative w-full sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Buscar serviço..."
                        value={serviceSearch}
                        onChange={e => setServiceSearch(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50/70 pl-8 pr-3 py-1.5 text-xs focus:bg-white focus:border-teal-700 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Filtro de Categorias se houver */}
                  {categories.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 no-scrollbar border-b border-zinc-100">
                      <button
                        type="button"
                        onClick={() => setCategoryFilter('all')}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                          categoryFilter === 'all'
                            ? 'bg-teal-800 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        Todos ({data.services.length})
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                            categoryFilter === cat
                              ? 'bg-teal-800 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Grid de Serviços */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredServices.map((svc: any) => {
                      const isChecked = form.serviceIds.includes(svc.id);
                      const resolved = resolvePortalServicePrice(svc, selectedPet);
                      const isCovered = isServiceCoveredByPackage(svc.id);

                      return (
                        <div
                          key={svc.id}
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              serviceIds: isChecked
                                ? prev.serviceIds.filter(id => id !== svc.id)
                                : [...prev.serviceIds, svc.id],
                            }));
                          }}
                          className={`flex flex-col justify-between p-3.5 rounded-2xl border-2 cursor-pointer transition select-none ${
                            isChecked
                              ? 'border-teal-700 bg-teal-50/80 shadow-xs'
                              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-zinc-900 leading-snug">{svc.name}</h3>
                              <div
                                className={`grid h-5 w-5 place-items-center rounded-md border transition shrink-0 ${
                                  isChecked
                                    ? 'bg-teal-700 border-teal-700 text-white'
                                    : 'border-zinc-300 bg-white'
                                }`}
                              >
                                {isChecked && <Check size={13} strokeWidth={3} />}
                              </div>
                            </div>
                            {svc.description && (
                              <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                                {svc.description}
                              </p>
                            )}
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                              <Clock3 size={12} />
                              {resolved.durationMinutes} min
                            </span>

                            {isCovered && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                <Package size={12} /> Incluso no Pacote
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredServices.length === 0 && (
                    <p className="text-center text-xs text-zinc-400 py-6">
                      Nenhum serviço encontrado com esse filtro.
                    </p>
                  )}
                </div>

                {/* Passo 3: Data e Horário */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-800 text-white text-xs font-extrabold">
                          3
                        </span>
                        Quando você prefere trazer o pet?
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Escolha uma data e horário sugeridos. Confirmaremos na sequência.
                      </p>
                    </div>
                  </div>

                  {/* Atalhos Rápidos de Dias */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => handleSelectDay(0)}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                    >
                      Hoje às 09:00
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectDay(1)}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                    >
                      Amanhã às 09:00
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectDay(2)}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                    >
                      Depois de amanhã
                    </button>
                  </div>

                  <div className="max-w-md">
                    <label className="block">
                      <span className="text-xs font-semibold text-zinc-700 mb-1 block">
                        Data e horário desejados *
                      </span>
                      <input
                        required
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={e => setForm(prev => ({ ...prev, startsAt: e.target.value }))}
                        className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm font-medium text-zinc-900 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                      />
                    </label>
                  </div>
                </div>

                {/* Passo 4: Táxi Dog (Transporte do Animal) */}
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5 shadow-xs">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.transport}
                      onChange={e => setForm(prev => ({ ...prev, transport: e.target.checked }))}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-teal-800 focus:ring-teal-700"
                    />
                    <div>
                      <span className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
                        <Car size={16} /> Precisa que a gente busque ou entregue o pet? (Táxi Dog)
                      </span>
                      <p className="text-xs text-amber-900/80 mt-0.5">
                        Temos transporte seguro e climatizado para maior comodidade.
                      </p>
                    </div>
                  </label>

                  {form.transport && (
                    <div className="mt-4 pt-4 border-t border-amber-200/70 space-y-3 animate-in fade-in duration-150">
                      <div>
                        <span className="text-xs font-semibold text-amber-950 mb-1.5 block">
                          Modalidade do Transporte:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'round_trip', label: 'Buscar e Levar (Ida e Volta)' },
                            { key: 'pickup_only', label: 'Apenas Buscar' },
                            { key: 'dropoff_only', label: 'Apenas Levar' },
                          ].map(t => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, transportType: t.key }))}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                                form.transportType === t.key
                                  ? 'bg-amber-800 text-white shadow-2xs'
                                  : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100/50'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {data.customer.address && (
                        <div className="rounded-xl border border-amber-200 bg-white p-3 text-xs text-amber-950 flex items-start gap-2">
                          <MapPin size={15} className="text-amber-800 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold block">Endereço de Coleta:</span>
                            <span>{data.customer.address}</span>
                            {data.customer.reference && (
                              <span className="block text-[11px] text-zinc-500 mt-0.5">
                                Ref: {data.customer.reference}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Passo 5: Observações do Pet */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-5 shadow-xs">
                  <label className="block">
                    <span className="text-sm font-bold text-zinc-900 mb-1 block">
                      Observações ou cuidados especiais (Opcional)
                    </span>
                    <textarea
                      rows={2}
                      placeholder="Ex: Alergia a algum produto, assustado com secador, tosa baixa nas patinhas..."
                      value={form.notes}
                      onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-xs text-zinc-900 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                    />
                  </label>
                </div>

                {/* Barra de Resumo e Confirmação */}
                <div className="rounded-2xl border-2 border-teal-700 bg-gradient-to-r from-teal-900 to-teal-800 p-4 sm:p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-200">
                        Resumo do Agendamento
                      </span>
                      {summaryEstimate.durationMinutes > 0 && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-teal-100">
                          ⏱️ ~{summaryEstimate.durationMinutes} min de atendimento
                        </span>
                      )}
                    </div>
                    <p className="text-base sm:text-lg font-bold text-white mt-1">
                      {form.serviceIds.length === 0
                        ? 'Selecione os serviços acima'
                        : `${form.serviceIds.length} serviço(s) selecionado(s) para ${selectedPet?.name}`}
                    </p>
                    {summaryEstimate.coveredCount > 0 && (
                      <p className="text-xs text-emerald-300 font-semibold mt-0.5">
                        ✨ {summaryEstimate.coveredCount} serviço(s) coberto(s) pelo seu pacote!
                      </p>
                    )}
                  </div>

                  <div className="flex items-center w-full sm:w-auto">
                    <button
                      type="submit"
                      disabled={sending || form.serviceIds.length === 0 || !form.startsAt}
                      className="w-full sm:w-auto justify-center rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-extrabold text-white shadow-lg transition cursor-pointer flex items-center gap-2"
                    >
                      {sending ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <CalendarCheck2 size={18} />
                          Solicitar Agendamento
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}
              </form>
            )}
          </section>
        )}

        {/* 6. ABA 2: MEUS HORÁRIOS & HISTÓRICO */}
        {activeTab === 'appointments' && (
          <section className="space-y-6" aria-labelledby="appointments-heading">
            {/* Próximos Horários */}
            <div className="rounded-2xl border border-zinc-200/90 bg-white overflow-hidden shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5 sm:px-5">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-teal-800" />
                  <h2 className="text-sm font-bold text-zinc-900">Próximos horários agendados</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="text-xs font-bold text-teal-800 hover:underline"
                >
                  + Novo agendamento
                </button>
              </div>

              {upcomingAppointments.length ? (
                <div className="divide-y divide-zinc-100">
                  {upcomingAppointments.map((appointment: any) => (
                    <article
                      key={appointment.id}
                      className="grid gap-2 px-4 py-4 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-center sm:px-5 hover:bg-zinc-50/50 transition"
                    >
                      <p className="flex items-center gap-2 text-xs font-bold text-zinc-800 tabular-nums">
                        <Clock3 size={15} className="text-teal-700" />
                        {new Date(appointment.startsAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900">{appointment.pet.name}</h3>
                          {appointment.transport?.enabled && (
                            <span className="rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              🚐 Táxi Dog
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {appointment.services
                            .map((service: any) => service.nameSnapshot)
                            .join(' + ')}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            appointment.status === 'requested'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {appointmentStatus[appointment.status] || 'Confirmado'}
                        </span>

                        {(appointment.status === 'requested' || appointment.status === 'scheduled') && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setClientRescheduleModal(appointment);
                                setClientRescheduleStartsAt(new Date(appointment.startsAt).toISOString().slice(0, 16));
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-200 bg-teal-50 text-[11px] font-bold text-teal-900 hover:bg-teal-100 transition cursor-pointer"
                              title="Reagendar horário"
                            >
                              <CalendarDays size={12} />
                              Reagendar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setClientCancelModal(appointment);
                                setClientCancelReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                              title="Cancelar este agendamento"
                            >
                              <XCircle size={12} />
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-xs text-zinc-500">
                  <p>Você não possui nenhum horário futuro marcado.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('schedule')}
                    className="mt-2 text-xs font-bold text-teal-800 hover:underline"
                  >
                    Clique aqui para solicitar um horário agora
                  </button>
                </div>
              )}
            </div>

            {/* Histórico dos Últimos Cuidados */}
            {Array.isArray(data.recentHistory) && data.recentHistory.length > 0 && (
              <div className="rounded-2xl border border-zinc-200/90 bg-white overflow-hidden shadow-xs">
                <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3.5 sm:px-5">
                  <Scissors size={18} className="text-teal-800" />
                  <h2 className="text-sm font-bold text-zinc-900">Últimos atendimentos realizados</h2>
                </div>

                <div className="divide-y divide-zinc-100">
                  {data.recentHistory.map((item: any) => (
                    <article
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5 hover:bg-zinc-50/50 transition"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {item.stagePhotoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxPhoto({
                                url: getFullUrl(item.stagePhotoUrl),
                                caption: item.stageNotes,
                                petName: item.pet.name,
                              })
                            }
                            className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-200 shadow-2xs hover:scale-105 transition"
                          >
                            <img
                              src={getFullUrl(item.stagePhotoUrl)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <PetAvatar pet={item.pet} size="sm" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-zinc-900">{item.pet.name}</p>
                          <p className="truncate text-xs text-zinc-500">
                            {item.services.map((s: any) => s.nameSnapshot).join(' + ')} ·{' '}
                            {new Date(item.startsAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center shrink-0">
                        <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-1 text-[11px] font-bold">
                          Concluído
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 7. ABA 3: MEUS PETS & VACINAS */}
        {activeTab === 'pets' && (
          <section className="space-y-4" aria-labelledby="pets-heading">
            <div className="grid gap-4 sm:grid-cols-2">
              {data.customer.pets.map((pet: any) => (
                <article key={pet.id} className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-3.5">
                    <PetAvatar pet={pet} size="lg" />
                    <div>
                      <h3 className="text-base font-bold text-zinc-900">{pet.name}</h3>
                      <p className="text-xs text-zinc-500 font-medium">
                        {pet.breed || (pet.species === 'cat' ? 'Gato' : 'Cão')}
                        {pet.weight ? ` · ${Number(pet.weight)} kg` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setForm(prev => ({ ...prev, petId: pet.id }));
                          setActiveTab('schedule');
                        }}
                        className="mt-1 text-xs font-bold text-teal-800 hover:underline inline-flex items-center gap-1"
                      >
                        <Calendar size={12} /> Agendar para {pet.name}
                      </button>
                    </div>
                  </div>

                  {/* Carteira de Vacinação */}
                  {data?.shop?.modulos?.petshopVacinas !== false && (
                    <div className="mt-4 border-t border-zinc-100 pt-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-zinc-800">
                        <Syringe size={14} className="text-teal-700" />
                        Carteira de vacinação
                      </p>
                      {pet.vaccinations?.length ? (
                        <div className="space-y-1.5">
                          {pet.vaccinations.slice(0, 4).map((vaccine: any) => (
                            <div
                              key={vaccine.id}
                              className="flex items-center justify-between text-xs py-1 border-b border-zinc-50 last:border-0"
                            >
                              <span className="font-semibold text-zinc-700">{vaccine.vaccineName}</span>
                              <span className="text-[11px] text-zinc-400 font-medium">
                                {vaccine.nextDueAt
                                  ? `Próxima: ${new Date(vaccine.nextDueAt).toLocaleDateString('pt-BR')}`
                                  : vaccine.appliedAt
                                  ? new Date(vaccine.appliedAt).toLocaleDateString('pt-BR')
                                  : 'Registrada'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400">Nenhuma vacina registrada na clínica.</p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* 8. ABA 4: MEUS PACOTES */}
        {activeTab === 'packages' && data.packages?.length > 0 && (
          <section className="space-y-4" aria-labelledby="packages-heading">
            <div className="grid gap-4 sm:grid-cols-2">
              {data.packages.map((pkg: any) => (
                <article key={pkg.id} className="rounded-2xl border border-teal-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 px-2.5 py-0.5 text-xs font-bold">
                      <Package size={13} /> {pkg.name || 'Pacote de Sessões'}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-medium">
                      Validade: {pkg.expiresAt ? new Date(pkg.expiresAt).toLocaleDateString('pt-BR') : 'Sem prazo'}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 mb-3 font-medium">
                    Beneficiário: <strong>{pkg.pet?.name || 'Seu Pet'}</strong>
                  </p>

                  <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3 space-y-2 text-xs">
                    <span className="font-bold text-zinc-800 block text-[11px] uppercase tracking-wider">
                      Sessões Disponíveis
                    </span>
                    {pkg.items?.map((item: any) => {
                      const remain = (item.totalQty || 0) - (item.usedQty || 0);
                      return (
                        <div key={item.id} className="flex items-center justify-between">
                          <span className="text-zinc-700 font-medium">{item.serviceName || 'Sessão de Banho'}</span>
                          <span className="font-extrabold text-teal-800">
                            {remain} de {item.totalQty} restantes
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (pkg.petId) setForm(prev => ({ ...prev, petId: pkg.petId }));
                      setActiveTab('schedule');
                    }}
                    className="mt-4 w-full rounded-xl bg-teal-800 hover:bg-teal-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                  >
                    Agendar Sessão Deste Pacote
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-12 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <ShieldCheck size={14} />
          Área do Tutor · {data.shop.name}
        </footer>
      </main>

      {/* 9. Lightbox de Foto em Tela Cheia para o Tutor */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-md w-full overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative bg-black flex items-center justify-center max-h-[70vh]">
              <img
                src={lightboxPhoto.url}
                alt={`Foto de ${lightboxPhoto.petName}`}
                className="max-h-[70vh] w-full object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black transition"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-zinc-900">{lightboxPhoto.petName}</p>
                {lightboxPhoto.caption && (
                  <p className="text-xs text-zinc-600 mt-0.5">“{lightboxPhoto.caption}”</p>
                )}
              </div>
              <a
                href={lightboxPhoto.url}
                download={`foto-${lightboxPhoto.petName.toLowerCase()}.webp`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition"
              >
                <Download size={13} /> Baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento pelo Tutor */}
      {clientCancelModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Cancelar Agendamento</h3>
              <button
                type="button"
                onClick={() => setClientCancelModal(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-zinc-600">
                Tem certeza que deseja cancelar o agendamento de <strong>{clientCancelModal.pet?.name}</strong> em{' '}
                <strong>
                  {new Date(clientCancelModal.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </strong>?
              </p>

              {clientCancelModal.services?.some((s: any) => s.customerPackageId || s.coverageStatus === 'reserved') && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
                  <p className="font-bold">📦 Pacote de Sessões</p>
                  <p className="mt-0.5 text-[11px] text-teal-800">
                    A sessão de pacote reservada voltará automaticamente para o seu saldo disponível.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Motivo do cancelamento (opcional):
                </label>
                <input
                  type="text"
                  value={clientCancelReason}
                  onChange={e => setClientCancelReason(e.target.value)}
                  placeholder="Ex: Imprevisto no trabalho, viagem..."
                  className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                disabled={clientCancelSaving}
                onClick={() => setClientCancelModal(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={clientCancelSaving}
                onClick={handleClientCancelConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 shadow-xs disabled:opacity-50"
              >
                {clientCancelSaving ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento pelo Tutor */}
      {clientRescheduleModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Reagendar Horário</h3>
              <button
                type="button"
                onClick={() => setClientRescheduleModal(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <p className="text-xs text-zinc-600">
                Selecione uma nova data e horário para <strong>{clientRescheduleModal.pet?.name}</strong>:
              </p>

              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1">
                  Nova data e horário:
                </label>
                <input
                  type="datetime-local"
                  value={clientRescheduleStartsAt}
                  onChange={e => setClientRescheduleStartsAt(e.target.value)}
                  className="w-full rounded-xl border border-teal-300 bg-white p-2.5 text-xs font-semibold text-zinc-800 outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                disabled={clientRescheduleSaving}
                onClick={() => setClientRescheduleModal(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={clientRescheduleSaving || !clientRescheduleStartsAt}
                onClick={handleClientRescheduleConfirm}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-xs font-bold text-white hover:bg-teal-800 shadow-xs disabled:opacity-50"
              >
                {clientRescheduleSaving ? <Loader2 size={13} className="animate-spin" /> : <CalendarDays size={13} />}
                Confirmar Novo Horário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
