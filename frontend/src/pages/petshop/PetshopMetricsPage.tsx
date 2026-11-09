import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  DollarSign,
  Download,
  Package,
  Receipt,
  RefreshCw,
  Scissors,
  ShoppingBag,
  Sparkles,
  UserCheck,
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
import { pageClass, PageHeader, primaryButton, secondaryButton } from './ui';

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
  byHour?: Record<string | number, number>;
  byDayOfWeek?: Array<{ day: string; count: number; revenue: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  professionals: Array<{ name: string; count: number; revenue: number }>;
}

export default function PetshopMetricsPage() {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'custom'>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [chartView, setChartView] = useState<'hour' | 'weekday'>('hour');

  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const exportMetricsCsv = () => {
    if (!data) return;
    const lines = [
      ['Métrica', 'Valor'],
      ['Faturamento Total (R$)', Number(data.totals.totalRevenue).toFixed(2)],
      ['Receita de Serviços Banho/Tosa (R$)', Number(data.totals.serviceRevenue).toFixed(2)],
      ['Receita de Pacotes Contratados (R$)', Number(data.totals.packageSalesRevenue || 0).toFixed(2)],
      ['Receita de Produtos PDV (R$)', Number(data.totals.productRevenue).toFixed(2)],
      ['Ticket Médio (R$)', Number(data.totals.averageTicket).toFixed(2)],
      ['Atendimentos de Banho e Tosa', data.totals.appointmentsCount],
      ['Sessões Cobertas por Pacote', data.totals.packageCoveredSessionsCount || 0],
      ['Vendas recebidas no PDV e Pet Shop', data.totals.salesCount],
      ['Total de Transações', data.totals.totalTransactions],
      [],
      ['Serviço', 'Atendimentos agendados', 'Valor agendado (R$)'],
      ...data.topServices.map(s => [`"${s.name}"`, s.count, Number(s.revenue).toFixed(2)]),
      [],
      ['Produto da Loja', 'Unidades Vendidas', 'Faturamento (R$)'],
      ...data.topProducts.map(p => [`"${p.name}"`, p.quantity, Number(p.revenue).toFixed(2)]),
      [],
      ['Profissional', 'Atendimentos agendados', 'Valor agendado (R$)'],
      ...data.professionals.map(pro => [`"${pro.name}"`, pro.count, Number(pro.revenue).toFixed(2)]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + lines.map(r => r.join(',')).join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encoded;
    link.download = `metricas-petshop-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório do Pet Shop exportado em CSV com sucesso!');
  };

  const maxServiceRev = data?.topServices?.[0]?.revenue || 1;
  const maxProductRev = data?.topProducts?.[0]?.revenue || 1;

  const vsPrev = data?.previousPeriod?.vsPreviousPeriod;

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Área de Atendimento e Gestão"
        title="Métricas do Pet Shop"
        description="Faturamento consolidado, comparativos de desempenho e horários de maior fluxo."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportMetricsCsv}
              disabled={!data || loading}
              className={`${secondaryButton} flex items-center gap-2`}
            >
              <Download size={15} />
              <span>Exportar Relatório</span>
            </button>
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
    </div>
  );
}
