import { useCallback, useEffect, useState } from 'react';
import { api, Busy, errorMessage, Field, Notice, number, type StockData } from './ui';
interface Transfer { id: string; productName: string; unit: string; quantity: number; fromAlias: string; toAlias: string; createdAt: string; status: 'completed' | 'pending' | 'cancelled' }
export default function Transfers() {
  const [stock, setStock] = useState<StockData | null>(null);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ fromTenantId: '', toTenantId: '', productId: '', quantity: '' });
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    try { setStock(await api<StockData>('stock')); } catch (e) { setError(errorMessage(e)); }
  }, []);
  const loadHistory = useCallback(async () => {
    setHistoryError('');
    try { const data = await api<{ transfers: Transfer[]; unavailableTenants: string[] }>('stock-transfers'); setHistory(data.transfers); if (data.unavailableTenants.length) setHistoryError('Histórico parcial: há lojas indisponíveis.'); }
    catch (e) { setHistoryError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); void loadHistory(); }, [load, loadHistory]);
  const products = stock?.rows.filter(r => r.tenants[form.fromTenantId]?.qty > 0) || [];
  const selected = products.find(r => r.tenants[form.fromTenantId].productId === form.productId);
  const cell = selected?.tenants[form.fromTenantId];
  const quantity = Number(form.quantity);
  const valid = !!cell && !!form.toTenantId && form.fromTenantId !== form.toTenantId && Number.isFinite(quantity) && quantity > 0 && quantity <= cell.qty && Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001;
  const transfer = async () => {
    if (!valid || sending) return;
    setSending(true); setError(''); setMessage('');
    try {
      await api('stock-transfer', { ...form, quantity });
      setMessage('Transferência concluída. Os saldos foram atualizados.'); setForm(prev => ({ ...prev, productId: '', quantity: '' }));
    } catch (e) { setError(errorMessage(e)); }
    finally { await load(); await loadHistory(); setSending(false); }
  };
  if (!stock) return error ? <><Notice error>{error}</Notice><button onClick={load}>Tentar novamente</button></> : <Busy />;
  return <section className="gp-stack"><div className="gp-title"><div><h1>Transferências</h1><p>Movimente o estoque entre as lojas do grupo.</p></div></div>
    <div className="gp-transfer-layout"><div className="gp-panel gp-stack">
      <Field label="1. Loja de origem"><select disabled={sending} value={form.fromTenantId} onChange={e => setForm(prev => ({ ...prev, fromTenantId: e.target.value, toTenantId: prev.toTenantId === e.target.value ? '' : prev.toTenantId, productId: '', quantity: '' }))}><option value="">Selecione a origem</option>{Object.entries(stock.tenantLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
      <Field label="2. Loja de destino"><select disabled={sending || !form.fromTenantId} value={form.toTenantId} onChange={e => setForm({ ...form, toTenantId: e.target.value })}><option value="">Selecione o destino</option>{Object.entries(stock.tenantLabels).filter(([id]) => id !== form.fromTenantId).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>
      <Field label="3. Produto e saldo disponível"><select disabled={!form.fromTenantId || sending} value={form.productId} onChange={e => setForm({ ...form, productId: e.target.value, quantity: '' })}><option value="">Selecione o produto</option>{products.map(r => <option key={r.key || r.name} value={r.tenants[form.fromTenantId].productId}>{r.name}{r.barcode ? ` [${r.barcode}]` : ''} · {number(r.tenants[form.fromTenantId].qty)} {r.tenants[form.fromTenantId].unit}</option>)}</select></Field>
      {cell && <Notice>Saldo disponível: <strong>{number(cell.qty)} {cell.unit}</strong></Notice>}
      <Field label="4. Quantidade"><input disabled={!cell || sending} type="number" min="0.001" max={cell?.qty} step="0.001" inputMode="decimal" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="Ex.: 10" /></Field>
      {!!form.quantity && !valid && <Notice error>Confira destino e quantidade. O valor deve ser positivo, com até 3 casas decimais, e não pode superar o saldo disponível.</Notice>}
      <Notice error>{error}</Notice><Notice>{message}</Notice>
      <button className="gp-primary" disabled={!valid || sending} onClick={transfer}>{sending ? 'Transferindo…' : 'Confirmar transferência'}</button>
    </div><div className="gp-panel"><div className="gp-title"><h2>Últimas 5 transferências</h2><button onClick={loadHistory}>Atualizar</button></div><Notice error>{historyError}</Notice>{history.map(t => <article className="gp-history-item" key={t.id}><strong>{t.productName}</strong><p>{t.fromAlias} → {t.toAlias}</p><p>{number(t.quantity)} {t.unit} · {new Date(t.createdAt).toLocaleString('pt-BR')}</p><span className={t.status === 'completed' ? 'gp-success' : 'gp-warning'}>{t.status === 'completed' ? 'Concluída' : t.status === 'cancelled' ? 'Cancelada · saldo restaurado' : 'Pendente de conferência'}</span>{t.status === 'pending' && <small>Referência: {t.id}</small>}</article>)}{!history.length && !historyError && <p>Nenhuma transferência registrada.</p>}</div></div>
  </section>;
}
