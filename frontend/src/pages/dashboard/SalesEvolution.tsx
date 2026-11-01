import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DailySales {
  date: string;
  revenue: string;
  transactions: number;
}
export interface SalesComparison {
  startDate: string; endDate: string; days: number;
  revenue: string; transactions: number; averageTicket: string;
  revenueDifference: string; revenueChangePercent: string | null; includesOpenDays: boolean;
}
const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function SalesEvolution({ daily, comparison, includesOpenDays }: {
  daily: DailySales[]; comparison: SalesComparison; includesOpenDays: boolean;
}) {
  const chart = daily.map(day => ({ ...day, total: Number(day.revenue) }));
  return <section className="space-y-4" aria-label="Evolução e comparação de vendas">
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <h2 className="font-semibold">Comparação com o período anterior</h2>
      <p className="text-sm text-zinc-400">De {dateLabel(comparison.startDate)} a {dateLabel(comparison.endDate)} · {comparison.days} {comparison.days === 1 ? 'dia' : 'dias'} corridos, imediatamente anteriores ao período selecionado.</p>
      {(includesOpenDays || comparison.includesOpenDays) && <p className="text-sm text-amber-300">Comparação parcial: há dias ainda não encerrados ou futuros no intervalo. O período anterior é consultado por dias completos, sem corte no mesmo horário.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div><p className="text-zinc-400">Total vendido anterior</p><p className="font-bold text-lg">{money(comparison.revenue)}</p></div>
        <div><p className="text-zinc-400">Vendas anteriores</p><p className="font-bold text-lg">{comparison.transactions.toLocaleString('pt-BR')}</p></div>
        <div><p className="text-zinc-400">Ticket médio anterior</p><p className="font-bold text-lg">{money(comparison.averageTicket)}</p></div>
      </div>
      <p className="text-sm border-t border-zinc-800 pt-3">
        Variação do total vendido: <strong>{Number(comparison.revenueDifference) > 0 ? '+' : ''}{money(comparison.revenueDifference)}</strong>
        {comparison.revenueChangePercent === null
          ? <span className="text-zinc-400 block mt-1">Sem base positiva no período anterior para calcular o percentual.</span>
          : <span> ({Number(comparison.revenueChangePercent) > 0 ? '+' : ''}{Number(comparison.revenueChangePercent).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)</span>}
      </p>
    </div>
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 min-w-0">
      <h2 className="font-semibold">Evolução diária das vendas</h2>
      <p className="text-xs text-zinc-400 mt-2 mb-4">Total vendido em cada dia do período selecionado. Dias sem vendas registradas aparecem com valor zero.</p>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={chart} accessibilityLayer={false} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tickFormatter={date => dateLabel(String(date)).slice(0, 5)} tick={{ fill: '#a1a1aa', fontSize: 11 }} minTickGap={25} />
            <YAxis width={55} tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={value => Number(value).toLocaleString('pt-BR', { notation: 'compact' })} />
            <Tooltip labelFormatter={label => dateLabel(String(label))} formatter={value => [money(Number(value)), 'Total vendido']}
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 10 }} labelStyle={{ color: '#e4e4e7' }} cursor={{ fill: '#27272a' }} />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-blue-400 py-2">Ver valores por dia</summary>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Vendas diárias do período selecionado</caption>
            <thead className="text-zinc-400"><tr><th scope="col" className="py-3 pr-2">Data</th><th scope="col" className="py-3 px-2 text-right">Vendas</th><th scope="col" className="py-3 pl-2 text-right">Total vendido</th></tr></thead>
            <tbody>{daily.map(day => <tr key={day.date} className="border-t border-zinc-800">
              <td className="py-3 pr-2 whitespace-nowrap">{dateLabel(day.date)}</td>
              <td className="py-3 px-2 text-right">{day.transactions.toLocaleString('pt-BR')}</td>
              <td className="py-3 pl-2 text-right whitespace-nowrap">{money(day.revenue)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  </section>;
}
