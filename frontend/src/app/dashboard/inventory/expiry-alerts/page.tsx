"use client";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarClock, ArrowLeft, AlertTriangle, CheckCircle2,
  Loader2, Package, Truck, Search, Download, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

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

type FilterStatus = "all" | "expired" | "warning" | "ok";

function getStatusInfo(lot: ExpiringLot, alertDays: number) {
  const days = lot.daysUntilExpiry;
  if (days === null) return { label: "Sem validade", color: "zinc", isExpired: false, isWarning: false };
  if (lot.isExpired || days < 0) return { label: `Vencido ha ${Math.abs(days)} dias`, color: "red", isExpired: true, isWarning: false };
  if (days === 0) return { label: "Vence HOJE", color: "red", isExpired: false, isWarning: true };
  if (days <= alertDays) return { label: `Vence em ${days} dias`, color: "amber", isExpired: false, isWarning: true };
  return { label: `Vence em ${days} dias`, color: "emerald", isExpired: false, isWarning: false };
}

export default function ExpiryAlertsPage() {
  const location = useLocation();
  const backPath = location.pathname.startsWith('/petshop') ? '/petshop/produtos' : '/dashboard/inventory';
  const backLabel = location.pathname.startsWith('/petshop') ? 'Voltar para Produtos Pet' : 'Voltar ao Catálogo';
  const [lots, setLots] = useState<ExpiringLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertDays, setAlertDays] = useState(30);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchText, setSearchText] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");

  const loadLots = async () => {
    setLoading(true);
    try {
      const [settingsRes, lotsRes] = await Promise.all([
        api.get("/products/settings"),
        api.get("/products/lots/expiring?days=365"),
      ]);
      setAlertDays(settingsRes.data?.expiryAlertDays ?? 30);
      setLots(lotsRes.data || []);
    } catch {
      toast.error("Erro ao carregar painel de validades.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLots(); }, []);

  const suppliers = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    for (const lot of lots) {
      if (lot.supplierId && lot.supplierName && !seen.has(lot.supplierId)) {
        seen.add(lot.supplierId);
        list.push({ id: lot.supplierId, name: lot.supplierName });
      }
    }
    return list;
  }, [lots]);

  const counts = useMemo(() => ({
    expired: lots.filter(l => l.isExpired || (l.daysUntilExpiry !== null && l.daysUntilExpiry < 0)).length,
    warning: lots.filter(l => !l.isExpired && l.daysUntilExpiry !== null && l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= alertDays).length,
    ok: lots.filter(l => !l.isExpired && l.daysUntilExpiry !== null && l.daysUntilExpiry > alertDays).length,
  }), [lots, alertDays]);

  const filtered = useMemo(() => {
    return lots.filter(lot => {
      const status = getStatusInfo(lot, alertDays);
      if (filter === "expired" && !status.isExpired) return false;
      if (filter === "warning" && (!status.isWarning || status.isExpired)) return false;
      if (filter === "ok" && (status.isExpired || status.isWarning)) return false;
      if (filterSupplier && lot.supplierId !== filterSupplier) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!lot.productName.toLowerCase().includes(q) && !(lot.lotNumber || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lots, filter, filterSupplier, searchText, alertDays]);

  const exportCSV = () => {
    const header = ["Produto", "Lote", "Fornecedor", "Qtd Restante", "Custo Unit.", "Validade", "Status", "Dias"];
    const rows = filtered.map(lot => {
      const status = getStatusInfo(lot, alertDays);
      return [
        lot.productName,
        lot.lotNumber || lot.id.split("-")[0].toUpperCase(),
        lot.supplierName || "-",
        `${lot.remaining} ${lot.productUnit}`,
        `R$ ${lot.costPrice.toFixed(2)}`,
        lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString("pt-BR") : "-",
        status.label,
        lot.daysUntilExpiry ?? "-",
      ];
    });
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `validades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("Relatorio exportado!");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <Link to={backPath} className="text-zinc-500 hover:text-blue-400 flex items-center gap-2 text-sm font-semibold mb-2 transition-colors">
            <ArrowLeft size={16} /> {backLabel}
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <CalendarClock className="text-blue-400" size={32} />
            Painel de Validades
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Lotes com data de validade registrada — alerta configurado para{" "}
            <strong className="text-blue-300">{alertDays} dias</strong> antes do vencimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadLots} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-semibold text-sm transition-all disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
          <button onClick={exportCSV} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-semibold text-sm transition-all">
            <Download size={15} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Vencidos</span>
          </div>
          <p className="text-3xl font-black text-red-400">{counts.expired}</p>
          <p className="text-xs text-red-400/70">lotes com estoque restante</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-amber-400">
            <CalendarClock size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Vencendo em breve</span>
          </div>
          <p className="text-3xl font-black text-amber-400">{counts.warning}</p>
          <p className="text-xs text-amber-400/70">dentro dos {alertDays} dias configurados</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Em dia</span>
          </div>
          <p className="text-3xl font-black text-emerald-400">{counts.ok}</p>
          <p className="text-xs text-emerald-400/70">lotes com validade tranquila</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Produto ou no do lote..." value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all",     label: "Todos",          cls: "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500" },
            { key: "expired", label: "Vencidos",       cls: "bg-red-500/10 border-red-500/30 text-red-400 hover:border-red-400" },
            { key: "warning", label: "Vencendo",       cls: "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-400" },
            { key: "ok",      label: "Em dia",         cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-400" },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${f.cls} ${filter === f.key ? "ring-2 ring-white/20" : ""}`}>
              {f.label}
            </button>
          ))}
        </div>
        {suppliers.length > 0 && (
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
            <option value="">Todos os fornecedores</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-blue-400" size={40} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
          <Package size={48} className="mb-4 opacity-30" />
          <p className="text-lg">Nenhum lote encontrado.</p>
          <p className="text-sm mt-1 opacity-70">
            {lots.length === 0 ? "Nenhum lote com data de validade cadastrada. Registre validades na Entrada de Estoque." : "Tente remover os filtros."}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/40">
            <span className="text-sm font-bold text-zinc-400">{filtered.length} lote(s) encontrado(s)</span>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {filtered.map(lot => {
              const status = getStatusInfo(lot, alertDays);
              const colorMap = {
                red: "bg-red-500/10 border-red-500/30 text-red-400",
                amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
                emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
                zinc: "bg-zinc-800/50 border-zinc-700 text-zinc-400",
              } as const;
              const badgeClass = colorMap[status.color as keyof typeof colorMap] || colorMap.zinc;
              return (
                <div key={lot.id} className="px-5 py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center hover:bg-zinc-800/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold truncate">{lot.productName}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1">
                      <span className="font-mono text-xs text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                        {lot.lotNumber || lot.id.split("-")[0].toUpperCase()}
                      </span>
                      {lot.supplierName && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Truck size={10} /> {lot.supplierName}
                        </span>
                      )}
                      <span className="text-xs text-zinc-600">Entrada: {new Date(lot.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-500">Restante</div>
                    <div className="font-bold text-emerald-400">{lot.remaining.toFixed(0)} <span className="text-xs text-zinc-500">{lot.productUnit}</span></div>
                    <div className="text-xs text-zinc-600">de {lot.quantity.toFixed(0)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-500">Custo unit.</div>
                    <div className="font-bold text-rose-400 text-sm">R$ {lot.costPrice.toFixed(2)}</div>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border shrink-0 ${badgeClass}`}>
                    {status.isExpired ? <AlertTriangle size={13} /> : <CalendarClock size={13} />}
                    <div>
                      <div className="text-xs font-bold">{status.label}</div>
                      <div className="text-[10px] opacity-70">
                        {lot.expiresAt ? new Date(lot.expiresAt).toLocaleDateString("pt-BR") : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
