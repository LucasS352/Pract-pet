/**
 * ============================================================
 *  NetworkStatusBanner.tsx — Banner de Estado de Conectividade
 *  7bar PDV — Lote 1 de Robustez
 * ============================================================
 *
 *  Exibe um banner contextual no topo da tela quando a conexão
 *  está degradada, offline, em recuperação ou com vendas pendentes.
 *
 *  REGRAS:
 *  - Não inicia sincronizador paralelo — observa pendingCount do Dexie
 *  - O banner SÓ desaparece quando status === 'online' E pendingCount === 0
 *  - Estado "degraded" é aviso, NÃO ativa contingência de checkout
 *  - Informação fiel: "X vendas pendentes de envio" quando online/recovering,
 *    não anunciando falsa sincronização automática sem evidência.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { countPendingSales, getReviewSales, type OfflineSale } from '@/lib/db';
import { useAuthStore } from '@/store/auth';
import { useOperatorTokenStore } from '@/store/operatorToken';

export function NetworkStatusBanner() {
  const tenantId = useAuthStore(state => state.user?.tenant);
  const operatorId = useOperatorTokenStore(state => state.operatorId);
  const [reviews, setReviews] = useState<OfflineSale[]>([]);
  const { status } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);

  // Observa pendentes periodicamente para exibir contagem real sem disparar sync
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const count = await countPendingSales(tenantId);
        const review = await getReviewSales(tenantId, operatorId || undefined);
        if (!cancelled) { setPendingCount(count); setReviews(review); }
      } catch { /* silencioso */ }
    };

    void refresh();

    // Atualiza a cada 5s para refletir vendas salvas offline ou enviadas
    const timer = setInterval(() => {
      void refresh();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tenantId, operatorId]);

  // Só oculta quando estiver 100% online E sem nenhuma pendência local no banco
  if (status === 'online' && pendingCount === 0) {
    return null;
  }

  let bg = '';
  let text = '';
  let message = '';

  if (status === 'offline') {
    bg = 'bg-red-600';
    text = 'text-white';
    message = pendingCount > 0
      ? `📡 Sem conexão — ${pendingCount} venda${pendingCount > 1 ? 's' : ''} salva${pendingCount > 1 ? 's' : ''} localmente`
      : '📡 Sem conexão — modo offline ativo';
  } else if (status === 'degraded') {
    bg = 'bg-yellow-500';
    text = 'text-black';
    message = '⚠️ Conexão instável — operações podem ser mais lentas';
  } else if (status === 'recovering') {
    bg = 'bg-emerald-600';
    text = 'text-white';
    message = pendingCount > 0
      ? `🔄 Conexão restabelecida — ${pendingCount} venda${pendingCount > 1 ? 's' : ''} aguardando envio`
      : '✅ Conexão restaurada';
  } else if (pendingCount > 0) {
    // Online, mas existem vendas offline ainda não sincronizadas
    bg = 'bg-sky-600';
    text = 'text-white';
    message = `📡 ${pendingCount} venda${pendingCount > 1 ? 's' : ''} pendente${pendingCount > 1 ? 's' : ''} de envio`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full py-1.5 px-4 text-center text-sm font-medium ${bg} ${text} z-50 relative transition-colors`}
    >
      {message}
      {reviews.length > 0 && (
        <details className="mx-auto max-w-3xl text-left p-2">
          <summary className="cursor-pointer font-semibold">{reviews.length} operação(ões) precisam de conferência — não refaça a venda</summary>
          <ul className="mt-2 space-y-1">
            {reviews.map(row => <li key={row.id || row.localId} className="text-xs break-words">
              Operação {row.localId}: {row.syncError || 'Confira o pedido e a venda original com o responsável.'}
            </li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
