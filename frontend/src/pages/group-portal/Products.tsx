import { useCallback, useEffect, useState } from 'react';
import { api, Busy, errorMessage, Field, Modal, money, Notice, Results, useDebounce, type CatalogData, type CatalogRow, type Result } from './ui';

export default function Products() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const query = useDebounce(search);
  const [edit, setEdit] = useState<CatalogRow | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [samePrice, setSamePrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const blank = { name: '', barcode: '', ncm: '', unit: 'UN', categoryName: 'Geral', priceCost: '' };
  const [form, setForm] = useState(blank);
  const load = useCallback(async () => {
    try { setData(await api<CatalogData>('products-catalog')); } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const openPrice = (row: CatalogRow, tenantId?: string) => {
    setEdit(row); setPrices(Object.fromEntries(Object.entries(row.tenants).map(([id, cell]) => [id, String(cell.priceSell)])));
    setSelected(tenantId ? [tenantId] : Object.keys(row.tenants)); setSamePrice(''); setResults([]); setError('');
  };
  const save = async () => {
    if (!selected.length || selected.some(id => !prices[id]?.trim() || !Number.isFinite(Number(prices[id])) || Number(prices[id]) < 0)) { setError('Selecione as lojas e informe preços válidos, iguais ou maiores que zero.'); return; }
    if (createOpen && (!form.name.trim() || !form.categoryName.trim() || !form.priceCost.trim() || !Number.isFinite(Number(form.priceCost)) || Number(form.priceCost) < 0)) { setError('Preencha nome, categoria e custo válido.'); return; }
    setSaving(true); setError(''); setResults([]);
    try {
      const response = createOpen
        ? await api<{ results: Result[] }>('products/create-in-tenants', { ...form, name: form.name.trim(), priceCost: Number(form.priceCost), tenantPrices: selected.map(id => ({ tenantId: id, priceSell: Number(prices[id]) })) })
        : await api<{ results: Result[] }>('products/price-per-tenant', { productName: edit!.name, updates: selected.map(id => ({ tenantId: id, productId: edit!.tenants[id].id, priceSell: Number(prices[id]) })) }, 'PATCH');
      setResults(response.results);
      setSelected(response.results.filter(r => !r.success && r.tenantId).map(r => r.tenantId!));
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  };
  if (!data) return error ? <><Notice error>{error}</Notice><button onClick={load}>Tentar novamente</button></> : <Busy />;
  const rows = data.rows.filter(r => `${r.name} ${r.barcode || ''}`.toLocaleLowerCase('pt-BR').includes(query));
  const editableIds = createOpen ? Object.keys(data.tenantLabels) : Object.keys(edit?.tenants || {});
  return <section className="gp-stack">
    <div className="gp-title"><div><h1>Produtos do grupo</h1><p>{data.rows.length} produtos · Preços por filial</p></div><button className="gp-primary" onClick={() => { setCreateOpen(true); setForm(blank); setPrices({}); setSelected(Object.keys(data.tenantLabels)); setResults([]); setError(''); }}>Criar produto</button></div>
    <Notice error>{error}</Notice><Field label="Buscar produto"><input type="search" placeholder="Nome do produto" value={search} onChange={e => setSearch(e.target.value)} /></Field>
    <div className="gp-mobile-only gp-card-grid">{rows.map(row => <button className="gp-panel gp-product-card" key={row.key || row.name} onClick={() => openPrice(row)}><strong>{row.name}</strong><small>{row.barcode ? `EAN ${row.barcode}` : row.unit}</small>{Object.entries(row.tenants).map(([id, cell]) => <span key={id}><span>{data.tenantLabels[id]}</span><b>{money(cell.priceSell)}</b></span>)}<small>Ajustar preços nas filiais →</small></button>)}</div>
    <div className="gp-desktop-only gp-table-wrap"><table><thead><tr><th>Produto</th>{Object.entries(data.tenantLabels).map(([id, label]) => <th key={id}>{label}</th>)}<th>Ação</th></tr></thead><tbody>{rows.map(row => <tr key={row.key || row.name}><th>{row.name}<small>{row.barcode ? `EAN ${row.barcode}` : row.unit}</small></th>{Object.keys(data.tenantLabels).map(id => <td key={id}>{row.tenants[id] ? <button onClick={() => openPrice(row, id)}>{money(row.tenants[id].priceSell)}</button> : 'Sem cadastro'}</td>)}<td><button onClick={() => openPrice(row)}>Editar / Equalizar</button></td></tr>)}</tbody></table></div>
    {!rows.length && <p className="gp-empty">Nenhum produto encontrado.</p>}
    <Modal open={!!edit || createOpen} onClose={() => { if (!saving) { setEdit(null); setCreateOpen(false); } }} title={createOpen ? 'Criar produto nas lojas' : `Preços · ${edit?.name}`}>
      {createOpen && <div className="gp-stack"><Field label="Nome do produto"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><div className="gp-form-grid"><Field label="Código de barras"><input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></Field><Field label="NCM"><input value={form.ncm} onChange={e => setForm({ ...form, ncm: e.target.value })} /></Field><Field label="Unidade"><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>{['UN', 'KG', 'LT', 'CX', 'DZ', 'PCT', 'ML'].map(u => <option key={u}>{u}</option>)}</select></Field><Field label="Categoria"><input value={form.categoryName} onChange={e => setForm({ ...form, categoryName: e.target.value })} /></Field></div><Field label="Preço de custo"><input type="number" min="0" step="0.01" inputMode="decimal" value={form.priceCost} onChange={e => setForm({ ...form, priceCost: e.target.value })} /></Field></div>}
      <p>Selecione as filiais que receberão a alteração.</p>
      {!createOpen && <div className="gp-equalize"><Field label="Mesmo preço para as selecionadas"><input type="number" min="0" step="0.01" inputMode="decimal" value={samePrice} onChange={e => setSamePrice(e.target.value)} /></Field><button disabled={!samePrice.trim() || !Number.isFinite(Number(samePrice)) || Number(samePrice) < 0 || !selected.length || saving} onClick={() => setPrices(prev => ({ ...prev, ...Object.fromEntries(selected.map(id => [id, samePrice])) }))}>Aplicar</button></div>}
      {editableIds.map(id => <div className="gp-price-row" key={id}><label className="gp-check-row"><input type="checkbox" disabled={saving} checked={selected.includes(id)} onChange={() => setSelected(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])} /><span>{data.tenantLabels[id]}</span></label><Field label="Preço de venda (R$)"><input aria-label={`Preço em ${data.tenantLabels[id]}`} type="number" min="0" step="0.01" inputMode="decimal" disabled={!selected.includes(id) || saving} value={prices[id] || ''} onChange={e => setPrices(prev => ({ ...prev, [id]: e.target.value }))} /></Field></div>)}
      <Notice error>{error}</Notice><Results results={results} labels={data.tenantLabels} />
      <button className="gp-primary" onClick={save} disabled={saving || !selected.length}>{saving ? 'Salvando…' : createOpen ? 'Criar nas lojas selecionadas' : 'Salvar preços selecionados'}</button>
    </Modal>
  </section>;
}
