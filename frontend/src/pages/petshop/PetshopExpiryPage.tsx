import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  CalendarClock, AlertTriangle, CheckCircle2,
  Package, Search, Download, RefreshCw, Loader2, Truck, X
} from 'lucide-react';
import { toast } from 'sonner';
import { CatalogTabs, PageHeader, pageClass, primaryButton, secondaryButton, inputClass } from './ui';
import { money } from './types';

interface ExpiringLot {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  supplierId: string | null;
  supplierName: string | null;
  lotNumber: string | null;
  costPrice: number;
  quantity: number;
  remaining: number;
  expiresAt: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  createdAt: string;
}

type FilterStatus = 'all' | 'expired' | 'warning' | 'ok';

function getStatusBadge(lot: ExpiringLot, alertDays: number) {
  const days = lot.daysUntilExpiry;
  if (days === null) {
    return <span className="pc-status pc-status--neutral">Sem validade</span>;
  }
  if (lot.isExpired || days < 0) {
    return <span className="pc-status pc-status--danger">Vencido há {Math.abs(days)}d</span>;
  }
  if (days === 0) {
    return <span className="pc-status pc-status--danger">Vence HOJE</span>;
  }
  if (days <= alertDays) {
    return <span className="pc-status pc-status--warning">Vence em {days}d</span>;
  }
  return <span className="pc-status pc-status--success">Vence em {days}d</span>;
}

export default function PetshopExpiryPage() {
  const [lots, setLots] = useState<ExpiringLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDays, setAlertDays] = useState(30);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchText, setSearchText] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const loadLots = async () => {
    setLoading(true);
    try {
      const [settingsRes, lotsRes] = await Promise.all([
        api.get('/products/settings'),
        api.get('/products/lots/expiring?days=365'),
      ]);
      setAlertDays(settingsRes.data?.expiryAlertDays ?? 30);
      setLots(lotsRes.data || []);
    } catch {
      toast.error('Erro ao carregar validades de lotes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLots();
  }, []);

  const suppliersList = useMemo(() => {
    const map = new Map<string, string>();
    for (const lot of lots) {
      if (lot.supplierId && lot.supplierName) {
        map.set(lot.supplierId, lot.supplierName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [lots]);

  const counts = useMemo(() => ({
    expired: lots.filter(l => l.isExpired || (l.daysUntilExpiry !== null && l.daysUntilExpiry < 0)).length,
    warning: lots.filter(l => !l.isExpired && l.daysUntilExpiry !== null && l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= alertDays).length,
    ok: lots.filter(l => !l.isExpired && l.daysUntilExpiry !== null && l.daysUntilExpiry > alertDays).length,
  }), [lots, alertDays]);

  const filtered = useMemo(() => {
    return lots.filter(lot => {
      const days = lot.daysUntilExpiry;
      const isExp = lot.isExpired || (days !== null && days < 0);
      const isWarn = !lot.isExpired && days !== null && days >= 0 && days <= alertDays;
      const isOk = !lot.isExpired && days !== null && days > alertDays;

      if (filter === 'expired' && !isExp) return false;
      if (filter === 'warning' && !isWarn) return false;
      if (filter === 'ok' && !isOk) return false;

      if (filterSupplier && lot.supplierId !== filterSupplier) return false;

      if (searchText.trim()) {
        const t = searchText.toLowerCase();
        const matchName = lot.productName.toLowerCase().includes(t);
        const matchLot = (lot.lotNumber ?? '').toLowerCase().includes(t);
        if (!matchName && !matchLot) return false;
      }
      return true;
    });
  }, [lots, filter, filterSupplier, searchText, alertDays]);

  const exportCSV = () => {
    const headers = ['Produto', 'Lote', 'Validade', 'Dias Restantes', 'Qtd Restante', 'Fornecedor', 'Status'];
    const rows = filtered.map(lot => {
      const isExp = lot.isExpired || (lot.daysUntilExpiry !== null && lot.daysUntilExpiry < 0);
      const isWarn = !lot.isExpired && lot.daysUntilExpiry !== null && lot.daysUntilExpiry >= 0 && lot.daysUntilExpiry <= alertDays;
      const status = isExp ? 'Vencido' : isWarn ? 'Alerta' : 'Regular';
      const expiresFormatted = lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('pt-BR') : '-';
      return [
        `"${lot.productName.replace(/"/g, '""')}"`,
        `"${lot.lotNumber ?? '-'}"`,
        expiresFormatted,
        lot.daysUntilExpiry ?? '-',
        `${lot.remaining} ${lot.productUnit}`,
        `"${lot.supplierName ?? '-'}"`,
        status,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `validades-petshop-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={pageClass}>
      {/* ===================================================================== */}
      {/* VISÃO MOBILE: Cabeçalho, KPI compacto, pílulas e cards de lotes       */}
      {/* ===================================================================== */}
      <div className="space-y-3.5 pb-6 md:hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">Validades</h1>
            <span className="rounded-full bg-[#e6f4ef] px-2.5 py-0.5 text-xs font-bold text-[#0d6e5a]">
              {lots.length} lotes
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-zinc-500">
            Alerta configurado para até {alertDays} dias do vencimento
          </p>
        </div>

        <CatalogTabs />

        <div className="grid grid-cols-2 divide-x divide-zinc-200/70 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setFilter(filter === 'expired' ? 'all' : 'expired')}
            className="flex items-center gap-3 px-3.5 py-3 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Vencidos</p>
              <p className="text-lg font-extrabold leading-tight text-rose-600">{counts.expired}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
            className="flex items-center gap-3 px-3.5 py-3 text-left"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <CalendarClock size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-zinc-500">Em alerta</p>
              <p className="text-lg font-extrabold leading-tight text-amber-700">{counts.warning}</p>
            </div>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={loadLots}
            disabled={loading}
            className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
          >
            <Download size={14} />
            Exportar CSV
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'all' as const, label: `Todos (${lots.length})` },
              { id: 'expired' as const, label: `Vencidos (${counts.expired})` },
              { id: 'warning' as const, label: `Alerta (${counts.warning})` },
              { id: 'ok' as const, label: `Em dia (${counts.ok})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  filter === tab.id
                    ? 'border-[#0d6e5a] bg-[#0d6e5a] text-white shadow-2xs'
                    : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMobileSearchOpen(v => !v)}
            aria-label="Buscar lote"
            className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition ${
              mobileSearchOpen || searchText
                ? 'border-[#0d6e5a] bg-[#e6f4ef] text-[#0d6e5a]'
                : 'border-zinc-200 bg-white text-zinc-600'
            }`}
          >
            <Search size={16} />
          </button>
        </div>

        {(mobileSearchOpen || searchText) && (
          <div className="relative flex items-center">
            <Search size={15} className="pointer-events-none absolute left-3 text-zinc-400" />
            <input
              type="search"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar produto, lote ou fornecedor..."
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white pr-9 pl-9 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            />
            {searchText && (
              <button type="button" onClick={() => setSearchText('')} className="absolute right-2.5 text-zinc-400">
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-xs text-zinc-500">
            <Loader2 size={18} className="animate-spin text-[#0d6e5a]" />
            Carregando lotes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center text-xs text-zinc-500">
            Nenhum lote encontrado.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map(lot => {
              const expired = lot.isExpired || (lot.daysUntilExpiry !== null && lot.daysUntilExpiry < 0) || lot.daysUntilExpiry === 0;
              const warning = !expired && lot.daysUntilExpiry !== null && lot.daysUntilExpiry <= alertDays;
              const barColor = expired ? 'bg-rose-500' : warning ? 'bg-amber-500' : 'bg-[#0d6e5a]';
              return (
                <article key={lot.id} className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-4 w-[3px] shrink-0 rounded-full ${barColor}`} />
                      <h2 className="truncate text-[15px] font-bold text-zinc-900">{lot.productName}</h2>
                    </div>
                    <div className="shrink-0">{getStatusBadge(lot, alertDays)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <span className="rounded-md bg-[#e6f4ef] px-2 py-0.5 text-[11px] font-semibold text-[#0d6e5a] tabular-nums">
                      Saldo: {lot.remaining} {lot.productUnit}
                    </span>
                    <span className="text-zinc-400">·</span>
                    <span>Val: {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('pt-BR') : '—'}</span>
                    {lot.lotNumber && (
                      <>
                        <span className="text-zinc-400">·</span>
                        <span className="font-mono">Lote {lot.lotNumber}</span>
                      </>
                    )}
                    {lot.supplierName && (
                      <>
                        <span className="text-zinc-400">·</span>
                        <span>{lot.supplierName}</span>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VISÃO DESKTOP                                                         */}
      {/* ===================================================================== */}
      <div className="hidden md:block">
      <PageHeader
        eyebrow="Segurança e Rastreabilidade"
        title="Painel de Validades"
        description={`Monitore datas de validade de rações, medicamentos e produtos. Alerta configurado para até ${alertDays} dias do vencimento.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadLots}
              disabled={loading}
              className={`${secondaryButton} flex items-center gap-2`}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className={`${primaryButton} flex items-center gap-2 disabled:opacity-50`}
            >
              <Download size={15} />
              <span>Exportar CSV</span>
            </button>
          </div>
        }
      />

      <CatalogTabs />

      {/* Resumo do Painel de Validades */}
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setFilter(filter === 'expired' ? 'all' : 'expired')}
          className={`pc-panel p-4 text-left transition-all hover:shadow-sm ${
            filter === 'expired' ? 'ring-2 ring-[var(--pc-danger)]' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-[var(--pc-danger)]">
            <AlertTriangle size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Vencidos</span>
          </div>
          <strong className="mt-2 block text-3xl font-black tabular-nums text-[var(--pc-danger)]">
            {counts.expired}
          </strong>
          <p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">lotes vencidos com saldo em estoque</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
          className={`pc-panel p-4 text-left transition-all hover:shadow-sm ${
            filter === 'warning' ? 'ring-2 ring-[var(--pc-warning)]' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-[var(--pc-warning)]">
            <CalendarClock size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Vencendo em Breve</span>
          </div>
          <strong className="mt-2 block text-3xl font-black tabular-nums text-[var(--pc-warning)]">
            {counts.warning}
          </strong>
          <p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">dentro dos próximos {alertDays} dias</p>
        </button>

        <button
          type="button"
          onClick={() => setFilter(filter === 'ok' ? 'all' : 'ok')}
          className={`pc-panel p-4 text-left transition-all hover:shadow-sm ${
            filter === 'ok' ? 'ring-2 ring-[var(--pc-success)]' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-[var(--pc-success)]">
            <CheckCircle2 size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Dentro da Validade</span>
          </div>
          <strong className="mt-2 block text-3xl font-black tabular-nums text-[var(--pc-success)]">
            {counts.ok}
          </strong>
          <p className="mt-0.5 text-xs text-[var(--pc-text-muted)]">lotes regulares com prazo seguro</p>
        </button>
      </section>

      {/* Barra de Filtros */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pc-text-muted)]" />
            <input
              type="search"
              placeholder="Buscar por produto ou lote…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>

          {suppliersList.length > 0 && (
            <select
              value={filterSupplier}
              onChange={e => setFilterSupplier(e.target.value)}
              className={`${inputClass} sm:w-56`}
            >
              <option value="">Todos os fornecedores</option>
              {suppliersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {filter !== 'all' && (
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="text-xs font-semibold text-[var(--pc-action)] hover:underline"
          >
            Limpar filtro de status ({({ expired: 'Vencidos', warning: 'Vencendo em breve', ok: 'Dentro da validade' } as Record<string, string>)[filter] || filter})
          </button>
        )}
      </div>

      {/* Tabela de Lotes */}
      <section className="pc-panel overflow-hidden" aria-label="Tabela de Lotes">
        {loading ? (
          <div className="flex h-64 items-center justify-center gap-3 text-sm text-[var(--pc-text-secondary)]">
            <Loader2 size={24} className="animate-spin text-[var(--pc-action)]" />
            <span>Carregando lotes cadastrados…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
            <CalendarClock size={36} className="text-[var(--pc-border-strong)]" />
            <p className="text-sm font-semibold text-[var(--pc-text)]">Nenhum lote encontrado</p>
            <p className="text-xs text-[var(--pc-text-muted)]">
              {lots.length === 0
                ? 'Nenhum lote com validade registrado. Registre entradas com lote e validade na aba "Entrada / Lotes".'
                : 'Nenhum lote corresponde aos filtros selecionados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-[var(--pc-border)] bg-[var(--pc-surface-subtle)] font-semibold text-[var(--pc-text-secondary)]">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Nº Lote</th>
                  <th className="px-4 py-3">Validade</th>
                  <th className="px-4 py-3 text-right">Saldo Restante</th>
                  <th className="px-4 py-3">Fornecedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--pc-border)]">
                {filtered.map(lot => (
                  <tr key={lot.id} className="hover:bg-[var(--pc-surface-subtle)]/70 transition-colors">
                    <td className="px-4 py-3">{getStatusBadge(lot, alertDays)}</td>
                    <td className="px-4 py-3">
                      <strong className="text-sm font-semibold text-[var(--pc-text)]">{lot.productName}</strong>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--pc-text-secondary)]">
                      {lot.lotNumber || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--pc-text)]">
                      {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <strong className="font-bold tabular-nums text-[var(--pc-text)]">
                        {lot.remaining} {lot.productUnit}
                      </strong>
                    </td>
                    <td className="px-4 py-3 text-[var(--pc-text-secondary)]">
                      {lot.supplierName ? (
                        <span className="flex items-center gap-1.5">
                          <Truck size={14} className="text-[var(--pc-text-muted)]" />
                          <span>{lot.supplierName}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
