import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  Heart,
  PawPrint,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Syringe,
  UserRound,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { getFullUrl } from '@/lib/getFullUrl';
import { money, type StageHistoryEntry } from './types';
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
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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
  } catch {
    // Ignorado caso o navegador bloqueie autoplay de áudio
  }
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
  const [form, setForm] = useState({ petId: '', startsAt: '', serviceIds: [] as string[], notes: '' });

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

        // Detecta se algum pet acabou de mudar para "ready" (Pronto para buscar)
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

  // Atualização em tempo real automática a cada 12s enquanto a aba estiver visível
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(true);
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, [load, token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      await api.post(
        `/petshop/public/${shopId}/appointments`,
        { ...form, startsAt: new Date(form.startsAt).toISOString() },
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

  const liveAppointments = useMemo(
    () => (data?.appointments || []).filter((item: any) => liveStatuses.has(item.status)),
    [data],
  );

  const upcomingAppointments = useMemo(
    () => (data?.appointments || []).filter((item: any) => !liveStatuses.has(item.status)),
    [data],
  );

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
    <div className="petcare-shell min-h-screen">
      {/* Cabeçalho da Loja */}
      <header className="sticky top-0 z-30 border-b border-[var(--pc-border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {data.shop.logoUrl ? (
              <img
                src={getFullUrl(data.shop.logoUrl)}
                alt={`Logo de ${data.shop.name}`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--pc-text)] text-white"
              >
                <PawPrint size={19} />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{data.shop.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-[var(--pc-text-muted)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--pc-success)]" />
                Área do Tutor · Atualização em tempo real
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void load(false)}
            disabled={refreshing}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--pc-border-strong)] bg-white px-3 text-xs font-semibold text-[var(--pc-text-secondary)] transition hover:bg-[var(--pc-surface-subtle)]"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[var(--pc-action)]' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
            {lastUpdated && (
              <span className="text-[11px] font-normal text-[var(--pc-text-muted)]">
                {formatTime(lastUpdated.toISOString())}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Boas-vindas */}
        <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--pc-border)] bg-gradient-to-r from-white via-[#f9fcfb] to-[#eaf4f1] px-5 py-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-medium text-[var(--pc-action)]">Olá, {data.customer.name.split(' ')[0]}!</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em]">Acompanhamento dos seus pets</h1>
            <p className="mt-1 text-sm text-[var(--pc-text-secondary)]">
              Acompanhe cada etapa do atendimento ao vivo, veja as fotos enviadas e consulte a carteira de vacinação.
            </p>
          </div>
          <PetHeroShowcase compact />
        </div>

        {/* DESTAQUE: ACOMPANHAMENTO AO VIVO DO PET (Quando há pet em atendimento ou pronto hoje) */}
        {liveAppointments.length > 0 && (
          <section className="mb-8 space-y-5" aria-label="Acompanhamento em tempo real">
            {liveAppointments.map((appointment: any) => {
              const currentStepIndex = trackerSteps.findIndex(s => s.key === appointment.status);
              const isReady = appointment.status === 'ready';
              const history: StageHistoryEntry[] = Array.isArray(appointment.stageHistory)
                ? appointment.stageHistory
                : [];
              const photosFromHistory = history.filter(h => h.photoUrl);

              return (
                <article
                  key={appointment.id}
                  className={`overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all ${
                    isReady
                      ? 'border-[var(--pc-success)] ring-4 ring-[var(--pc-success)]/10'
                      : 'border-[var(--pc-action)]/40'
                  }`}
                >
                  {/* Banner Superior de Pronto para Buscar ou Ao Vivo */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 ${
                      isReady
                        ? 'bg-[var(--pc-success)] text-white'
                        : 'bg-gradient-to-r from-[#0f766e] to-[#115e59] text-white'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {isReady ? (
                        <BellRing aria-hidden="true" size={20} className="shrink-0" />
                      ) : (
                        <Clock3 aria-hidden="true" size={19} className="shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
                          {isReady ? 'Atendimento Concluído!' : 'Acompanhamento Ao Vivo'}
                        </p>
                        <h2 className="petcare-live-status-title mt-0.5 text-base font-semibold sm:text-lg">
                          {isReady
                            ? `${appointment.pet.name} já está pronto(a)! Você já pode vir buscar!`
                            : `${appointment.pet.name} está: ${appointmentStatus[appointment.status]}`}
                        </h2>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
                      Início às {formatTime(appointment.startsAt)}
                    </span>
                  </div>

                  <div className="p-5 sm:p-6">
                    {/* Identificação do Pet e Serviços */}
                    <div className="flex flex-col gap-4 border-b border-[var(--pc-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3.5">
                        <PetAvatar pet={appointment.pet} size="lg" />
                        <div>
                          <h3 className="text-base font-semibold text-[var(--pc-text)]">{appointment.pet.name}</h3>
                          <p className="text-xs text-[var(--pc-text-secondary)]">
                            {appointment.services.map((s: any) => s.nameSnapshot).join(' + ')}
                          </p>
                          {appointment.professional?.name && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--pc-text-muted)]">
                              <UserRound size={13} /> Cuidado por <strong>{appointment.professional.name}</strong>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl bg-[var(--pc-surface-subtle)] px-4 py-2.5 text-right">
                        <span className="block text-[11px] text-[var(--pc-text-muted)]">Total dos serviços</span>
                        <strong className="text-base font-semibold text-[var(--pc-text)]">
                          {money(
                            appointment.services.reduce(
                              (sum: number, s: any) => sum + Number(s.priceSnapshot || 0),
                              0,
                            ),
                          )}
                        </strong>
                      </div>
                    </div>

                    {/* Stepper de Etapas Ao Vivo */}
                    <div className="mt-6">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--pc-text-muted)]">
                        Progresso do Atendimento
                      </p>
                      <ol className="grid gap-2.5 sm:grid-cols-5">
                        {trackerSteps.map((step, index) => {
                          const completed = index < currentStepIndex || isReady;
                          const active = index === currentStepIndex;
                          const historyEntry = [...history].reverse().find(h => h.status === step.key);

                          return (
                            <li
                              key={step.key}
                              className={`relative flex items-start gap-3 rounded-xl border p-3 transition sm:flex-col sm:gap-2 ${
                                active
                                  ? isReady
                                    ? 'border-[var(--pc-success)] bg-[var(--pc-success-soft)]'
                                    : 'border-[var(--pc-action)] bg-[var(--pc-action-soft)] ring-2 ring-[var(--pc-action)]/15'
                                  : completed
                                    ? 'border-[var(--pc-action)]/30 bg-[#f6fbf9]'
                                    : 'border-[var(--pc-border)] bg-[var(--pc-surface-subtle)]/60 opacity-65'
                              }`}
                            >
                              <div className="contents sm:flex sm:w-full sm:items-center sm:justify-between sm:gap-2">
                                <span
                                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                                    active
                                      ? isReady
                                        ? 'bg-[var(--pc-success)] text-white'
                                        : 'bg-[var(--pc-action)] text-white'
                                      : completed
                                        ? 'bg-[var(--pc-action)] text-white'
                                        : 'bg-white text-[var(--pc-text-muted)] border border-[var(--pc-border-strong)]'
                                  }`}
                                >
                                  {completed && !active ? '✓' : index + 1}
                                </span>
                                {historyEntry?.at && (
                                  <span className="hidden text-[11px] font-medium tabular-nums text-[var(--pc-text-muted)] sm:inline-block">
                                    {formatTime(historyEntry.at)}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <p className="min-w-0 text-xs font-semibold text-[var(--pc-text)]">{step.label}</p>
                                  {historyEntry?.at && (
                                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-[var(--pc-text-muted)] sm:hidden">
                                      {formatTime(historyEntry.at)}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11px] leading-4 text-[var(--pc-text-secondary)]">
                                  {step.shortDesc}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </div>

                    {/* Foto e Recado da Etapa enviadas pela equipe */}
                    {(appointment.stagePhotoUrl || appointment.stageNotes) && (
                      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--pc-action)]/25 bg-gradient-to-br from-[#f4fbf9] via-white to-[#eaf4f1] p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          {appointment.stagePhotoUrl && (
                            <div className="relative shrink-0 overflow-hidden rounded-xl border border-[var(--pc-border)] bg-white shadow-xs sm:w-56">
                              <img
                                src={getFullUrl(appointment.stagePhotoUrl)}
                                alt={`Foto de ${appointment.pet.name} no atendimento`}
                                className="h-52 w-full cursor-pointer object-cover transition hover:scale-[1.02]"
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: getFullUrl(appointment.stagePhotoUrl),
                                    caption: appointment.stageNotes,
                                    petName: appointment.pet.name,
                                  })
                                }
                              />
                              <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                                <Camera size={12} /> Registro da etapa
                              </span>
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pc-action-soft)] px-3 py-1 text-xs font-semibold text-[var(--pc-action-hover)]">
                              <Heart size={13} className="fill-current" /> Momento do seu pet
                            </div>
                            <h4 className="text-base font-semibold text-[var(--pc-text)]">
                              Veja como {appointment.pet.name} está sendo cuidado(a)!
                            </h4>
                            {appointment.stageNotes ? (
                              <blockquote className="rounded-xl border border-[var(--pc-border)] bg-white p-3.5 text-sm italic leading-6 text-[var(--pc-text-secondary)]">
                                “{appointment.stageNotes}”
                              </blockquote>
                            ) : (
                              <p className="text-xs text-[var(--pc-text-secondary)]">
                                Nossa equipe enviou este registro especial durante a etapa de{' '}
                                <strong>{appointmentStatus[appointment.status]?.toLowerCase()}</strong>.
                              </p>
                            )}

                            {appointment.stagePhotoUrl && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxPhoto({
                                      url: getFullUrl(appointment.stagePhotoUrl),
                                      caption: appointment.stageNotes,
                                      petName: appointment.pet.name,
                                    })
                                  }
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--pc-action)] px-3.5 text-xs font-semibold text-white transition hover:bg-[var(--pc-action-hover)]"
                                >
                                  <Camera size={14} /> Ampliar foto
                                </button>
                                <a
                                  href={getFullUrl(appointment.stagePhotoUrl)}
                                  download={`foto-${appointment.pet.name.toLowerCase()}.webp`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--pc-border-strong)] bg-white px-3.5 text-xs font-semibold text-[var(--pc-text)] transition hover:bg-[var(--pc-surface-subtle)]"
                                >
                                  <Download size={14} /> Salvar foto
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Galeria de fotos caso tenham enviado mais de uma foto ao longo das etapas */}
                        {photosFromHistory.length > 1 && (
                          <div className="mt-4 border-t border-[var(--pc-border)] pt-3">
                            <p className="mb-2 text-xs font-semibold text-[var(--pc-text-secondary)]">
                              Fotos enviadas hoje ({photosFromHistory.length})
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {photosFromHistory.map((entry, idx) => (
                                <button
                                  key={`${entry.at}-${idx}`}
                                  type="button"
                                  onClick={() =>
                                    setLightboxPhoto({
                                      url: getFullUrl(entry.photoUrl!),
                                      caption: entry.notes || undefined,
                                      petName: appointment.pet.name,
                                    })
                                  }
                                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--pc-border-strong)] bg-white"
                                >
                                  <img
                                    src={getFullUrl(entry.photoUrl!)}
                                    alt=""
                                    className="h-full w-full object-cover transition group-hover:scale-105"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0 space-y-6">
            {/* Meus Pets e Carteira de Vacinação */}
            <section aria-labelledby="pets-title">
              <h2 id="pets-title" className="mb-3 text-base font-semibold">
                Meus pets e carteira de vacinação
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.customer.pets.map((pet: any) => (
                  <article key={pet.id} className="pc-panel p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <PetAvatar pet={pet} size="lg" />
                      <div>
                        <h3 className="text-sm font-semibold">{pet.name}</h3>
                        <p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">
                          {pet.breed || (pet.species === 'cat' ? 'Gato' : 'Cachorro')}
                          {pet.weight ? ` · ${Number(pet.weight)} kg` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-[var(--pc-border)] pt-4">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--pc-text-secondary)]">
                        <Syringe aria-hidden="true" size={15} className="text-[var(--pc-action)]" />
                        Carteira de vacinação
                      </p>
                      {pet.vaccinations.length ? (
                        pet.vaccinations.slice(0, 4).map((vaccine: any) => (
                          <div key={vaccine.id} className="flex items-start justify-between gap-3 py-1.5 text-xs">
                            <span className="font-medium">{vaccine.vaccineName}</span>
                            <span className="shrink-0 text-right text-[var(--pc-text-muted)]">
                              {vaccine.nextDueAt
                                ? `Próxima: ${new Date(vaccine.nextDueAt).toLocaleDateString('pt-BR')}`
                                : vaccine.appliedAt
                                  ? new Date(vaccine.appliedAt).toLocaleDateString('pt-BR')
                                  : 'Registrada'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs leading-5 text-[var(--pc-text-muted)]">Nenhuma vacina registrada.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Próximos agendamentos */}
            <section className="pc-panel overflow-hidden" aria-labelledby="appointments-title">
              <div className="flex items-center gap-2 border-b border-[var(--pc-border)] px-4 py-4 sm:px-5">
                <CalendarDays aria-hidden="true" size={17} className="text-[var(--pc-action)]" />
                <h2 id="appointments-title" className="text-sm font-semibold">
                  Próximos horários agendados
                </h2>
              </div>
              {upcomingAppointments.length ? (
                <div className="divide-y divide-[var(--pc-border)]">
                  {upcomingAppointments.map((appointment: any) => (
                    <article
                      key={appointment.id}
                      className="grid gap-2 px-4 py-4 sm:grid-cols-[155px_minmax(0,1fr)_auto] sm:items-center sm:px-5"
                    >
                      <p className="flex items-center gap-2 text-xs font-medium tabular-nums">
                        <Clock3 aria-hidden="true" size={14} className="text-[var(--pc-text-muted)]" />
                        {new Date(appointment.startsAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">{appointment.pet.name}</h3>
                        <p className="mt-0.5 truncate text-xs text-[var(--pc-text-muted)]">
                          {appointment.services.map((service: any) => service.nameSnapshot).join(' + ')}
                        </p>
                      </div>
                      <span
                        className={`pc-status ${
                          appointment.status === 'requested'
                            ? 'pc-status--warning'
                            : appointment.status === 'ready'
                              ? 'pc-status--success'
                              : 'pc-status--neutral'
                        }`}
                      >
                        {appointmentStatus[appointment.status] || 'Confirmado'}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-7 text-center text-sm text-[var(--pc-text-muted)]">
                  Nenhum agendamento futuro pendente.
                </div>
              )}
            </section>

            {/* Histórico recente com fotos */}
            {Array.isArray(data.recentHistory) && data.recentHistory.length > 0 && (
              <section className="pc-panel overflow-hidden" aria-labelledby="history-title">
                <div className="flex items-center gap-2 border-b border-[var(--pc-border)] px-4 py-4 sm:px-5">
                  <Scissors aria-hidden="true" size={17} className="text-[var(--pc-action)]" />
                  <h2 id="history-title" className="text-sm font-semibold">
                    Últimos cuidados realizados
                  </h2>
                </div>
                <div className="divide-y divide-[var(--pc-border)]">
                  {data.recentHistory.map((item: any) => (
                    <article key={item.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
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
                            className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--pc-border)]"
                          >
                            <img src={getFullUrl(item.stagePhotoUrl)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ) : (
                          <PetAvatar pet={item.pet} size="sm" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.pet.name}</p>
                          <p className="truncate text-xs text-[var(--pc-text-muted)]">
                            {item.services.map((s: any) => s.nameSnapshot).join(' + ')} ·{' '}
                            {new Date(item.startsAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <span className="pc-status pc-status--neutral">Concluído</span>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Formulário Lateral de Novo Agendamento */}
          <aside className="pc-panel p-4 sm:p-5 lg:sticky lg:top-24" aria-labelledby="booking-title">
            <h2 id="booking-title" className="text-lg font-semibold">
              Solicitar agendamento
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--pc-text-secondary)]">
              Escolha o pet, os serviços e o horário desejado. O estabelecimento confirmará a disponibilidade.
            </p>
            {sent ? (
              <div className="mt-5 rounded-lg bg-[var(--pc-success-soft)] p-5 text-center text-[var(--pc-success)]">
                <CheckCircle2 aria-hidden="true" className="mx-auto mb-3" />
                <p className="text-sm font-semibold">Solicitação enviada</p>
                <p className="mt-1 text-xs leading-5">Você poderá acompanhar a confirmação nesta página.</p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 min-h-10 rounded-lg px-3 text-sm font-semibold underline underline-offset-4"
                >
                  Solicitar outro horário
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 grid gap-4">
                <label>
                  <span className={labelClass}>Pet *</span>
                  <select
                    required
                    className={inputClass}
                    value={form.petId}
                    onChange={event => setForm({ ...form, petId: event.target.value })}
                  >
                    {data.customer.pets.map((pet: any) => (
                      <option key={pet.id} value={pet.id}>
                        {pet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Data e hora desejadas *</span>
                  <input
                    required
                    type="datetime-local"
                    className={inputClass}
                    value={form.startsAt}
                    onChange={event => setForm({ ...form, startsAt: event.target.value })}
                  />
                </label>
                <fieldset>
                  <legend className={labelClass}>Serviços *</legend>
                  <div className="space-y-2">
                    {data.services.map((service: any) => (
                      <label
                        key={service.id}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                          form.serviceIds.includes(service.id)
                            ? 'border-[var(--pc-action)] bg-[var(--pc-action-soft)]'
                            : 'border-[var(--pc-border)] hover:bg-[var(--pc-surface-subtle)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.serviceIds.includes(service.id)}
                          onChange={event =>
                            setForm({
                              ...form,
                              serviceIds: event.target.checked
                                ? [...form.serviceIds, service.id]
                                : form.serviceIds.filter(id => id !== service.id),
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium">
                          {service.name}
                          <small className="mt-0.5 block font-normal text-[var(--pc-text-muted)]">
                            {service.durationMinutes} min · {money(service.price)}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  <span className={labelClass}>Observações</span>
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={form.notes}
                    onChange={event => setForm({ ...form, notes: event.target.value })}
                  />
                </label>
                {error && (
                  <p role="alert" className="rounded-lg bg-[var(--pc-danger-soft)] px-3 py-2 text-sm text-[var(--pc-danger)]">
                    {error}
                  </p>
                )}
                <button disabled={sending || form.serviceIds.length === 0} className={primaryButton}>
                  {sending ? 'Enviando…' : 'Solicitar horário'}
                </button>
              </form>
            )}
          </aside>
        </div>

        <footer className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--pc-text-muted)]">
          <ShieldCheck aria-hidden="true" size={15} />
          Acesso protegido e exclusivo do tutor
        </footer>
      </main>

      {/* Lightbox de Foto em Tela Cheia para o Tutor */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-xs"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.url}
              alt={`Foto de ${lightboxPhoto.petName}`}
              className="max-h-[70vh] w-full object-contain bg-black"
            />
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--pc-text)]">{lightboxPhoto.petName}</p>
                {lightboxPhoto.caption && (
                  <p className="mt-0.5 text-xs text-[var(--pc-text-secondary)]">“{lightboxPhoto.caption}”</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxPhoto.url}
                  download={`foto-${lightboxPhoto.petName.toLowerCase()}.webp`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--pc-action)] px-3.5 text-xs font-semibold text-white"
                >
                  <Download size={14} /> Baixar
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxPhoto(null)}
                  className="min-h-9 rounded-lg border border-[var(--pc-border-strong)] px-3 text-xs font-semibold text-[var(--pc-text)]"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
