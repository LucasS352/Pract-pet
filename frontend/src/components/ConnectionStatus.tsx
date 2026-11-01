/**
 * ConnectionStatus.tsx — Badge de Status de Conexão
 * Mostra ao operador o estado atual: Online / Offline / Sincronizando / Pendente
 */

import { Wifi, WifiOff, RefreshCw, CloudOff } from 'lucide-react';
import type { OfflineSyncState } from '@/hooks/useOfflineSync';

interface ConnectionStatusProps {
  syncState: OfflineSyncState;
}

export function ConnectionStatus({ syncState }: ConnectionStatusProps) {
  const { isOnline, pendingCount, isSyncing, syncNow } = syncState;

  // ── Sincronizando ────────────────────────────────────────────────────────
  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-semibold animate-pulse">
        <RefreshCw size={14} className="animate-spin" />
        <span>Sincronizando...</span>
      </div>
    );
  }

  // ── Offline ──────────────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 text-sm font-bold shadow-[0_0_12px_rgba(239,68,68,0.15)]">
        <WifiOff size={14} className="animate-pulse" />
        <span>OFFLINE</span>
        {pendingCount > 0 && (
          <span className="ml-1 bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  // ── Online com pendentes ─────────────────────────────────────────────────
  if (pendingCount > 0) {
    return (
      <button
        onClick={syncNow}
        title="Clique para sincronizar agora"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-semibold hover:bg-orange-500/20 transition-colors"
      >
        <CloudOff size={14} />
        <span>{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</span>
        <RefreshCw size={12} className="opacity-70" />
      </button>
    );
  }

  // ── Online e sincronizado ─────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-emerald-500/70 text-xs font-medium">
      <Wifi size={13} />
      <span>Online</span>
    </div>
  );
}
