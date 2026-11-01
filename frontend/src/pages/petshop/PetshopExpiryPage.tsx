import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  CalendarClock, AlertTriangle, CheckCircle2,
  Package, Search, Download, RefreshCw, Loader2, Truck
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
            Limpar filtro de status ({filter})
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
  );
}
