import { useCallback, useEffect, useState } from 'react';
import { api, Busy, errorMessage, Field, Modal, Notice, number, Results, useDebounce, type Result, type StockData, type StockRow } from './ui';

interface SyncStatus { tenantLabels: Record<string, string>; missingProducts: { key?: string; barcode?: string; sourceTenantId?: string; sourceProductId?: string; name: string; presentIn: string[]; missingIn: string[] }[] }
export default function Stock({ initialSearch = '' }: { initialSearch?: string }) {
  const [data, setData] = useState<StockData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const query = useDebounce(search);
  const [tenant, setTenant] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'auto' | 'cards' | 'table'>('auto');
  const [edit, setEdit] = useState<{ name: string; tenantId: string; productId: string; expectedStock: number } | null>(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [syncError, setSyncError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try { setData(await api<StockData>('stock')); } catch (e) { setError(errorMessage(e)); }
  }, []);
  const checkSync = useCallback(async () => {
    setSyncError('');
    try { setSync(await api<SyncStatus>('products/sync-status')); } catch (e) { setSyncError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); void checkSync(); }, [load, checkSync]);
  const save = async () => {
    if (!edit || !quantity.trim() || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) { setError('Informe um estoque válido, igual ou maior que zero.'); return; }
    setSaving(true); setError('');
    try { await api('stock-adjust', { ...edit, newStock: Number(quantity) }); setEdit(null); await load(); }
    catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  const synchronize = async () => {
    if (!sync || !selected.length) return;
    setSyncing(true); setSyncError(''); setResults([]);
    try {
      const response = await api<{ results: Result[] }>('products/sync', { products: sync.missingProducts.filter(p => selected.includes(p.key || p.name)).map(p => ({ name: p.name, sourceTenantId: p.sourceTenantId, sourceProductId: p.sourceProductId, targetTenantIds: p.missingIn })) });
      setResults(response.results); setSelected([]); await load(); await checkSync();
    } catch (e) { setSyncError(errorMessage(e)); } finally { setSyncing(false); }
  };
  if (!data) return <>{error ? <><Notice error>{error}</Notice><button onClick={load}>Tentar novamente</button></> : <Busy />}</>;
  const labels = Object.entries(data.tenantLabels).filter(([id]) => !tenant || id === tenant);
  const rows = data.rows.filter(row => {
    if (!`${row.name} ${row.barcode || ''}`.toLocaleLowerCase('pt-BR').includes(query) || (tenant && !row.tenants[tenant])) return false;
    const cells = labels.flatMap(([id]) => row.tenants[id] ? [row.tenants[id]] : []);
    const low = cells.some(c => c.qty < 3);
    return filter === 'all' || (filter === 'low' ? low : !low);
  });
  const editStock = (row: StockRow, tenantId: string) => {
    const name = row.name;
    const cell = row.tenants[tenantId];
    setError(''); setQuantity(String(cell.qty)); setEdit({ name, tenantId, productId: cell.productId, expectedStock: cell.qty });
  };
  return <section className="gp-stack">
    <div className="gp-title"><div><h1>Estoque consolidado</h1><p>Consulte e ajuste o saldo de cada loja.</p></div><button onClick={() => { setSyncOpen(true); void checkSync(); }}>Sincronizar produtos{sync ? ` (${sync.missingProducts.length})` : ''}</button></div>
    <Notice error>{error}</Notice>
    <div className="gp-toolbar">
      <Field label="Buscar produto"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do produto" /></Field>
      <Field label="Loja"><select value={tenant} onChange={e => setTenant(e.target.value)}><option value="">Todas as lojas</option>{Object.entries(data.tenantLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
      <Field label="Saldo"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos</option><option value="low">Estoque baixo</option><option value="ok">Estoque OK</option></select></Field>
      <Field label="Visualização"><select value={view} onChange={e => setView(e.target.value as typeof view)}><option value="auto">Adaptativa</option><option value="cards">Cards</option><option value="table">Tabela</option></select></Field>
    </div>
    <div className={`gp-stock-view gp-view-${view}`}>
      <div className="gp-stock-cards gp-card-grid">{rows.map(row => <article className="gp-panel" key={row.key || row.name}><h2>{row.name}</h2><small>{row.barcode ? `EAN ${row.barcode}` : row.unit}</small><div className="gp-stock-badges">{labels.map(([id, name]) => {
        const cell = row.tenants[id];
        return <button key={id} disabled={!cell} onClick={() => editStock(row, id)} className={cell && cell.qty >= 3 ? 'gp-stock-ok' : 'gp-stock-low'}><span>{name}</span><strong>{cell ? `${number(cell.qty)} ${cell.unit}` : 'Sem cadastro'}</strong>{cell && <small>Ajustar saldo</small>}</button>;
      })}</div></article>)}</div>
      <div className="gp-stock-table gp-table-wrap"><table><thead><tr><th>Produto</th>{labels.map(([id, name]) => <th key={id}>{name}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key || row.name}><th>{row.name}<small>{row.barcode ? `EAN ${row.barcode}` : row.unit}</small></th>{labels.map(([id]) => <td key={id}>{row.tenants[id] ? <button onClick={() => editStock(row, id)}>{number(row.tenants[id].qty)} {row.tenants[id].unit}</button> : '—'}</td>)}</tr>)}</tbody></table></div>
    </div>
    {!rows.length && <p className="gp-empty">Nenhum produto encontrado.</p>}
    <Modal open={!!edit} onClose={() => { if (!saving) setEdit(null); }} title={`Ajustar estoque · ${edit?.name || ''}`}>
      <p>{edit && data.tenantLabels[edit.tenantId]}</p><Field label="Novo saldo"><input autoFocus type="number" min="0" step="0.001" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
      <Notice error>{error}</Notice><button className="gp-primary" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar saldo'}</button>
    </Modal>
    <Modal open={syncOpen} onClose={() => { if (!syncing) setSyncOpen(false); }} title="Sincronizar produtos" maxWidth="680px">
      <p>Copie os produtos selecionados para as lojas em que estão faltando.</p><Notice error>{syncError}</Notice>
      {!sync && !syncError && <Busy />}
      {sync?.missingProducts.map(p => <label className="gp-check-row" key={p.key || p.name}><input type="checkbox" disabled={syncing} checked={selected.includes(p.key || p.name)} onChange={() => setSelected(prev => prev.includes(p.key || p.name) ? prev.filter(n => n !== (p.key || p.name)) : [...prev, p.key || p.name])} /><span><strong>{p.name}</strong>{p.barcode && <small>EAN {p.barcode}</small>}<small>Destino: {p.missingIn.map(id => sync.tenantLabels[id]).join(', ')}</small></span></label>)}
      {sync?.missingProducts.length === 0 && <p>Nenhum produto faltando entre as lojas.</p>}
      {syncing && <Notice>Sincronizando nas lojas selecionadas…</Notice>}
      <Results results={results} labels={data.tenantLabels} />
      <button className="gp-primary" disabled={syncing || !selected.length} onClick={synchronize}>{syncing ? 'Sincronizando…' : 'Sincronizar selecionados'}</button>
    </Modal>
  </section>;
}
