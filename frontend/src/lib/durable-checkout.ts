import { saveOfflineSale, markSaleSynced, markSaleError, markSaleReview, type OfflineSale } from './db';
import { withSaleOperationLock } from './sale-operation-lock';

export async function submitDurableCheckout(
  sale: Omit<OfflineSale, 'id'>,
  send: () => Promise<{ data: any }>,
): Promise<{ kind: 'confirmed' | 'pending' | 'review'; data?: any; message?: string }> {
  return withSaleOperationLock(sale.tenantId, sale.localId, async () => {
    // This is deliberately OUTSIDE the network catch. Failure means NO POST and NO success notification.
    await saveOfflineSale(sale);
    let response: { data: any };
    try {
      response = await send();
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message || error?.message || 'Falha no envio';
      const unknown = ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT', 'CHECKOUT_PROTOCOL_UNAVAILABLE'].includes(error?.code) || status >= 500 || status === 401 || status === 429;
      if (!unknown) {
        await markSaleReview(sale.localId, sale.tenantId, String(message));
        return { kind: 'review', message: String(message) };
      }
      await markSaleError(sale.localId, 'Resultado desconhecido. Recuperar esta mesma operação.', sale.tenantId);
      return { kind: 'pending' };
    }
    // Server committed: an IndexedDB acknowledgement error must not turn this into a second sale.
    try { await markSaleSynced(sale.localId, response.data.id, sale.tenantId); }
    catch { /* SYNCING remains durable and recovery asks for the same server identity. */ }
    return { kind: 'confirmed', data: response.data };
  });
}
