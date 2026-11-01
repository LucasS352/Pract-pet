import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart2, RefreshCw } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { SalesEvolution, type DailySales, type SalesComparison } from './SalesEvolution';

interface SalesReport {
  period: { startDate: string; endDate: string; days: number; timezone: string; includesOpenDays?: boolean };
  daily?: DailySales[];
  comparison?: SalesComparison;
  summary: { revenue: string; transactions: number; averageTicket: string;
    saleDiscounts: string; saleAdditions: string };
  productLimit: number;
  products: { productId: string; name: string; unit: string; quantity: string; itemSubtotal: string }[];
}
const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (value: string) => value.split('-').reverse().join('/');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export default function ReportsPage() {
  const user = useAuthStore(state => state.user);
  return ['admin', 'superadmin'].includes(user?.role ?? '')
    ? <SalesReports key={JSON.stringify([user?.tenant, user?.id])} />
    : <Navigate to="/dashboard/inventory" replace />;
}

function SalesReports() {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [query, setQuery] = useState(() => ({ startDate: today(), endDate: today(), version: 0 }));
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null);
    apiGet<SalesReport>('/reports/sales', {
      params: { startDate: query.startDate, endDate: query.endDate }, signal: controller.signal,
    }).then(({ data }) => { if (!controller.signal.aborted) setReport(data); })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar o relatório. Verifique sua conexão e tente novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);

  function apply() {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
    if (!Number.isFinite(days) || days < 1 || days > 92) {
      setValidation('Selecione um período de 1 a 92 dias.'); return;
    }
    setValidation(''); setReport(null); setLoading(true);
    setQuery(previous => ({ startDate, endDate, version: previous.version + 1 }));
  }

  return <div className="pb-6 max-w-7xl mx-auto w-full space-y-6">
    <header>
      <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart2 className="text-blue-400" /> Relatórios</h1>
      <p className="text-zinc-400 mt-2">Vendas e produtos da empresa atual.</p>
    </header>
    <form onSubmit={event => { event.preventDefault(); apply(); }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-300 flex flex-col gap-1">Data inicial
          <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-lg p-2 [color-scheme:dark]" />
        </label>
        <label className="text-sm text-zinc-300 flex flex-col gap-1">Data final
          <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded-lg p-2 [color-scheme:dark]" />
        </label>
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 font-semibold flex items-center gap-2"><RefreshCw size={16} /> Consultar</button>
      </div>
      <p className="text-xs text-zinc-400">Até 92 dias por consulta. Dia comercial: UTC−03:00. O dia em andamento apresenta valores parciais.</p>
      {validation && <p role="alert" className="text-amber-300 text-sm">{validation}</p>}
    </form>
    <section aria-live="polite" aria-busy={loading} className="space-y-5">
      {loading && <p role="status" className="text-zinc-400">Carregando relatório…</p>}
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300">
        <p>{error}</p><button type="button" onClick={() => setQuery(q => ({ ...q, version: q.version + 1 }))} className="mt-2 underline">Tentar novamente</button>
      </div>}
      {report && <>
        <h2 className="font-semibold">De {dateLabel(report.period.startDate)} a {dateLabel(report.period.endDate)}</h2>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {[
            ['Total vendido', money(report.summary.revenue)],
            ['Vendas concluídas', report.summary.transactions.toLocaleString('pt-BR')],
            ['Ticket médio', money(report.summary.averageTicket)],
            ['Descontos gerais das vendas', money(report.summary.saleDiscounts)],
            ['Acréscimos gerais das vendas', money(report.summary.saleAdditions)],
          ].map(([label, value], index) => <div key={label} className={`bg-zinc-900 border border-zinc-800 p-4 rounded-2xl ${index === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <p className="text-sm text-zinc-400">{label}</p><p className="text-xl md:text-2xl font-bold mt-2 break-words">{value}</p>
          </div>)}
        </div>
        <p className="text-sm text-zinc-400">O total vendido inclui descontos e acréscimos registrados nas vendas concluídas. Cancelamentos e ajustes fiscais ficam excluídos. Estes valores não representam recebimento bancário nem lucro.</p>
        {report.daily && report.comparison && <SalesEvolution daily={report.daily} comparison={report.comparison} includesOpenDays={report.period.includesOpenDays ?? false} />}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold">Maiores subtotais de produtos</h2>
            <p className="text-xs text-zinc-400 mt-2">Até {report.productLimit} registros, agrupados por produto, nome e unidade registrados na venda. Mudanças de nome ou unidade podem gerar linhas separadas. Descontos e acréscimos gerais não são rateados entre os produtos.</p>
          </div>
          {report.products.length === 0 ? <p className="p-6 text-zinc-400">Nenhum produto vendido neste período.</p> : <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="sr-only">Produtos ordenados pelo subtotal dos itens, do maior para o menor</caption>
              <thead className="text-zinc-400 bg-zinc-950/50"><tr><th scope="col" className="p-4">Produto</th><th scope="col" className="p-4 text-right">Quantidade</th><th scope="col" className="p-4 text-right">Subtotal dos itens</th></tr></thead>
              <tbody>{report.products.map(p => <tr key={JSON.stringify([p.productId, p.name, p.unit])} className="border-t border-zinc-800">
                <td className="p-4 break-words">{p.name || 'Produto sem nome registrado'}</td>
                <td className="p-4 text-right whitespace-nowrap">{Number(p.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {p.unit}</td>
                <td className="p-4 text-right whitespace-nowrap">{money(p.itemSubtotal)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>
      </>}
    </section>
  </div>;
}
