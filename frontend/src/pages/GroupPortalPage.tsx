import React, { useState, useEffect, useCallback } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Modal } from './group-portal/ui';
import TabForecast from './group-portal/Forecast';
import TabEstoque from './group-portal/Stock';
import TabProdutos from './group-portal/Products';
import TabTransferencias from './group-portal/Transfers';
import './group-portal/portal.css';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import {
  BarChart2, Package, Tag, ArrowLeftRight, LogOut, Building2,
  TrendingUp, Star, RefreshCw, AlertCircle,
  Loader2, Activity, DollarSign, Store, Award,
  Clock, AlertTriangle, ArrowRight
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, Cell, LabelList
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantDashboard {
  tenantId: string; alias: string; salesToday: number; salesMonth: number;
  countToday: number; countPeriod: number; topProducts: { productId: string; name: string; imageUrl?: string; totalQty: number }[];
  error?: string;
}
interface DashboardData {
  groupId: string; groupName: string; tenants: TenantDashboard[];
  salesByDate: { date: string; total: number }[];
  salesByHour: { hour: string; total: number }[];
  salesByDayOfWeek: { name: string; total: number }[];
  salesByWeek: { name: string; total: number }[];
  salesByMonth: { name: string; total: number }[];
  payments: { method: string; total: number }[];
}
interface TenantDetail {
  tenantId: string; alias: string;
  recentSales: { id: string; total: number; createdAt: string; itemsCount: number; firstItems: string[]; payments: { method: string; label?: string; value: number }[] }[];
  criticalStock: { id: string; name: string; stock: number; unit: string }[];
}
// ─── Constants ───────────────────────────────────────────────────────────────

const COMPANY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(v) ? v : 0);
const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR').format(Number.isFinite(v) ? v : 0);
function getToken(): string | null { try { return JSON.parse(localStorage.getItem('7bar-auth') || '{}')?.state?.token ?? null; } catch { return null; } }
function authHeaders(): Record<string, string> { return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }; }

const METHOD_DISPLAY: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Crédito', debito: 'Débito', outros: 'Outros' };

// ─── Micro Components ─────────────────────────────────────────────────────────

function Skeleton({ w = '100%', h = '1rem', r = '0.5rem' }: { w?: string; h?: string; r?: string }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg,#27272a 25%,#3f3f46 50%,#27272a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: '999px', padding: '0.12rem 0.45rem' }}>{children}</span>;
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="gp-kpi" style={{ background: 'rgba(20,20,22,0.95)', border: `1px solid ${color}28`, borderRadius: '1rem', padding: '1.25rem 1.5rem', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, ${color}, ${color}44)` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.66rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
        <div style={{ width: '34px', height: '34px', borderRadius: '0.625rem', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      </div>
      <div className="gp-kpi-value" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.03em', marginBottom: '0.375rem', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#52525b' }}>{sub}</div>}
    </div>
  );
}

// ─── Tenant Detail Drawer ─────────────────────────────────────────────────────

function TenantDetailDrawer({ tenantId, tenantAlias, color, onClose }: { tenantId: string; tenantAlias: string; color: string; onClose: () => void }) {
  const [data, setData] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    setLoading(true);
    setFetchError('');
    fetch(`/api/groups/my/tenant-detail/${tenantId}`, { headers: authHeaders() })
      .then(async r => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.message || `HTTP ${r.status}`);
        // Validate expected shape
        if (!Array.isArray(json?.recentSales)) throw new Error('Resposta inválida do servidor');
        setData(json);
      })
      .catch(e => setFetchError(e.message || 'Erro desconhecido'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  return (
    <Modal open side onClose={onClose} title={`Detalhes · ${tenantAlias}`} maxWidth="680px">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#52525b' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem' }}>Conectando à loja...</span>
          </div>
        ) : fetchError || !data ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem' }}>
            <AlertTriangle size={28} color="#f59e0b" />
            <div style={{ color: '#f87171', fontWeight: 600, fontSize: '0.85rem', textAlign: 'center' }}>Não foi possível carregar os detalhes</div>
            <div style={{ color: '#71717a', fontSize: '0.75rem', textAlign: 'center' }}>{fetchError}</div>
          </div>
        ) : (
          <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Critical Stock */}
            {(data.criticalStock?.length ?? 0) > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                  <AlertTriangle size={16} color="#ef4444" />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f87171' }}>Estoque Crítico ({data.criticalStock.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.criticalStock.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.625rem', padding: '0.625rem 0.875rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#e4e4e7', fontWeight: 600 }}>{p.name}</span>
                      <Badge color={p.stock <= 0 ? '#ef4444' : '#f59e0b'}>{p.stock} {p.unit}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Sales */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <Clock size={16} color="#60a5fa" />
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#e4e4e7' }}>Vendas Recentes</span>
              </div>
              {(data.recentSales?.length ?? 0) === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '2rem' }}>Nenhuma venda recente</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {(data.recentSales ?? []).map(s => (
                    <div key={s.id} style={{ background: 'rgba(39,39,42,0.4)', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '0.75rem', padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: 'monospace' }}>{new Date(s.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ fontWeight: 800, color: '#4ade80', fontSize: '0.9rem' }}>{fmt(s.total)}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.4rem' }}>{(s.firstItems ?? []).join(', ')}{(s.itemsCount ?? 0) > 3 ? ` +${s.itemsCount - 3}` : ''}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {(s.payments ?? []).map((p, i) => (
                          <span key={i} style={{ fontSize: '0.6rem', fontWeight: 700, color: '#60a5fa', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '999px', padding: '0.1rem 0.5rem' }}>
                            {p.label || METHOD_DISPLAY[p.method] || p.method}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
    </Modal>
  );
}

// ─── Store Card ───────────────────────────────────────────────────────────────

function StoreCard({ t, color, rank, totalToday, onClick }: { t: TenantDashboard; color: string; rank: number; totalToday: number; onClick: () => void }) {
  const pct = totalToday > 0 ? (t.salesToday / totalToday) * 100 : 0;
  const avgTicket = t.countPeriod > 0 ? t.salesMonth / t.countPeriod : 0;
  return (
    <div role="button" tabIndex={0} aria-label={`Ver detalhes de ${t.alias}`} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} style={{ background: 'rgba(20,20,22,0.95)', border: `1px solid ${color}25`, borderRadius: '1rem', padding: '1.25rem', overflow: 'hidden', position: 'relative', transition: 'all 0.25s', cursor: 'pointer' }}
      onClick={onClick}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = 'translateY(-3px)'; d.style.boxShadow = `0 16px 48px ${color}20`; d.style.borderColor = `${color}60`; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.transform = ''; d.style.boxShadow = ''; d.style.borderColor = `${color}25`; }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '0.625rem', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0, fontWeight: 800 }}>
          {rank === 1 ? <Award size={17} /> : <span style={{ fontSize: '0.85rem' }}>{rank}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.alias}</div>
          <Badge color={color}>Ativa</Badge>
        </div>
        <div style={{ fontSize: '0.65rem', color: '#52525b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
          <ArrowRight size={11} /> Ver detalhes
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1rem' }}>
        {[
          { label: 'Hoje', value: fmt(t.salesToday), color: '#4ade80' },
          { label: 'Período', value: fmt(t.salesMonth), color: '#60a5fa' },
          { label: 'Ticket Médio', value: fmt(avgTicket), color: '#a78bfa' },
          { label: 'Transações no período', value: fmtNum(t.countPeriod), color: '#fb923c' },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(39,39,42,0.4)', border: '1px solid rgba(63,63,70,0.3)', borderRadius: '0.625rem', padding: '0.625rem 0.75rem' }}>
            <div style={{ fontSize: '0.58rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '0.2rem' }}>{m.label}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '0.62rem', color: '#71717a' }}>Participação hoje</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height: '5px', background: 'rgba(39,39,42,0.8)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: '999px', transition: 'width 1s ease' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────────

function TabDashboard({ dateFilter }: { dateFilter: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartGrouping, setChartGrouping] = useState<'hour' | 'day' | 'week' | 'month'>('hour');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedTenant, setSelectedTenant] = useState<{ id: string; alias: string; color: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let q = '';
      const now = new Date();
      if (dateFilter === '7d') { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); q = `?startDate=${d.toISOString()}&endDate=${now.toISOString()}`; }
      else if (dateFilter === '30d') { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); q = `?startDate=${d.toISOString()}&endDate=${now.toISOString()}`; }
      else if (dateFilter === 'hoje') { const d = new Date(); d.setHours(0, 0, 0, 0); q = `?startDate=${d.toISOString()}&endDate=${now.toISOString()}`; }
      const res = await fetch(`/api/groups/my/dashboard${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastRefresh(new Date());
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="gp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '1rem' }}>
        {[...Array(4)].map((_, i) => (<div key={i} style={{ background: '#141416', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}><Skeleton h="0.7rem" w="55%" /><Skeleton h="2.2rem" w="75%" /><Skeleton h="0.6rem" w="40%" /></div>))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem', gap: '0.75rem', color: '#52525b' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.875rem' }}>Conectando às lojas...</span>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5rem', gap: '1rem', color: '#f87171' }}>
      <AlertCircle size={36} />
      <div style={{ fontWeight: 600 }}>Erro ao carregar dados</div>
      <div style={{ fontSize: '0.8rem', color: '#71717a' }}>{error}</div>
      <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.25rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.625rem', color: '#f87171', cursor: 'pointer', fontWeight: 600 }}>
        <RefreshCw size={14} /> Tentar novamente
      </button>
    </div>
  );

  if (!data) return null;

  const valid = data.tenants.filter(t => !t.error);
  const totalToday = valid.reduce((s, t) => s + t.salesToday, 0);
  const totalMonth = valid.reduce((s, t) => s + t.salesMonth, 0);
  const totalTxns = valid.reduce((s, t) => s + t.countPeriod, 0);
  const avgTicket = totalTxns > 0 ? totalMonth / totalTxns : 0;
  const best = valid.reduce((b, t) => (!b || t.salesMonth > b.salesMonth ? t : b), valid[0]);
  const sorted = [...valid].sort((a, b) => b.salesToday - a.salesToday);

  const productMap: Record<string, { name: string; qty: number; imageUrl?: string }> = {};
  for (const t of data.tenants) {
    for (const p of t.topProducts) {
      if (productMap[p.name]) productMap[p.name].qty += p.totalQty;
      else productMap[p.name] = { name: p.name, qty: p.totalQty, imageUrl: p.imageUrl };
    }
  }
  const topProducts = Object.entries(productMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 15);

  let activeChartData: { name: string; total: number }[] = [];
  if (chartGrouping === 'hour') activeChartData = data.salesByHour?.map(d => ({ name: d.hour, total: d.total })) || [];
  else if (chartGrouping === 'day') activeChartData = data.salesByDate?.map(d => ({ name: d.date.split('-').slice(1).reverse().join('/'), total: d.total })) || [];
  else if (chartGrouping === 'week') activeChartData = data.salesByWeek || [];
  else if (chartGrouping === 'month') activeChartData = data.salesByMonth || [];

  const maxTotal = activeChartData.reduce((max, item) => (item.total > max ? item.total : max), 0);
  const chartDataWithPeak = activeChartData.map(item => ({ ...item, isPeak: maxTotal > 0 && item.total === maxTotal }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (<div style={{ background: '#18181b', border: '1px solid rgba(63,63,70,0.8)', padding: '0.75rem', borderRadius: '0.5rem' }}><div style={{ color: '#a1a1aa', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{label}</div><div style={{ color: '#4ade80', fontWeight: 700 }}>{fmt(payload[0].value)}</div></div>);
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', animation: 'fadeIn 0.3s ease' }}>
      {selectedTenant && (
        <TenantDetailDrawer tenantId={selectedTenant.id} tenantAlias={selectedTenant.alias} color={selectedTenant.color} onClose={() => setSelectedTenant(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#f4f4f5' }}>{data.groupName}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span style={{ fontSize: '0.7rem', color: '#52525b' }}>{valid.length} lojas · Atualizado {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '0.625rem', color: '#60a5fa', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="gp-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <KpiCard label="Vendas Hoje" value={fmt(totalToday)} sub={`${valid.length} lojas operando`} color="#4ade80" icon={<TrendingUp />} />
        <KpiCard label="Total do Período" value={fmt(totalMonth)} sub="Acumulado" color="#60a5fa" icon={<BarChart2 />} />
        <KpiCard label="Ticket Médio" value={fmt(avgTicket)} sub="Média por transação" color="#a78bfa" icon={<DollarSign />} />
        {best && <KpiCard label="Destaque no Período" value={fmt(best.salesMonth)} sub={best.alias} color="#f59e0b" icon={<Award />} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Store size={18} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e4e4e7' }}>Desempenho por Loja</span>
          <span style={{ fontSize: '0.68rem', color: '#52525b', marginLeft: '0.25rem' }}>• clique para ver detalhes</span>
        </div>
        {data.tenants.filter(t => t.error).map(t => <div className="gp-notice is-error" key={t.tenantId}>{t.alias}: dados indisponíveis. Os totais estão parciais.</div>)}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem' }}>
          {sorted.map((t, i) => (
            <StoreCard key={t.tenantId} t={t} color={COMPANY_COLORS[i % COMPANY_COLORS.length]} rank={i + 1} totalToday={totalToday}
              onClick={() => setSelectedTenant({ id: t.tenantId, alias: t.alias, color: COMPANY_COLORS[i % COMPANY_COLORS.length] })} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="gp-chart-panel" style={{ background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '1rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#60a5fa' }}>
              <Activity size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e4e4e7' }}>Evolução de Vendas (Grupo)</span>
            </div>
            {data.salesByDate.length > 0 ? (
              <div style={{ height: '240px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salesByDate} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis minTickGap={24} interval="preserveStartEnd" dataKey="date" stroke="#52525b" fontSize={10} tickFormatter={(val) => val.split('-').slice(1).reverse().join('/')} />
                    <YAxis width={52} tickCount={5} stroke="#52525b" fontSize={10} tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area isAnimationActive={false} type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '0.85rem' }}>Sem vendas no período</div>}
          </div>

          <div className="gp-chart-panel" style={{ background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '1rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                <Clock size={18} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e4e4e7' }}>Vendas por {chartGrouping === 'hour' ? 'Hora' : chartGrouping === 'day' ? 'Dia' : chartGrouping === 'week' ? 'Semana' : 'Mês'}</span>
              </div>
              <div style={{ display: 'flex', background: '#09090b', border: '1px solid rgba(63,63,70,0.4)', padding: '0.25rem', borderRadius: '0.75rem' }}>
                {(['hour', 'day', 'week', 'month'] as const).map((g) => (
                  <button key={g} onClick={() => setChartGrouping(g)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: chartGrouping === g ? '#2563eb' : 'transparent', color: chartGrouping === g ? '#fff' : '#a1a1aa' }}>
                    {g === 'hour' ? 'Hora' : g === 'day' ? 'Dia' : g === 'week' ? 'Semana' : 'Mês'}
                  </button>
                ))}
              </div>
            </div>
            {chartDataWithPeak.length > 0 ? (
              <div style={{ height: '260px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataWithPeak} margin={{ top: 35, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBarPeak" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={1} /><stop offset="100%" stopColor="#d97706" stopOpacity={0.8} /></linearGradient>
                      <linearGradient id="colorBarNormal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={1} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0.8} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis minTickGap={24} interval="preserveStartEnd" dataKey="name" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis width={52} tickCount={5} stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$ ${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}`} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: '#18181b', border: '1px solid rgba(63,63,70,0.8)', borderRadius: '0.75rem' }} formatter={(value) => [fmt(Number(value ?? 0)), 'Faturamento']} />
                    <Bar isAnimationActive={false} dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {chartDataWithPeak.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.isPeak ? 'url(#colorBarPeak)' : 'url(#colorBarNormal)'} />))}
                      {chartDataWithPeak.length <= 4 && <LabelList dataKey="total" position="top" fill="#e4e4e7" fontSize={11} fontWeight={700} formatter={(val) => Number(val ?? 0) >= 1000 ? 'R$ ' + (Number(val) / 1000).toFixed(1) + 'k' : 'R$ ' + Math.round(Number(val ?? 0))} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '0.85rem' }}>Sem dados</div>}
          </div>

          <div className="gp-chart-panel" style={{ background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '1rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#10b981' }}>
              <DollarSign size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e4e4e7' }}>Meios de Pagamento</span>
            </div>
            {data.payments?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {data.payments.slice().sort((a, b) => b.total - a.total).map((entry, index) => {
                  const totalAll = data.payments.reduce((acc, curr) => acc + curr.total, 0);
                  const pct = (totalAll > 0 ? (entry.total / totalAll) * 100 : 0).toFixed(1);
                  const color = COMPANY_COLORS[index % COMPANY_COLORS.length];
                  return (
                    <div key={entry.method} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                          <span style={{ color: '#d4d4d8', fontWeight: 600 }}>{METHOD_DISPLAY[entry.method] || entry.method}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <span style={{ color: '#a1a1aa' }}>{pct}%</span>
                          <span style={{ color, fontWeight: 700 }}>{fmt(entry.total)}</span>
                        </div>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(39,39,42,0.8)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: '999px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ padding: '2rem', textAlign: 'center', color: '#52525b', fontSize: '0.85rem' }}>Sem dados de pagamento</div>}
          </div>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 0, background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(63,63,70,0.4)', borderRadius: '1rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: '#f59e0b' }}>
            <Star size={18} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e4e4e7' }}>Top Produtos — Consolidado</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {topProducts.map(([id, p], i) => {
              const maxQ = topProducts[0][1].qty;
              const pct = maxQ > 0 ? (p.qty / maxQ) * 100 : 0;
              const color = COMPANY_COLORS[i % COMPANY_COLORS.length];
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#71717a', fontWeight: 600, width: '16px' }}>#{i + 1}</span>
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} /> : <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(63,63,70,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Star size={12} color="#a1a1aa" /></div>}
                      <span style={{ color: '#d4d4d8', fontWeight: 600 }}>{p.name}</span>
                    </div>
                    <span style={{ color, fontWeight: 700 }}>{fmtNum(p.qty)} un</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(39,39,42,0.8)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: '999px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: BarChart2 },
  { id: 'forecast', label: 'Previsão de compras', short: 'Compras', icon: TrendingUp },
  { id: 'estoque', label: 'Estoque', short: 'Estoque', icon: Package },
  { id: 'produtos', label: 'Produtos', short: 'Produtos', icon: Tag },
  { id: 'transferencias', label: 'Transferências', short: 'Transf.', icon: ArrowLeftRight },
] as const;
type TabId = typeof TABS[number]['id'];

export default function GroupPortalPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [dateFilter, setDateFilter] = useState('30d');
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [stockSearch, setStockSearch] = useState('');
  useEffect(() => {
    if (!getToken() || !user || (user.role !== 'group_owner' && !user.groupId)) navigate('/login', { replace: true });
  }, [user, navigate]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (!user) return null;
  const changeTab = (id: TabId) => { setActiveTab(id); setMenuOpen(false); setStockSearch(''); window.scrollTo({ top: 0 }); };
  const exit = () => { logout(); navigate('/login', { replace: true }); };
  const active = TABS.find(t => t.id === activeTab)!;
  return <div className={`group-portal ${collapsed ? 'gp-collapsed' : ''}`}>
    <aside className="gp-sidebar" aria-label="Menu principal">
      <div className="gp-brand"><Building2 size={28} /><span><strong>Portal Grupo</strong><small>Multiempresas</small></span></div>
      <button className="gp-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? <PanelLeftOpen size={20} /> : <><PanelLeftClose size={20} /><span>Recolher</span></>}</button>
      <nav>{TABS.map(t => <button key={t.id} title={t.label} aria-label={t.label} aria-current={activeTab === t.id ? 'page' : undefined} className={activeTab === t.id ? 'is-active' : ''} onClick={() => changeTab(t.id)}><t.icon size={20} /><span>{t.label}</span></button>)}</nav>
      <footer><strong>{user.name}</strong><small>Gestor do grupo</small><button onClick={exit} aria-label="Sair do portal"><LogOut size={18} /><span>Sair</span></button></footer>
    </aside>
    <div className="gp-workspace">
      <header className="gp-header">
        <div className="gp-header-identity"><span className="gp-mobile-only gp-eyebrow">Portal Grupo</span><strong className="gp-mobile-only gp-manager">{user.name}</strong><strong className="gp-desktop-only">{active.label}</strong></div>
        <div className={`gp-online ${online ? '' : 'is-offline'}`} role="status"><i />{online ? 'Online' : 'Offline'}</div>
        <button className="gp-mobile-only gp-icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
        <div className="gp-period" role="group" aria-label="Período do dashboard">{[{ id: 'hoje', text: 'Hoje' }, { id: '7d', text: '7D' }, { id: '30d', text: '30D' }].map(p => <button key={p.id} aria-pressed={dateFilter === p.id} className={dateFilter === p.id ? 'is-active' : ''} onClick={() => setDateFilter(p.id)}>{p.text}</button>)}<span className="gp-mobile-only">{activeTab === 'dashboard' ? 'Período de análise' : 'Período do dashboard'}</span></div>
      </header>
      <main className="gp-main">
        {activeTab === 'dashboard' && <TabDashboard key={dateFilter} dateFilter={dateFilter} />}
        {activeTab === 'forecast' && <TabForecast onStock={name => { setStockSearch(name); setActiveTab('estoque'); window.scrollTo({ top: 0 }); }} />}
        {activeTab === 'estoque' && <TabEstoque initialSearch={stockSearch} />}
        {activeTab === 'produtos' && <TabProdutos />}
        {activeTab === 'transferencias' && <TabTransferencias />}
      </main>
    </div>
    <nav className="gp-bottom-nav" aria-label="Navegação do portal">{TABS.map(t => <button key={t.id} aria-current={activeTab === t.id ? 'page' : undefined} className={activeTab === t.id ? 'is-active' : ''} onClick={() => changeTab(t.id)}><t.icon size={21} /><span>{t.short}</span></button>)}</nav>
    <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Sua conta" drawer><div className="gp-stack"><strong>{user.name}</strong><p>Gestor do grupo</p>{TABS.map(t => <button key={t.id} onClick={() => changeTab(t.id)}><t.icon size={18} /> {t.label}</button>)}<button className="gp-logout" onClick={exit}><LogOut size={18} /> Sair do portal</button></div></Modal>
  </div>;
}
