/** Cross-tab lock, automatically released on F5/crash. Never guess that an active sender died. */
export async function withSaleOperationLock<T>(tenantId: string, localId: string, work: () => Promise<T>): Promise<T> {
  if (!tenantId || tenantId === 'unknown') throw new Error('Loja não identificada. Selecione a loja antes de vender.');
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return work();
  }
  let workStarted = false;
  try {
    return await navigator.locks.request(`7bar-sale:${tenantId}:${localId}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('Esta operação já está sendo enviada em outra aba. Aguarde a confirmação.');
      workStarted = true;
      return await work();
    });
  } catch (err: any) {
    if (workStarted || err?.message?.includes('outra aba')) throw err;
    console.warn('[SaleLock] Fallback para execução direta:', err);
    return work();
  }
}

