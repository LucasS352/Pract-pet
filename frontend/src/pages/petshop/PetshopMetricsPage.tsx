import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  Loader2,
  Package,
  PawPrint,
  RefreshCw,
  Scissors,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { money } from './types';
import { EmptyState, pageClass, PageHeader, primaryButton, secondaryButton } from './ui';

interface MetricsData {
  period: string;
  start: string;
  end: string;
  totals: {
    totalRevenue: number;
    productRevenue: number;
    serviceRevenue: number;
    salesCount: number;
    appointmentsCount: number;
    totalTransactions: number;
    averageTicket: number;
  };
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  professionals: Array<{ name: string; count: number; revenue: number }>;
}

export default function PetshopMetricsPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<MetricsData>('/petshop/metrics', { params: { period } });
      setData(res.data);
    } catch {
      toast.error('Não foi possível carregar as métricas.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const exportMetricsCsv = () => {
    if (!data) return;
    const lines = [
      ['Métrica', 'Valor'],
      ['Faturamento Total', Number(data.totals.totalRevenue).toFixed(2)],
      ['Receita de Serviços', Number(data.totals.serviceRevenue).toFixed(2)],
      ['Receita de Produtos', Number(data.totals.productRevenue).toFixed(2)],
      ['Ticket Médio', Number(data.totals.averageTicket).toFixed(2)],
      ['Atendimentos Realizados', data.totals.appointmentsCount],
      ['Vendas no PDV', data.totals.salesCount],
      [],
      ['Serviço', 'Atendimentos', 'Faturamento (R$)'],
      ...data.topServices.map(s => [`"${s.name}"`, s.count, Number(s.revenue).toFixed(2)]),
      [],
      ['Produto', 'Unidades Vendidas', 'Faturamento (R$)'],
      ...data.topProducts.map(p => [`"${p.name}"`, p.quantity, Number(p.revenue).toFixed(2)]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + lines.map(r => r.join(',')).join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encoded;
    link.download = `metricas-petshop-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório exportado em CSV.');
  };

  const maxServiceRev = data?.topServices?.[0]?.revenue || 1;
  const maxProductRev = data?.topProducts?.[0]?.revenue || 1;

  return (
    <div className={pageClass}>
      <PageHeader
        eyebrow="Gestão Financeira & Desempenho"
        title="Métricas do Pet Shop"
        description="Faturamento consolidado, ticket médio, serviços mais rentáveis e vendas da loja."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportMetricsCsv}
              disabled={!data || loading}
              className={`${secondaryButton} flex items-center gap-2`}
            >
              <Download size={16} />
              <span>Exportar Relatório</span>
            </button>
            <button
              type="button"
              onClick={fetchMetrics}
              disabled={loading}
              className={`${primaryButton} flex items-center gap-2`}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
          </div>
        }
      />

      {/* Seletor de Período */}
      <section aria-label="Seletor de período" className="mb-6 flex flex-wrap items-center gap-2">
        {[
          { key: 'today', label: 'Hoje' },
          { key: 'week', label: 'Últimos 7 dias' },
          { key: 'month', label: 'Este Mês' },
        ].map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPeriod(item.key as typeof period)}
            className={`min-h-10 rounded-xl px-4 text-xs sm:text-sm font-semibold transition ${
              period === item.key
                ? 'bg-[var(--pc-text)] text-white shadow-xs'
                : 'border border-[var(--pc-border)] bg-white text-[var(--pc-text-secondary)] hover:bg-[var(--pc-surface-subtle)] hover:text-[var(--pc-text)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </section>

      {/* 4 Cards de KPI de Faturamento */}
      <section aria-label="Indicadores financeiros" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Faturamento Total */}
        <div className="rounded-2xl border border-[var(--pc-border)] bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Faturamento Total</span>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900">
              {loading ? '…' : money(data?.totals.totalRevenue || 0)}
            </strong>
            <p className="mt-1 text-xs text-slate-400">
              {loading ? '' : `${data?.totals.totalTransactions || 0} transações no período`}
            </p>
          </div>
        </div>

        {/* KPI 2: Receita de Serviços */}
        <div className="rounded-2xl border border-[var(--pc-border)] bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Receita de Serviços</span>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
              <Scissors size={20} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900">
              {loading ? '…' : money(data?.totals.serviceRevenue || 0)}
            </strong>
            <p className="mt-1 text-xs text-slate-400">
              {loading ? '' : `${data?.totals.appointmentsCount || 0} atendimentos de pet`}
            </p>
          </div>
        </div>

        {/* KPI 3: Receita de Produtos */}
        <div className="rounded-2xl border border-[var(--pc-border)] bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendas de Produtos</span>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <ShoppingBag size={20} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900">
              {loading ? '…' : money(data?.totals.productRevenue || 0)}
            </strong>
            <p className="mt-1 text-xs text-slate-400">
              {loading ? '' : `${data?.totals.salesCount || 0} compras realizadas no PDV`}
            </p>
          </div>
        </div>

        {/* KPI 4: Ticket Médio */}
        <div className="rounded-2xl border border-[var(--pc-border)] bg-white p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket Médio</span>
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-100">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="mt-3">
            <strong className="text-2xl sm:text-3xl font-extrabold tabular-nums text-slate-900">
              {loading ? '…' : money(data?.totals.averageTicket || 0)}
            </strong>
            <p className="mt-1 text-xs text-slate-400">por cliente atendido</p>
          </div>
        </div>
      </section>

      {/* Grids de Serviços Mais Rentáveis e Produtos Mais Vendidos */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Card: Serviços Mais Utilizados */}
        <div className="pc-panel flex flex-col rounded-2xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--pc-border)] pb-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-50 text-sky-600">
                <Scissors size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Serviços Mais Utilizados</h3>
                <p className="text-xs text-slate-500">Volume e faturamento por tipo de atendimento</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {data?.topServices.length || 0} serviços
            </span>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="animate-spin text-[var(--pc-action)]" size={24} />
            </div>
          ) : !data?.topServices.length ? (
            <div className="flex h-56 flex-col items-center justify-center text-center text-xs text-slate-400">
              <Scissors size={32} className="mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">Nenhum atendimento no período selecionado</p>
              <p className="mt-0.5">Os serviços concluídos na agenda aparecerão aqui automaticamente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.topServices.map((svc, idx) => {
                const pct = Math.round((svc.revenue / maxServiceRev) * 100);
                return (
                  <div key={svc.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        <strong className="truncate font-semibold text-slate-800" title={svc.name}>
                          {svc.name}
                        </strong>
                        <span className="text-2xs text-slate-400">({svc.count}x)</span>
                      </div>
                      <strong className="font-bold tabular-nums text-slate-900">{money(svc.revenue)}</strong>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-teal-500 transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Card: Produtos Mais Vendidos */}
        <div className="pc-panel flex flex-col rounded-2xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--pc-border)] pb-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <ShoppingBag size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Produtos Mais Vendidos</h3>
                <p className="text-xs text-slate-500">Itens com maior saída no caixa e PDV</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {data?.topProducts.length || 0} produtos
            </span>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Loader2 className="animate-spin text-[var(--pc-action)]" size={24} />
            </div>
          ) : !data?.topProducts.length ? (
            <div className="flex h-56 flex-col items-center justify-center text-center text-xs text-slate-400">
              <Package size={32} className="mb-2 text-slate-300" />
              <p className="font-semibold text-slate-600">Nenhuma venda registrada no período selecionado</p>
              <p className="mt-0.5">As vendas de ração, petiscos e medicamentos aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.topProducts.map((prod, idx) => {
                const pct = Math.round((prod.revenue / maxProductRev) * 100);
                return (
                  <div key={prod.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        <strong className="truncate font-semibold text-slate-800" title={prod.name}>
                          {prod.name}
                        </strong>
                        <span className="text-2xs text-slate-400">({prod.quantity} un)</span>
                      </div>
                      <strong className="font-bold tabular-nums text-slate-900">{money(prod.revenue)}</strong>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Produtividade da Equipe */}
      <section className="pc-panel overflow-hidden rounded-2xl border border-[var(--pc-border)] bg-white p-5 shadow-2xs">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--pc-border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users size={17} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Produtividade por Profissional</h3>
              <p className="text-xs text-slate-500">Atendimentos e receita produzida por cada membro da equipe</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-36 items-center justify-center">
            <Loader2 className="animate-spin text-[var(--pc-action)]" size={24} />
          </div>
        ) : !data?.professionals.length ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Nenhum atendimento atribuído a profissionais no período.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.professionals.map(pro => (
              <div
                key={pro.name}
                className="flex items-center justify-between rounded-xl border border-[var(--pc-border)] bg-slate-50/60 p-3.5 transition hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100/80 font-bold text-xs text-emerald-800">
                    {pro.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong className="block text-sm font-semibold text-slate-900">{pro.name}</strong>
                    <span className="text-xs text-slate-500">{pro.count} atendimentos</span>
                  </div>
                </div>
                <div className="text-right">
                  <strong className="text-sm font-bold tabular-nums text-slate-900">
                    {money(pro.revenue)}
                  </strong>
                  <p className="text-[10px] text-emerald-600 font-semibold">faturado</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
