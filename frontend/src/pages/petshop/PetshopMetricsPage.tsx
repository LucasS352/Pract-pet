import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Car,
  Clock,
  DollarSign,
  Minus,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Scissors,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserCheck,
  Wallet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { money } from './types';
import { Modal, pageClass, PageHeader, primaryButton } from './ui';

interface PaymentMixItem {
  key: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

const PAYMENT_METHOD_VISUALS: Record<string, { barColor: string; badgeBg: string; iconBg: string }> = {
  pix: {
    barColor: '#0d9488',
    badgeBg: 'bg-teal-50 text-teal-700 border-teal-200/80',
    iconBg: 'bg-teal-50 text-teal-600',
  },
  credito: {
    barColor: '#4f46e5',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    iconBg: 'bg-indigo-50 text-indigo-600',
  },
  debito: {
    barColor: '#0284c7',
    badgeBg: 'bg-sky-50 text-sky-700 border-sky-200/80',
    iconBg: 'bg-sky-50 text-sky-600',
  },
  dinheiro: {
    barColor: '#d97706',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/80',
    iconBg: 'bg-amber-50 text-amber-600',
  },
  consumo_funcionario: {
    barColor: '#64748b',
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
    iconBg: 'bg-slate-100 text-slate-600',
  },
  outros: {
    barColor: '#7c3aed',
    badgeBg: 'bg-violet-50 text-violet-700 border-violet-200/80',
    iconBg: 'bg-violet-50 text-violet-600',
  },
};

function getPaymentMethodVisual(key: string) {
  return PAYMENT_METHOD_VISUALS[key] || PAYMENT_METHOD_VISUALS.outros;
}

function renderPaymentMethodIcon(key: string) {
  if (key === 'pix') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect width="5" height="5" x="3" y="3" rx="1" />
        <rect width="5" height="5" x="16" y="3" rx="1" />
        <rect width="5" height="5" x="3" y="16" rx="1" />
        <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        <path d="M21 21v.01" />
        <path d="M12 7v3a2 2 0 0 1-2 2H7" />
        <path d="M3 12h.01" />
        <path d="M12 3h.01" />
        <path d="M12 16v.01" />
        <path d="M16 12h1" />
        <path d="M21 12v.01" />
        <path d="M12 21v-1" />
      </svg>
    );
  }
  if (key === 'credito' || key === 'debito') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    );
  }
  if (key === 'dinheiro') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="12" x="2" y="6" rx="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

interface CashMovementItem {
  id: string;
  type: 'IN' | 'OUT';
  value: number;
  reason: string;
  createdAt: string;
}

interface CashDrawerData {
  cashSalesAmount: number;
  totalIn: number;
  totalOut: number;
  netCashBalance: number;
  movements: CashMovementItem[];
}

interface MetricsData {
  period: string;
  start: string;
  end: string;
  previousPeriod?: {
    start: string;
    end: string;
    revenue: number;
    vsPreviousPeriod: number | null;
  };
  totals: {
    totalRevenue: number;
    productRevenue: number;
    serviceRevenue: number;
    packageSalesRevenue?: number;
    packageCoveredSessionsCount?: number;
    salesCount: number;
    appointmentsCount: number;
    totalTransactions: number;
    averageTicket: number;
  };
  paymentMix?: PaymentMixItem[];
  cashDrawer?: CashDrawerData;
  byHour?: Record<string | number, number>;
  byDayOfWeek?: Array<{ day: string; count: number; revenue: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  professionals: Array<{ name: string; count: number; revenue: number }>;
  taxiDog?: {
    totalRevenue: number;
    confirmedRevenue: number;
    packageRevenue: number;
    packageCount: number;
    pdvRevenue: number;
    pdvCount: number;
    agendaDeliveredRevenue: number;
    agendaDeliveredCount: number;
    agendaPendingRevenue: number;
    agendaPendingCount: number;
    coveredByPackageRidesCount: number;
    standaloneRidesCount: number;
    byMode: Array<{
      mode: 'round_trip' | 'pickup_only' | 'dropoff_only';
      label: string;
      count: number;
      revenue: number;
    }>;
  };
}

export default function PetshopMetricsPage() {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'custom'>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartView, setChartView] = useState<'hour' | 'weekday'>('hour');

  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementType, setMovementType] = useState<'IN' | 'OUT'>('IN');
  const [movementValue, setMovementValue] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [savingMovement, setSavingMovement] = useState(false);
  const [deletingMovementId, setDeletingMovementId] = useState<string | null>(null);
  const [showMovementsList, setShowMovementsList] = useState(false);

  const openMovementModal = (type: 'IN' | 'OUT') => {
    setMovementType(type);
    setMovementValue('');
    setMovementReason('');
    setMovementModalOpen(true);
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Number(String(movementValue).replace(',', '.'));
    if (!Number.isFinite(numericVal) || numericVal <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }
    if (!movementReason.trim()) {
      toast.error('Informe uma observação para registrar a movimentação.');
      return;
    }
    setSavingMovement(true);
    try {
      await api.post('/petshop/cash-movements', {
        type: movementType,
        value: numericVal,
        reason: movementReason.trim(),
      });
      toast.success(
        movementType === 'IN'
          ? 'Entrada / abertura registrada no caixa em dinheiro.'
          : 'Sangria / retirada registrada no caixa em dinheiro.',
      );
      setMovementModalOpen(false);
      setShowMovementsList(true);
      await fetchMetrics();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível registrar a movimentação.');
    } finally {
      setSavingMovement(false);
    }
  };

  const handleDeleteMovement = async (id: string) => {
    if (deletingMovementId) return;
    setDeletingMovementId(id);
    try {
      await api.delete(`/petshop/cash-movements/${id}`);
      toast.success('Movimentação removida.');
      await fetchMetrics();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível remover a movimentação.');
    } finally {
      setDeletingMovementId(null);
    }
  };

  // Inicializa datas customizadas com o mês atual caso queira filtrar
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    setCustomFrom(firstDay);
    setCustomTo(today);
  }, []);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom') {
        if (!customFrom || !customTo) {
          toast.error('Informe a data inicial e final para o período customizado.');
          setLoading(false);
          return;
        }
        params.from = customFrom;
        params.to = customTo;
      }
      const res = await api.get<MetricsData>('/petshop/metrics', { params });
      setData(res.data);
    } catch {
      toast.error('Não foi possível carregar as métricas do pet shop.');
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (period !== 'custom') {
      void fetchMetrics();
    }
  }, [fetchMetrics, period]);

  // Gráfico de Horários Mais Movimentados & Fluxo do Pet Shop
  const chartData = useMemo((): Array<{ name: string; value: number; count?: number; isPeak: boolean }> => {
    if (!data) return [];

    if (chartView === 'hour') {
      const byHour = data.byHour || {};
      // Exibe horas comerciais padrão (07h às 20h) ou expande se houver horário anterior/posterior com valor
      const baseHours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const extraHours = Object.keys(byHour)
        .map(h => parseInt(h, 10))
        .filter(h => !isNaN(h) && Number(byHour[h]) > 0 && !baseHours.includes(h));

      const allHours = Array.from(new Set([...baseHours, ...extraHours])).sort((a, b) => a - b);
      const entries = allHours.map(h => ({
        name: `${h}h`,
        value: Number(byHour[h] || 0),
      }));

      const peak = entries.reduce((max, e) => Math.max(max, e.value), 0);
      return entries.map(e => ({
        name: e.name,
        value: e.value,
        isPeak: e.value > 0 && e.value === peak,
      }));
    }

    if (chartView === 'weekday') {
      const weekDaysDefault = [
        { day: 'Dom', count: 0, revenue: 0 },
        { day: 'Seg', count: 0, revenue: 0 },
        { day: 'Ter', count: 0, revenue: 0 },
        { day: 'Qua', count: 0, revenue: 0 },
        { day: 'Qui', count: 0, revenue: 0 },
        { day: 'Sex', count: 0, revenue: 0 },
        { day: 'Sáb', count: 0, revenue: 0 },
      ];

      const list = (data.byDayOfWeek && data.byDayOfWeek.length > 0)
        ? data.byDayOfWeek
        : weekDaysDefault;

      const peak = list.reduce((max, d) => Math.max(max, Number(d.revenue || 0)), 0);
      return list.map(d => ({
        name: d.day,
        value: Number(d.revenue || 0),
        count: Number(d.count || 0),
        isPeak: Number(d.revenue || 0) > 0 && Number(d.revenue || 0) === peak,
      }));
    }

    return [];
  }, [data, chartView]);

  const peakItem = useMemo(() => {
    return chartData.find(c => c.isPeak && c.value > 0);
  }, [chartData]);

  const maxServiceRev = data?.topServices?.[0]?.revenue || 1;
  const maxProductRev = data?.topProducts?.[0]?.revenue || 1;

  const vsPrev = data?.previousPeriod?.vsPreviousPeriod;

  return (
    <div className={pageClass}>
      {/* ===================================================================== */}
      {/* VISÃO MOBILE: Cabeçalho, Pílulas de Período e KPI Compacto            */}
      {/* ===================================================================== */}
      <div className="mb-5 space-y-3.5 md:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Métricas</h1>
            <span className="rounded-full bg-[#e6f4ef] px-2.5 py-0.5 text-xs font-bold text-[#0d6e5a]">
              {data?.totals.totalTransactions || 0} vendas
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            Faturamento, serviços e horários de pico
          </p>
        </div>

        {/* Barra de resumo compacta 2x2 */}
        <div className="divide-y divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="grid grid-cols-2 divide-x divide-zinc-200/70">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
                <DollarSign size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-500">Faturamento</p>
                <p className="truncate text-sm font-extrabold text-zinc-900 tabular-nums">
                  {data ? money(data.totals.totalRevenue) : 'R$ 0,00'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8f5ef] text-[#0d6e5a]">
                <Scissors size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-500">Banho & Tosa</p>
                <p className="truncate text-sm font-extrabold text-zinc-900 tabular-nums">
                  {data?.totals.appointmentsCount || 0} pets
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-zinc-200/70">
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <Package size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-500">Pacotes</p>
                <p className="truncate text-sm font-extrabold text-zinc-900 tabular-nums">
                  {data ? money(data.totals.packageSalesRevenue || 0) : 'R$ 0,00'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Receipt size={16} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-zinc-500">Ticket Médio</p>
                <p className="truncate text-sm font-extrabold text-zinc-900 tabular-nums">
                  {data ? money(data.totals.averageTicket) : 'R$ 0,00'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Botão Atualizar */}
        <div>
          <button
            type="button"
            onClick={fetchMetrics}
            disabled={loading}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Pílulas de período */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { key: 'today', label: 'Hoje' },
            { key: 'yesterday', label: 'Ontem' },
            { key: 'week', label: '7 dias' },
            { key: 'month', label: 'Este mês' },
            { key: 'last_month', label: 'Mês anterior' },
            { key: 'year', label: 'Este ano' },
            { key: 'custom', label: 'Personalizado' },
          ].map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key as typeof period)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                period === item.key
                  ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-200/80 bg-white p-3">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-9 rounded-xl border border-zinc-200 px-2.5 text-xs"
            />
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="h-9 rounded-xl border border-zinc-200 px-2.5 text-xs"
            />
            <button
              type="button"
              onClick={fetchMetrics}
              disabled={loading || !customFrom || !customTo}
              className="col-span-2 h-9 rounded-xl bg-[#0d6e5a] text-xs font-semibold text-white disabled:opacity-50"
            >
              Filtrar Período
            </button>
          </div>
        )}
      </div>

      {/* VISÃO DESKTOP: Cabeçalho, Filtro de Período e 4 KPIs */}
      <div className="hidden md:block">
      <PageHeader
        eyebrow="Área de Atendimento e Gestão"
        title="Métricas do Pet Shop"
        description="Faturamento consolidado, comparativos de desempenho e horários de maior fluxo."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchMetrics}
              disabled={loading}
              className={`${primaryButton} flex items-center gap-2`}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
          </div>
        }
      />

      {/* 1. SELETOR DE PERÍODOS (IDENTIDADE VISUAL DO PET SHOP) */}
      <section
        aria-label="Filtro de período"
        className="mb-6 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-50 text-teal-800">
              <CalendarDays size={16} />
            </span>
            <div>
              <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Período de Análise
              </p>
              <p className="text-[11px] text-zinc-400">
                Selecione o intervalo de datas para calcular os comparativos
              </p>
            </div>
          </div>

          {/* Presets Rápidos */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'today', label: 'Hoje' },
              { key: 'yesterday', label: 'Ontem' },
              { key: 'week', label: 'Últimos 7 dias' },
              { key: 'month', label: 'Este Mês' },
              { key: 'last_month', label: 'Mês Anterior' },
              { key: 'year', label: 'Este Ano' },
              { key: 'custom', label: 'Personalizado 📅' },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key as typeof period)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                  period === item.key
                    ? 'bg-teal-800 text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Barra Expansível de Período Customizado */}
        {period === 'custom' && (
          <div className="mt-4 pt-3.5 border-t border-zinc-100 flex flex-wrap items-end gap-3 animate-in fade-in duration-150">
            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                Data Inicial:
              </label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                Data Final:
              </label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
              />
            </div>

            <button
              type="button"
              onClick={fetchMetrics}
              disabled={loading || !customFrom || !customTo}
              className="rounded-xl bg-teal-800 hover:bg-teal-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              Filtrar Período
            </button>
          </div>
        )}
      </section>

      {/* 2. CARDS PRINCIPAIS DE DESEMPENHO DO PET SHOP (100% TONALIDADE CLARA DO PET) */}
      <section
        aria-label="Resumo de faturamento e comparativos"
        className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Card 1: Faturamento do Período */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Faturamento Total
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <DollarSign size={20} />
              </span>
            </div>
            <strong className="mt-2 block text-2xl font-extrabold text-zinc-900 tracking-tight tabular-nums">
              {data ? money(data.totals.totalRevenue) : 'R$ 0,00'}
            </strong>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
            {vsPrev !== null && vsPrev !== undefined ? (
              <span
                className={`inline-flex items-center gap-1 font-bold ${
                  vsPrev >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {vsPrev >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {vsPrev >= 0 ? `+${vsPrev}%` : `${vsPrev}%`} vs. anterior
              </span>
            ) : (
              <span className="text-zinc-400">Sem comparativo ant.</span>
            )}
            <span className="text-zinc-500 font-medium tabular-nums">
              {data?.totals.totalTransactions || 0} transações
            </span>
          </div>
        </div>

        {/* Card 2: Serviços de Banho & Tosa */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Banho & Tosa
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-800">
                <Scissors size={20} />
              </span>
            </div>
            <strong className="mt-2 block text-2xl font-extrabold text-zinc-900 tracking-tight tabular-nums">
              {data?.totals.appointmentsCount || 0} pets
            </strong>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
            <span className="font-bold text-teal-800 tabular-nums">
              {data ? money(data.totals.serviceRevenue) : 'R$ 0,00'}
            </span>
            <span className="text-zinc-400">
              +{data?.totals.packageCoveredSessionsCount || 0} em pacotes
            </span>
          </div>
        </div>

        {/* Card 3: Planos & Pacotes Recorrentes */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Pacotes Recorrentes
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-700">
                <Package size={20} />
              </span>
            </div>
            <strong className="mt-2 block text-2xl font-extrabold text-zinc-900 tracking-tight tabular-nums">
              {data ? money(data.totals.packageSalesRevenue || 0) : 'R$ 0,00'}
            </strong>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
            <span className="font-bold text-purple-700">Planos contratados</span>
            <span className="text-zinc-400">Fidelização contínua</span>
          </div>
        </div>

        {/* Card 4: Ticket Médio por Transação Paga */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                Ticket Médio
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <Receipt size={20} />
              </span>
            </div>
            <strong className="mt-2 block text-2xl font-extrabold text-zinc-900 tracking-tight tabular-nums">
              {data ? money(data.totals.averageTicket) : 'R$ 0,00'}
            </strong>
          </div>

          <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-medium">Por venda ou pacote pago</span>
            <span className="font-bold text-amber-700">Serviços + Loja</span>
          </div>
        </div>
      </section>

      </div>

      {/* 2B. MIX DE PAGAMENTOS (PDV, SERVIÇOS E PACOTES) */}
      {(() => {
        const paymentMix = data?.paymentMix || [
          { key: 'pix', label: 'Pix', amount: 0, count: 0, percentage: 0 },
          { key: 'credito', label: 'Cartão de Crédito', amount: 0, count: 0, percentage: 0 },
          { key: 'debito', label: 'Cartão de Débito', amount: 0, count: 0, percentage: 0 },
          { key: 'dinheiro', label: 'Dinheiro', amount: 0, count: 0, percentage: 0 },
        ];
        const mixTotal = paymentMix.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const activeMix = paymentMix.filter((item) => Number(item.amount || 0) > 0);
        const leadingMethod = activeMix[0];

        return (
          <section
            aria-label="Mix de pagamentos"
            className="mb-6 rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <div>
                <h2 className="text-base font-extrabold text-zinc-900">Mix de Pagamentos</h2>
                <p className="text-xs sm:text-sm text-zinc-500">
                  Distribuição do faturamento recebido por forma de pagamento no período
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {leadingMethod && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getPaymentMethodVisual(leadingMethod.key).badgeBg}`}>
                    Principal: {leadingMethod.label} ({leadingMethod.percentage.toFixed(1).replace('.', ',')}%)
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 tabular-nums">
                  Total recebido: {money(mixTotal)}
                </span>
              </div>
            </div>

            {mixTotal > 0 ? (
              <div className="h-3 w-full rounded-full bg-zinc-100 overflow-hidden flex gap-0.5 p-0.5">
                {activeMix.map((item) => {
                  const visual = getPaymentMethodVisual(item.key);
                  return (
                    <div
                      key={item.key}
                      title={`${item.label}: ${money(item.amount)} (${item.percentage.toFixed(1).replace('.', ',')}%)`}
                      className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                      style={{
                        width: `${Math.max(item.percentage, 2)}%`,
                        backgroundColor: visual.barColor,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl bg-zinc-50 border border-dashed border-zinc-200 px-4 py-3 text-xs sm:text-sm text-zinc-500">
                Nenhum recebimento registrado neste período ainda.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {paymentMix.map((item) => {
                const visual = getPaymentMethodVisual(item.key);
                const pctText = `${item.percentage.toFixed(1).replace('.', ',')}%`;
                const isDinheiroToday = item.key === 'dinheiro' && period === 'today';
                const cashDrawer = isDinheiroToday ? data?.cashDrawer : undefined;
                const hasMovements = Boolean(
                  cashDrawer && (cashDrawer.movements.length > 0 || cashDrawer.totalIn > 0 || cashDrawer.totalOut > 0),
                );

                return (
                  <div
                    key={item.key}
                    className={`rounded-xl border p-3.5 transition-colors space-y-2.5 ${
                      isDinheiroToday
                        ? 'border-amber-200/90 bg-amber-50/25 hover:bg-white hover:border-amber-300'
                        : 'border-zinc-200/80 bg-zinc-50/50 hover:bg-white hover:border-zinc-300/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${visual.iconBg}`}>
                          {renderPaymentMethodIcon(item.key)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-zinc-900 truncate" title={item.label}>
                            {item.label}
                          </div>
                          <div className="text-xs text-zinc-500 whitespace-nowrap">
                            {item.count} {item.count === 1 ? 'lançamento' : 'lançamentos'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isDinheiroToday && (
                          <>
                            <button
                              type="button"
                              onClick={() => openMovementModal('IN')}
                              title="Adicionar valor no caixa de hoje (Troco / Abertura / Suprimento)"
                              className="inline-flex items-center gap-0.5 rounded-lg border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                            >
                              <Plus size={10} strokeWidth={2.6} />
                              Entrada
                            </button>
                            <button
                              type="button"
                              onClick={() => openMovementModal('OUT')}
                              title="Retirar valor do caixa de hoje (Sangria / Despesa)"
                              className="inline-flex items-center gap-0.5 rounded-lg border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 hover:bg-rose-100 transition cursor-pointer"
                            >
                              <Minus size={10} strokeWidth={2.6} />
                              Sangria
                            </button>
                          </>
                        )}
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${visual.badgeBg}`}>
                          {pctText}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        {isDinheiroToday && (
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Vendas em espécie
                          </span>
                        )}
                        <div className="text-base sm:text-lg font-extrabold text-zinc-900 tabular-nums">
                          {money(item.amount)}
                        </div>
                      </div>
                      {isDinheiroToday && cashDrawer && (
                        <div className="text-right">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Saldo na gaveta
                          </span>
                          <div
                            className={`text-sm sm:text-base font-extrabold tabular-nums ${
                              cashDrawer.netCashBalance < 0 ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            {money(cashDrawer.netCashBalance)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-zinc-200/70 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                          backgroundColor: visual.barColor,
                        }}
                      />
                    </div>

                    {isDinheiroToday && cashDrawer && (
                      <div className="pt-2 border-t border-amber-200/60 space-y-1.5 text-[11px]">
                        <div className="flex items-center justify-between text-zinc-600">
                          <span>+ Entradas / Abertura:</span>
                          <strong className="font-bold text-emerald-700 tabular-nums">
                            +{money(cashDrawer.totalIn)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-zinc-600">
                          <span>- Sangrias / Retiradas:</span>
                          <strong className="font-bold text-rose-600 tabular-nums">
                            -{money(cashDrawer.totalOut)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-zinc-400">
                            Zera às 00:00 (opcional)
                          </span>
                          {hasMovements && (
                            <button
                              type="button"
                              onClick={() => setShowMovementsList((prev) => !prev)}
                              className="text-[11px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
                            >
                              {showMovementsList
                                ? 'Ocultar extrato'
                                : `Ver extrato (${cashDrawer.movements.length})`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {period === 'today' && data?.cashDrawer && data.cashDrawer.movements.length > 0 && showMovementsList && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-800">
                      <Wallet size={15} />
                    </span>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900">
                        Extrato de Caixa em Dinheiro (Abertura, Troco e Sangrias)
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Vendas em dinheiro ({money(data.cashDrawer.cashSalesAmount)}) + Entradas ({money(data.cashDrawer.totalIn)}) - Sangrias ({money(data.cashDrawer.totalOut)}) ={' '}
                        <strong className="text-zinc-900">{money(data.cashDrawer.netCashBalance)} na gaveta</strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openMovementModal('IN')}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                    >
                      <Plus size={12} /> Nova Entrada
                    </button>
                    <button
                      type="button"
                      onClick={() => openMovementModal('OUT')}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-50 cursor-pointer"
                    >
                      <Minus size={12} /> Nova Sangria
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-amber-200/60 rounded-xl border border-amber-200/70 bg-white">
                  {data.cashDrawer.movements.map((mov) => {
                    const isIn = mov.type === 'IN';
                    const dt = new Date(mov.createdAt);
                    const formattedDate = Number.isNaN(dt.getTime())
                      ? ''
                      : dt.toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                    return (
                      <div
                        key={mov.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              isIn
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {isIn ? '+ Entrada' : '- Sangria'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 truncate" title={mov.reason}>
                              {mov.reason || (isIn ? 'Entrada / Troco' : 'Sangria / Retirada')}
                            </p>
                            {formattedDate && (
                              <p className="text-[10px] text-zinc-400 tabular-nums">{formattedDate}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <strong
                            className={`font-extrabold tabular-nums ${
                              isIn ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            {isIn ? `+${money(mov.value)}` : `-${money(mov.value)}`}
                          </strong>
                          <button
                            type="button"
                            disabled={deletingMovementId === mov.id}
                            onClick={() => handleDeleteMovement(mov.id)}
                            title="Remover lançamento"
                            className="rounded-lg p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* 3. GRÁFICO DOS HORÁRIOS MAIS MOVIMENTADOS DO PET SHOP (AMPLO, CLARO E TONALIDADE DO PET) */}
      <section
        aria-label="Horários de maior movimento"
        className="mb-6 rounded-2xl border border-zinc-200/90 bg-white p-5 sm:p-6 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <Clock size={16} />
              </span>
              <h2 className="text-base font-bold text-zinc-900">
                Horários Mais Movimentados no Pet Shop
              </h2>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fluxo financeiro e concentração de atendimentos para dimensionar sua equipe e evitar filas
            </p>
          </div>

          {/* Comutador: Por Horário / Por Dia da Semana */}
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setChartView('hour')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                chartView === 'hour'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Por Horário do Dia
            </button>
            <button
              type="button"
              onClick={() => setChartView('weekday')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                chartView === 'weekday'
                  ? 'bg-white text-teal-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Por Dia da Semana
            </button>
          </div>
        </div>

        {/* Insight do Pico Destacado em Ouro */}
        {peakItem && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-1.5 text-xs font-semibold text-amber-900">
            <Sparkles size={14} className="text-amber-600 shrink-0" />
            <span>
              <strong>Pico identificado:</strong> {chartView === 'hour' ? `Horário das ${peakItem.name}` : peakItem.name} com{' '}
              <strong>{money(peakItem.value)}</strong> movimentados (destacado em amarelo ouro).
            </span>
          </div>
        )}

        {/* Gráfico Recharts */}
        <div className="h-72 w-full pt-2">
          {chartData.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-zinc-400">
              Carregando dados dos horários...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis
                  dataKey="name"
                  stroke="#a1a1aa"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: '#e4e4e7' }}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={val => (val >= 1000 ? `R$ ${(val / 1000).toFixed(0)}k` : `R$ ${val}`)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(244, 244, 245, 0.6)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-md text-xs">
                          <p className="font-bold text-zinc-900">
                            {chartView === 'hour' ? `Horário: ${item.name}` : `Dia: ${item.name}`}
                          </p>
                          <p className="mt-1 font-extrabold text-teal-800 text-sm tabular-nums">
                            {money(item.value)}
                          </p>
                          {item.count !== undefined && item.count > 0 && (
                            <p className="text-[11px] text-zinc-500">
                              {item.count} atendimentos
                            </p>
                          )}
                          {item.isPeak && (
                            <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              ⭐ Horário de Pico
                            </span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isPeak ? '#f59e0b' : '#0d9488'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 4. RANKINGS E PRODUTIVIDADE OPERACIONAL (2 COLUNAS CLARAS) */}
      <section
        aria-label="Rankings de serviços e produtos"
        className="grid min-w-0 gap-6 grid-cols-1 lg:grid-cols-2"
      >
        {/* Serviços Mais Rentáveis */}
        <div className="min-w-0 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-50 text-teal-800">
                <Scissors size={15} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Serviços Mais Utilizados</h3>
                <p className="text-[11px] text-zinc-500">Volume e valor agendado; pode incluir serviços não pagos</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-400">
              {data?.topServices.length || 0} serviços
            </span>
          </div>

          <div className="space-y-3">
            {(!data?.topServices || data.topServices.length === 0) ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                Nenhum serviço agendado no período selecionado.
              </p>
            ) : (
              data.topServices.map((svc, idx) => {
                const pct = Math.min(100, Math.round((svc.revenue / maxServiceRev) * 100));
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 font-semibold text-zinc-800 truncate">
                        <span className="text-zinc-400 font-bold mr-1.5">{idx + 1}.</span>
                        {svc.name}
                        <span className="text-zinc-400 font-normal ml-1">({svc.count}x)</span>
                      </span>
                      <strong className="shrink-0 font-extrabold text-zinc-900 tabular-nums">
                        {money(svc.revenue)}
                      </strong>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-teal-700 rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Produtos Mais Vendidos na Loja */}
        <div className="min-w-0 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700">
                <ShoppingBag size={15} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Produtos Mais Vendidos</h3>
                <p className="text-[11px] text-zinc-500">Itens com maior saída no caixa do pet shop</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-400">
              {data?.topProducts.length || 0} produtos
            </span>
          </div>

          <div className="space-y-3">
            {(!data?.topProducts || data.topProducts.length === 0) ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                Nenhum produto vendido no período selecionado.
              </p>
            ) : (
              data.topProducts.map((p, idx) => {
                const pct = Math.min(100, Math.round((p.revenue / maxProductRev) * 100));
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 font-semibold text-zinc-800 truncate">
                        <span className="text-zinc-400 font-bold mr-1.5">{idx + 1}.</span>
                        {p.name}
                        <span className="text-zinc-400 font-normal ml-1">({p.quantity} un)</span>
                      </span>
                      <strong className="shrink-0 font-extrabold text-zinc-900 tabular-nums">
                        {money(p.revenue)}
                      </strong>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* 4B. RELATÓRIO DE RECEITAS E TAXAS DO TÁXI DOG */}
      {(() => {
        const taxi = data?.taxiDog || {
          totalRevenue: 0,
          confirmedRevenue: 0,
          packageRevenue: 0,
          packageCount: 0,
          pdvRevenue: 0,
          pdvCount: 0,
          agendaDeliveredRevenue: 0,
          agendaDeliveredCount: 0,
          agendaPendingRevenue: 0,
          agendaPendingCount: 0,
          coveredByPackageRidesCount: 0,
          standaloneRidesCount: 0,
          byMode: [],
        };
        const standaloneRevenue = Number(
          (taxi.pdvRevenue + taxi.agendaDeliveredRevenue + taxi.agendaPendingRevenue).toFixed(2),
        );
        const standaloneCompletedCount = taxi.pdvCount + taxi.agendaDeliveredCount;
        const standaloneCompletedRevenue = Number(
          (taxi.pdvRevenue + taxi.agendaDeliveredRevenue).toFixed(2),
        );
        const totalChargesCount = taxi.packageCount + taxi.standaloneRidesCount;
        const maxModeRev = Math.max(...(taxi.byMode || []).map((m) => Number(m.revenue || 0)), 1);

        return (
          <section
            aria-label="Relatório de taxas do Táxi Dog"
            className="mt-6 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <Car size={17} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Relatório de Taxas do Táxi Dog (Frete)</h3>
                  <p className="text-[11px] text-zinc-500">
                    Fretes cobrados em pacotes pagos e atendimentos avulsos na agenda
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-900 tabular-nums">
                  Total Geral: {money(taxi.totalRevenue)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/35 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900/80">
                  Total Geral (Frete)
                </span>
                <strong className="mt-1 block text-lg font-extrabold text-zinc-900 tabular-nums">
                  {money(taxi.totalRevenue)}
                </strong>
                <p className="mt-1 text-[11px] text-zinc-600">
                  {totalChargesCount} {totalChargesCount === 1 ? 'cobrança' : 'cobranças'} com taxa no período
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  Taxas em Pacotes Pagos
                </span>
                <strong className="mt-1 block text-lg font-extrabold text-teal-800 tabular-nums">
                  {money(taxi.packageRevenue)}
                </strong>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {taxi.packageCount} {taxi.packageCount === 1 ? 'pacote c/ frete' : 'pacotes c/ frete'} · {taxi.coveredByPackageRidesCount} {taxi.coveredByPackageRidesCount === 1 ? 'corrida coberta' : 'corridas cobertas'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                  Avulsos na Agenda
                </span>
                <strong className="mt-1 block text-lg font-extrabold text-zinc-900 tabular-nums">
                  {money(standaloneRevenue)}
                </strong>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {standaloneCompletedCount} concluído(s) ({money(standaloneCompletedRevenue)}) · {taxi.agendaPendingCount} agendado(s) ({money(taxi.agendaPendingRevenue)})
                </p>
              </div>
            </div>

            {taxi.totalRevenue > 0 ? (
              <div className="pt-1 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  <span>Por Modalidade de Transporte</span>
                  <span>Volume e valor</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(taxi.byMode || []).map((modeItem) => {
                    const pct = Math.min(100, Math.round((Number(modeItem.revenue || 0) / maxModeRev) * 100));
                    return (
                      <div key={modeItem.mode} className="space-y-1 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
                        <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 font-semibold text-zinc-800 truncate">
                            {modeItem.label}
                            <span className="ml-1 font-normal text-zinc-400">({modeItem.count}x)</span>
                          </span>
                          <strong className="shrink-0 font-extrabold text-zinc-900 tabular-nums">
                            {money(modeItem.revenue)}
                          </strong>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-200/70 overflow-hidden">
                          <div
                            style={{ width: `${modeItem.revenue > 0 ? Math.max(pct, 6) : 0}%` }}
                            className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 text-center py-3">
                Nenhuma taxa de Táxi Dog registrada em pacotes ou atendimentos neste período.
              </p>
            )}
          </section>
        );
      })()}

      {/* 5. PRODUTIVIDADE DA EQUIPE DE BANHO E TOSA */}
      <section
        aria-label="Produtividade da equipe"
        className="mt-6 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-50 text-sky-700">
            <UserCheck size={16} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Produtividade por Profissional</h3>
            <p className="text-[11px] text-zinc-500">
              Volume e valor agendado por banhistas, tosadores e equipe
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(!data?.professionals || data.professionals.length === 0) ? (
            <p className="text-xs text-zinc-400 col-span-full py-4 text-center">
              Nenhum profissional registrado no período.
            </p>
          ) : (
            data.professionals.map((pro, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-teal-100/70 font-extrabold text-xs text-teal-900">
                    {pro.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong className="block text-xs font-bold text-zinc-900">{pro.name}</strong>
                    <span className="text-[11px] text-zinc-500">
                      {pro.count} {pro.count === 1 ? 'atendimento' : 'atendimentos'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <strong className="block text-xs font-extrabold text-teal-800 tabular-nums">
                    {money(pro.revenue)}
                  </strong>
                  <span className="text-[10px] text-zinc-400">faturado</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {movementModalOpen && (
        <Modal
          title={
            movementType === 'IN'
              ? 'Adicionar Dinheiro no Caixa (Abertura / Troco)'
              : 'Registrar Sangria / Retirada do Caixa'
          }
          subtitle="A abertura de caixa não é obrigatória e o saldo diário reinicia automaticamente às 00:00."
          onClose={() => {
            if (!savingMovement) setMovementModalOpen(false);
          }}
          maxWidth="sm:max-w-md"
        >
          <form onSubmit={handleSaveMovement} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setMovementType('IN')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  movementType === 'IN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Plus size={14} />
                Entrada / Abertura
              </button>
              <button
                type="button"
                onClick={() => setMovementType('OUT')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  movementType === 'OUT'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Minus size={14} />
                Sangria / Retirada
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Valor em Dinheiro (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                placeholder="Ex: 50,00"
                value={movementValue}
                onChange={(e) => setMovementValue(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm font-bold text-zinc-900 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Observação / Motivo *
              </label>
              <input
                type="text"
                required
                placeholder={
                  movementType === 'IN'
                    ? 'Ex: Troco inicial do dia, reforço de caixa...'
                    : 'Ex: Sangria para o cofre, compra de insumo/limpeza...'
                }
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(movementType === 'IN'
                  ? ['Abertura de caixa (Troco)', 'Reforço de troco']
                  : ['Sangria para o cofre', 'Despesa rápida / Insumos', 'Retirada']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMovementReason(preset)}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                disabled={savingMovement}
                onClick={() => setMovementModalOpen(false)}
                className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingMovement}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50 ${
                  movementType === 'IN'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {savingMovement
                  ? 'Salvando...'
                  : movementType === 'IN'
                    ? 'Confirmar Entrada'
                    : 'Confirmar Sangria'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
