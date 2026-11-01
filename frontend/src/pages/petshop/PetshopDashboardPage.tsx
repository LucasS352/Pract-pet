import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  PawPrint,
  Package,
  Plus,
  RefreshCw,
  Syringe,
  UserRound,
  UserRoundCog,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Appointment } from './types';
import { PetAvatar, PetHeroShowcase } from './ui';

type Overview = {
  metrics: {
    pets: number;
    tutors: number;
    products?: number;
    today: number;
    inProgress: number;
    vaccinesDue: number;
  };
  nextAppointments: Appointment[];
};

const STATUS: Record<string, { label: string; tone: string }> = {
  requested: { label: 'Solicitado', tone: 'pc-status--warning' },
  scheduled: { label: 'Agendado', tone: 'pc-status--neutral' },
  checked_in: { label: 'Check-in', tone: 'pc-status--info' },
  bathing: { label: 'No banho', tone: 'pc-status--info' },
  grooming: { label: 'Na tosa', tone: 'pc-status--info' },
  finishing: { label: 'Finalização', tone: 'pc-status--warning' },
  ready: { label: 'Pronto para retirada', tone: 'pc-status--success' },
  delivered: { label: 'Entregue', tone: 'pc-status--neutral' },
  cancelled: { label: 'Cancelado', tone: 'pc-status--danger' },
  no_show: { label: 'Não compareceu', tone: 'pc-status--danger' },
};

const activeStatuses = new Set(['requested', 'scheduled', 'checked_in', 'bathing', 'grooming', 'finishing', 'ready']);
const productionStatuses = new Set(['checked_in', 'bathing', 'grooming', 'finishing']);

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function time(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS[status] || { label: status, tone: 'pc-status--neutral' };
  return <span className={`pc-status ${config.tone}`}>{config.label}</span>;
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-32 flex-col items-center justify-center px-5 py-7 text-center"><CheckCircle2 aria-hidden="true" className="mb-3 text-[var(--pc-border-strong)]" size={24} /><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--pc-text-muted)]">{description}</p></div>;
}

function CompactAppointment({ item }: { item: Appointment }) {
  return <div className="border-t border-[var(--pc-border)] px-4 py-3 first:border-t-0"><div className="flex items-center gap-3"><PetAvatar pet={item.pet} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{item.pet.name}</p><span className="text-xs font-semibold tabular-nums text-[var(--pc-text-secondary)]">· {time(item.startsAt)}</span></div><p className="mt-0.5 truncate text-xs text-[var(--pc-text-muted)]">{item.customer.name}</p></div><StatusBadge status={item.status} /></div></div>;
}

export default function PetshopDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError('');
    setLoading(true);
    try {
      const range = todayRange();
      const [overviewResponse, appointmentsResponse] = await Promise.all([
        api.get<Overview>('/petshop/overview', { signal }),
        api.get<Appointment[]>('/petshop/appointments', { params: range, signal }),
      ]);
      setOverview(overviewResponse.data);
      setAppointments(appointmentsResponse.data);
      setUpdatedAt(new Date());
    } catch (requestError: any) {
      if (requestError?.code !== 'ERR_CANCELED') {
        setError(requestError?.response?.data?.message || 'Não foi possível carregar a operação de hoje.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeAppointments = useMemo(() => appointments.filter(item => activeStatuses.has(item.status)), [appointments]);
  const inProduction = useMemo(() => activeAppointments.filter(item => productionStatuses.has(item.status)), [activeAppointments]);
  const ready = useMemo(() => activeAppointments.filter(item => item.status === 'ready'), [activeAppointments]);
  const requested = useMemo(() => activeAppointments.filter(item => item.status === 'requested'), [activeAppointments]);
  const agendaCount = useMemo(() => appointments.filter(item => !['cancelled', 'no_show'].includes(item.status)).length, [appointments]);
  const rawDateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
  const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1);

  if (loading && !overview) {
    return <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8"><div className="animate-pulse" role="status" aria-label="Carregando operação de hoje"><div className="h-7 w-52 rounded bg-[var(--pc-border)]" /><div className="mt-3 h-4 w-80 max-w-full rounded bg-[var(--pc-border)]" /><div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-24 rounded-xl bg-[var(--pc-surface)]" />)}</div><div className="mt-5 h-96 rounded-xl bg-[var(--pc-surface)]" /></div></div>;
  }

  if (error && !overview) {
    return <div className="mx-auto grid min-h-[70vh] max-w-xl place-items-center p-6"><div className="pc-panel p-7 text-center"><h1 className="text-lg font-semibold">Não foi possível abrir a visão de hoje</h1><p className="mt-2 text-sm text-[var(--pc-text-secondary)]">{error}</p><button onClick={() => load()} className="mt-5 min-h-11 rounded-lg bg-[var(--pc-action)] px-5 text-sm font-semibold text-white hover:bg-[var(--pc-action-hover)]">Tentar novamente</button></div></div>;
  }

  if (!overview) return null;

  const summary = [
    { label: 'Agenda de hoje', value: agendaCount, note: 'atendimentos no dia', icon: CalendarDays, iconClass: 'bg-[var(--pc-action-soft)] text-[var(--pc-action)]' },
    { label: 'Em atendimento', value: inProduction.length, note: 'em execução agora', icon: Clock3, iconClass: 'bg-[var(--pc-warning-soft)] text-[var(--pc-warning)]' },
    { label: 'Aguardando retirada', value: ready.length, note: 'prontos hoje', icon: CheckCircle2, iconClass: 'bg-[var(--pc-info-soft)] text-[var(--pc-info)]' },
    { label: 'Novas solicitações', value: requested.length, note: 'aguardando confirmação', icon: PawPrint, iconClass: 'bg-[var(--pc-danger-soft)] text-[var(--pc-danger)]' },
  ];

  return <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
    <header className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-[var(--pc-border)] bg-gradient-to-r from-white via-[#f9fcfb] to-[#eaf4f1] px-5 py-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--pc-action)]"><CalendarDays aria-hidden="true" size={15} />{dateLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[var(--pc-text)]">Operação de hoje</h1>
        <p className="mt-1 text-sm text-[var(--pc-text-secondary)]">Agenda, andamento dos serviços e pendências do estabelecimento.</p>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <PetHeroShowcase />
        <div className="flex flex-wrap items-center gap-2"><button onClick={() => load()} disabled={loading} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--pc-border-strong)] bg-white px-3 text-sm font-medium transition hover:bg-[var(--pc-surface-subtle)] disabled:cursor-wait disabled:opacity-60"><RefreshCw aria-hidden="true" size={16} className={loading ? 'animate-spin' : ''} />Atualizar</button><Link to="/petshop/agenda?new=1" className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--pc-action)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pc-action-hover)]"><Plus aria-hidden="true" size={17} />Novo atendimento</Link></div>
      </div>
    </header>

    {error && <div role="alert" className="mt-4 flex flex-col gap-2 rounded-lg border border-[var(--pc-warning)]/20 bg-[var(--pc-warning-soft)] px-4 py-3 text-sm text-[var(--pc-warning)] sm:flex-row sm:items-center sm:justify-between"><span>{error} Os últimos dados carregados continuam visíveis.</span><button onClick={() => load()} className="font-semibold underline underline-offset-4">Tentar novamente</button></div>}

    <section aria-label="Resumo da operação" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map(item => <div key={item.label} className="pc-panel flex items-center gap-4 px-5 py-4 shadow-2xs"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.iconClass}`}><item.icon aria-hidden="true" size={20} /></span><div className="min-w-0"><p className="text-xs font-medium text-[var(--pc-text-secondary)]">{item.label}</p><div className="mt-0.5 flex items-baseline gap-2"><strong className="text-2xl font-semibold tabular-nums">{item.value}</strong><span className="truncate text-xs text-[var(--pc-text-muted)]">{item.note}</span></div></div></div>)}
    </section>

    <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="pc-panel min-w-0 overflow-hidden" aria-labelledby="agenda-title">
        <div className="flex items-center justify-between border-b border-[var(--pc-border)] px-4 py-4 sm:px-5"><div><h2 id="agenda-title" className="text-base font-semibold">Agenda do dia</h2><p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">Atendimentos ativos em ordem de horário</p></div><Link to="/petshop/agenda" className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[var(--pc-action)] hover:bg-[var(--pc-action-soft)]">Ver agenda<ArrowRight aria-hidden="true" size={15} /></Link></div>
        {activeAppointments.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"><CalendarDays aria-hidden="true" className="mb-4 text-[var(--pc-border-strong)]" size={30} /><h3 className="text-sm font-semibold">Nenhum atendimento ativo hoje</h3><p className="mt-1 max-w-sm text-sm leading-6 text-[var(--pc-text-muted)]">A agenda está livre. Você pode criar um atendimento para começar a organizar o dia.</p><Link to="/petshop/agenda?new=1" className="mt-5 flex min-h-11 items-center gap-2 rounded-lg border border-[var(--pc-border-strong)] px-4 text-sm font-semibold hover:bg-[var(--pc-surface-subtle)]"><Plus aria-hidden="true" size={16} />Novo atendimento</Link></div> : <div className="divide-y divide-[var(--pc-border)]">{activeAppointments.map(item => <article key={item.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[var(--pc-surface-subtle)]/60 sm:grid-cols-[64px_44px_minmax(0,1fr)_auto] sm:items-center sm:px-5"><time dateTime={item.startsAt} className="text-sm font-semibold tabular-nums text-[var(--pc-text)]">{time(item.startsAt)}</time><PetAvatar pet={item.pet} /><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-x-2"><h3 className="truncate text-sm font-semibold">{item.pet.name}</h3><span className="truncate text-sm text-[var(--pc-text-secondary)]">{item.customer.name}</span></div><p className="mt-1 truncate text-xs text-[var(--pc-text-muted)]">{item.services.map(service => service.nameSnapshot).join(' + ') || 'Serviço não informado'}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--pc-text-muted)]"><UserRound aria-hidden="true" size={13} />{item.professional?.name || 'Profissional a definir'} · até {time(item.endsAt)}</p></div><div className="sm:justify-self-end"><StatusBadge status={item.status} /></div></article>)}</div>}
      </section>

      <aside className="space-y-5" aria-label="Acompanhamento da operação">
        <section className="pc-panel overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--pc-border)] px-4 py-3.5"><CheckCircle2 aria-hidden="true" className="text-[var(--pc-success)]" size={17} /><h2 className="text-sm font-semibold">Prontos para retirada</h2><span className="ml-auto text-xs font-semibold tabular-nums text-[var(--pc-text-muted)]">{ready.length}</span></div>{ready.length ? ready.slice(0, 4).map(item => <CompactAppointment key={item.id} item={item} />) : <EmptyPanel title="Nenhum pet aguardando" description="Os atendimentos finalizados aparecerão aqui." />}</section>

        <section className="pc-panel overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--pc-border)] px-4 py-3.5"><Clock3 aria-hidden="true" className="text-[var(--pc-info)]" size={17} /><h2 className="text-sm font-semibold">Em atendimento</h2><span className="ml-auto text-xs font-semibold tabular-nums text-[var(--pc-text-muted)]">{inProduction.length}</span></div>{inProduction.length ? inProduction.slice(0, 4).map(item => <CompactAppointment key={item.id} item={item} />) : <EmptyPanel title="Nenhum serviço em execução" description="Check-ins e etapas de banho e tosa aparecerão aqui." />}</section>

        {requested.length > 0 && <section className="pc-panel overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--pc-border)] px-4 py-3.5"><CalendarDays aria-hidden="true" className="text-[var(--pc-warning)]" size={17} /><h2 className="text-sm font-semibold">Aguardando confirmação</h2><span className="ml-auto text-xs font-semibold tabular-nums text-[var(--pc-warning)]">{requested.length}</span></div>{requested.slice(0, 4).map(item => <CompactAppointment key={item.id} item={item} />)}</section>}
      </aside>
    </div>

    <section className="pc-panel mt-5 p-4 sm:p-5" aria-labelledby="base-title"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="base-title" className="text-sm font-semibold">Base do estabelecimento</h2><p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">Cadastros do Pet Care e recursos compartilhados com o PDV</p></div>{updatedAt && <p role="status" className="text-xs text-[var(--pc-text-muted)]">Atualizado às {time(updatedAt.toISOString())}</p>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Link to="/petshop/pets" className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--pc-border)] px-4 transition hover:bg-[var(--pc-surface-subtle)]"><PawPrint aria-hidden="true" size={18} className="text-[var(--pc-text-muted)]" /><div><strong className="text-base font-semibold tabular-nums">{overview.metrics.pets}</strong><p className="text-xs text-[var(--pc-text-secondary)]">Pets ativos</p></div></Link><Link to="/petshop/tutores" className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--pc-border)] px-4 transition hover:bg-[var(--pc-surface-subtle)]"><Users aria-hidden="true" size={18} className="text-[var(--pc-text-muted)]" /><div><strong className="text-base font-semibold tabular-nums">{overview.metrics.tutors}</strong><p className="text-xs text-[var(--pc-text-secondary)]">Tutores cadastrados</p></div></Link><Link to="/petshop/pets" className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--pc-border)] px-4 transition hover:bg-[var(--pc-surface-subtle)]"><Syringe aria-hidden="true" size={18} className="text-[var(--pc-text-muted)]" /><div><strong className="text-base font-semibold tabular-nums">{overview.metrics.vaccinesDue}</strong><p className="text-xs text-[var(--pc-text-secondary)]">Vacinas a acompanhar</p></div></Link><Link to="/petshop/produtos" className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--pc-border)] px-4 transition hover:bg-[var(--pc-surface-subtle)]"><Package aria-hidden="true" size={18} className="text-[var(--pc-text-muted)]" /><div><strong className="text-base font-semibold tabular-nums">{overview.metrics.products ?? 0}</strong><p className="text-xs text-[var(--pc-text-secondary)]">Produtos do PDV</p></div></Link><Link to="/petshop/equipe" className="flex min-h-16 items-center gap-3 rounded-lg border border-[var(--pc-border)] px-4 transition hover:bg-[var(--pc-surface-subtle)]"><UserRoundCog aria-hidden="true" size={18} className="text-[var(--pc-text-muted)]" /><div><strong className="text-sm font-semibold">Gerenciar</strong><p className="text-xs text-[var(--pc-text-secondary)]">Equipe e acessos</p></div></Link></div></section>
  </div>;
}

