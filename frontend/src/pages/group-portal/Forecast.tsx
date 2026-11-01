import { useEffect, useState } from 'react';
import { api, Busy, errorMessage, Field, Notice, number } from './ui';
interface Row { productId: string; name: string; totalStock: number; avgDailySales: number; autonomyDays: number | null; suggestion: number }
export default function Forecast({ onStock }: { onStock: (name: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<Row[]>(`purchase-forecast?daysToForecast=${days}`, undefined, 'GET', controller.signal).then(setRows).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days]);
  const autonomy = (row: Row) => row.autonomyDays === null || !Number.isFinite(row.autonomyDays) ? 'Sem histórico' : `${number(row.autonomyDays)} dias`;
  return <section className="gp-stack"><div className="gp-title"><div><h1>Previsão de compras</h1><p>Reposição estimada a partir das vendas dos últimos 30 dias.</p></div><Field label="Cobertura desejada"><select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 15, 30].map(d => <option key={d} value={d}>{d} dias</option>)}</select></Field></div>
    <Notice error>{error}</Notice>{loading ? <Busy /> : !error && <>
      <div className="gp-mobile-only gp-card-grid">{rows.map(row => <details className="gp-panel gp-forecast-card" key={row.productId}><summary><strong>{row.name}</strong><span className={row.suggestion > 0 ? 'gp-warning' : 'gp-success'}>{row.suggestion > 0 ? `Comprar ${number(row.suggestion)}` : 'Sem reposição sugerida'}</span></summary><dl><div><dt>Estoque atual</dt><dd>{number(row.totalStock)}</dd></div><div><dt>Autonomia</dt><dd>{autonomy(row)}</dd></div><div><dt>Venda média / dia</dt><dd>{number(row.avgDailySales)}</dd></div><div><dt>Sugestão de compra</dt><dd>{number(row.suggestion)}</dd></div></dl><button onClick={() => onStock(row.name)}>Conferir estoque nas lojas</button></details>)}</div>
      <div className="gp-desktop-only gp-table-wrap"><table><thead><tr>{['Produto', 'Estoque', 'Média/dia', 'Autonomia', 'Comprar', 'Ação'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.productId}><th>{row.name}</th><td>{number(row.totalStock)}</td><td>{number(row.avgDailySales)}</td><td>{autonomy(row)}</td><td>{number(row.suggestion)}</td><td><button onClick={() => onStock(row.name)}>Conferir estoque</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="gp-empty">Nenhum produto ativo para calcular a previsão.</p>}
    </>}
  </section>;
}
