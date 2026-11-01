import { useEffect } from 'react';
import { readComandas } from '@/lib/comandas-offline';

/** Mantém cópia no caixa mesmo quando o painel de comandas está fechado. */
export function useComandasBackup(tenantId?: string, enabled = false) {
  useEffect(() => {
    if (!tenantId || !enabled) return;
    const refresh = () => { if (navigator.onLine) void readComandas(tenantId).catch(() => {}); };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('online', refresh);
    return () => { clearInterval(timer); window.removeEventListener('online', refresh); };
  }, [tenantId, enabled]);
}
