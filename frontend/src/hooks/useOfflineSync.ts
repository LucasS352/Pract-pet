/**
 * ============================================================
 *  useOfflineSync.ts — Hook de Sincronização Offline
 *  7bar PDV — PWA Contingência
 * ============================================================
 *
 *  Responsabilidades:
 *  1. Monitorar status de conexão (online / offline)
 *  2. Ao voltar online, detectar vendas PENDING no IndexedDB
 *  3. Enviar cada venda ao backend NestJS (/api/sales/checkout)
 *  4. Marcar como SYNCED ou ERROR conforme resultado
 *  5. Expor estado para o componente ConnectionStatus
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useOperatorTokenStore } from '@/store/operatorToken';
import { withSaleOperationLock } from '@/lib/sale-operation-lock';
import { sendCheckout } from '@/lib/checkout-api';
import {
  getPendingSales,
  markSaleSynced,
  markSaleError,
  countPendingSales,
  getOfflineSale,
  markSaleReview,
  type OfflineSale,
} from '@/lib/db';

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface OfflineSyncState {
  /** true quando navigator.onLine === true */
  isOnline: boolean;
  /** Quantidade de vendas aguardando sincronização */
  pendingCount: number;
  /** true enquanto o processo de sync está rodando */
  isSyncing: boolean;
  /** Dispara o sync manualmente (útil para botão "Sincronizar agora") */
  syncNow: () => Promise<void>;
}

// ── Mapa de método → tPag SEFAZ (espelha o backend) ─────────────────────────
const TPAG_MAP: Record<string, string> = {
  dinheiro: '01',
  credito:  '03',
  debito:   '04',
  pix:      '17',
  outros:   '99',
};

// ── Hook principal ────────────────────────────────────────────────────────────

export function useOfflineSync(): OfflineSyncState {
  const tenantId = useAuthStore(state => state.user?.tenant);
  const operatorId = useOperatorTokenStore(state => state.operatorId);
  const operatorToken = useOperatorTokenStore(state => state.token);
  const [isOnline,     setIsOnline]     = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing,    setIsSyncing]    = useState<boolean>(false);

  // Ref para evitar sincronizações paralelas
  const syncInProgress = useRef<boolean>(false);

  // ── Atualiza contagem de pendentes ───────────────────────────────────────
  const refreshPendingCount = useCallback(async () => {
    const count = await countPendingSales(tenantId);
    setPendingCount(count);
  }, [tenantId]);

  // ── Serializa uma OfflineSale para o formato esperado pelo backend ───────
  const buildCheckoutPayload = (sale: OfflineSale) => {
    if (sale.rawPayload) {
      return {
        ...sale.rawPayload,
        idempotencyKey: sale.idempotencyKey || sale.localId,
        localId: sale.localId,
        offlineContingency: true,
        offlineCreatedAt: sale.createdAt,
      };
    }

    return {
      items: sale.items.map((item) => ({
        productId: item.productId,
        quantity:  item.quantity,
        priceUnit: item.priceUnit,
        modifiers: item.modifiers ? item.modifiers.map(m => ({
          optionId: m.optionId,
          componentProductId: m.componentProductId,
        })) : undefined,
        fiscalSnapshot: {
          productName: item.productName,
          unit:        item.unit,
          discount:    item.discount,
          subtotal:    item.subtotal,
          ncm:         item.ncm,
          cest:        item.cest,
          cfop:        item.cfop,
          origem:      item.origem,
          csosn:       item.csosn,
          cstIcms:     item.cstIcms,
          aliqIcms:    item.aliqIcms,
          cstPis:      item.cstPis,
          aliqPis:     item.aliqPis,
          cstCofins:   item.cstCofins,
          aliqCofins:  item.aliqCofins,
        },
      })),

      payments: sale.payments.map((p) => ({
        method: p.method,
        label:  p.label,
        tPag:   p.tPag ?? TPAG_MAP[p.method] ?? '99',
        value:  p.value,
        troco:  p.troco,
      })),

      discount: sale.discount || 0,
      emitirNfce: false,
      offlineContingency: true,
      offlineCreatedAt:   sale.createdAt,
      localId:            sale.localId,
      idempotencyKey:     sale.idempotencyKey || sale.localId,

      operatorId:     sale.operatorId,
      cashRegisterId: sale.cashRegisterId,
      comandaId:      sale.comandaId,
      consumedByOperatorId: sale.consumedByOperatorId,

      customerCpf:  sale.customerCpf,
      customerName: sale.customerName,
    };
  };

  // ── Processo de sincronização ─────────────────────────────────────────────
  const syncPendingSales = useCallback(async () => {
    if (!tenantId || !operatorId || !operatorToken) return;
    // Guarda contra execuções paralelas
    if (syncInProgress.current) return;
    
    if (!navigator.onLine) {
      await refreshPendingCount();
      return;
    }

    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const pending = await getPendingSales(tenantId, operatorId);

      if (pending.length === 0) {
        return;
      }

      toast.info(`Sincronizando ${pending.length} venda(s) offline...`, {
        id: '7bar-sync',
        duration: 5000,
      });

      let successCount = 0;
      let errorCount   = 0;

      // Processa uma venda por vez para evitar sobrecarga
      for (const sale of pending) {
        try {
          await withSaleOperationLock(tenantId, sale.localId, async () => {
            if (useAuthStore.getState().user?.tenant !== tenantId || useOperatorTokenStore.getState().operatorId !== operatorId) return;
            const current = await getOfflineSale(tenantId, sale.localId);
            if (!current || !['PENDING', 'ERROR', 'SYNCING'].includes(current.syncStatus)) return;
            if (!current.rawPayload) {
              await markSaleReview(sale.localId, tenantId, 'Pedido legado sem snapshot verificável. Conferir antes de reenviar.');
              errorCount++;
              return;
            }
            try {
              const response = await sendCheckout(buildCheckoutPayload(current), tenantId, operatorId);
              await markSaleSynced(sale.localId, response.data.id, tenantId);
              successCount++;
            } catch (err: any) {
              if (err?.code === 'ERR_CANCELED') return;
              const message = String(err?.response?.data?.message || err?.message || 'Resultado desconhecido');
              if (err?.response?.status >= 400 && err.response.status < 500 && ![401, 429].includes(err.response.status)) {
                await markSaleReview(sale.localId, tenantId, message);
              } else await markSaleError(sale.localId, message, tenantId);
              errorCount++;
            }
          });
        } catch (err: unknown) {
          const message = err instanceof Error
            ? err.message
            : (err as { response?: { data?: { message?: string } } })
                ?.response?.data?.message
              ?? 'Erro desconhecido';

          // Lock/storage failure must not overwrite a result another tab just confirmed.
          console.warn(message);
          errorCount++;
        }
      }

      // Feedback consolidado
      if (successCount > 0 && errorCount === 0) {
        toast.success(`${successCount} venda(s) sincronizada(s) com sucesso!`, {
          id: '7bar-sync',
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(
          `${successCount} sincronizada(s), ${errorCount} com erro. Verifique o histórico.`,
          { id: '7bar-sync' }
        );
      } else if (errorCount > 0) {
        toast.error(
          `Falha ao sincronizar ${errorCount} venda(s). Tente novamente.`,
          { id: '7bar-sync' }
        );
      }
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount, tenantId, operatorId, operatorToken]);

  // ── Listeners de conexão ─────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const recover = async () => {
      try { if (navigator.onLine) await syncPendingSales(); }
      finally { if (!destroyed) retryTimer = setTimeout(recover, 30_000); }
    };
    const handleOnline = async () => {
      setIsOnline(true);
      toast.success('Conexão restaurada!', { duration: 3000 });
      // Dispara sync automaticamente ao reconectar
      await syncPendingSales();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Você está offline. Vendas serão salvas localmente.', {
        duration: 5000,
        id: '7bar-offline',
      });
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verifica pendentes ao montar (caso app abra com vendas acumuladas)
    refreshPendingCount();

    // Se iniciar online, verifica se há pendentes do dia anterior
    void recover();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingSales, refreshPendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncNow: syncPendingSales,
  };
}
