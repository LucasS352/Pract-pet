import { api } from './api';
import { db } from './db';
import { useAuthStore } from '@/store/auth';

const flights = new Map<string, Promise<any>>();

function assertScope(tenantId: string) {
  if (!tenantId || useAuthStore.getState().user?.tenant !== tenantId)
    throw new Error('A loja mudou. Reabra as comandas.');
}

/** Retorna true se o erro é de rede/timeout/cancelamento (sem resposta do servidor). */
function isNetworkError(err: any): boolean {
  if (!err.response) return true; // sem resposta = falha de rede, timeout ou cancelamento
  return false;
}

async function excludeCharged(tenantId: string, items: any[]) {
  const sales = await db.offline_sales.where('tenantId').equals(tenantId).toArray();
  const charged = new Set(sales.map(s => s.comandaId).filter(Boolean));
  return items.filter(item => !charged.has(item.id));
}

export async function readComandas(tenantId: string): Promise<{ items: any[]; savedAt: number; offline: boolean }> {
  assertScope(tenantId);
  if (flights.has(tenantId)) return flights.get(tenantId)!;
  const request = (async () => {
    // Offline detectado imediatamente — vai direto ao cache sem esperar timeout
    if (!navigator.onLine) {
      const cached = await db.comandas_cache.get(tenantId);
      if (!cached) throw new Error('Nenhuma cópia das comandas disponível neste aparelho. Conecte o caixa antes do atendimento.');
      return { items: await excludeCharged(tenantId, cached.items), savedAt: cached.savedAt, offline: true };
    }
    try {
      const res = await api.get('/v1/comandas?status=open', { timeout: 6000, expectedTenantId: tenantId } as any);
      assertScope(tenantId);
      const savedAt = Date.now();
      await db.comandas_cache.put({ tenantId, savedAt, items: res.data });
      return { items: await excludeCharged(tenantId, res.data), savedAt, offline: false };
    } catch (err: any) {
      // Erros 4xx (autenticação, permissão) são relançados — não vão ao cache
      if (err.response && err.response.status < 500) throw err;
      // Erros de rede, timeout ou 5xx → tenta cache local
      if (!isNetworkError(err)) throw err;
      const cached = await db.comandas_cache.get(tenantId);
      if (!cached) throw new Error('Nenhuma cópia das comandas disponível neste aparelho. Conecte o caixa antes do atendimento.');
      return { items: await excludeCharged(tenantId, cached.items), savedAt: cached.savedAt, offline: true };
    }
  })();
  flights.set(tenantId, request);
  try { return await request; } finally { flights.delete(tenantId); }
}

export async function readComanda(tenantId: string, id: string) {
  assertScope(tenantId);
  const charged = await db.offline_sales.where('tenantId').equals(tenantId).filter(s => s.comandaId === id).first();
  if (charged) throw new Error('Comanda já possui cobrança neste aparelho. Confira as pendências.');
  // Offline detectado imediatamente — vai direto ao cache sem esperar timeout
  if (!navigator.onLine) {
    const cached = await db.comandas_cache.get(tenantId);
    const data = cached?.items.find(c => c.id === id);
    if (!data) throw new Error('Esta comanda não está disponível na cópia local.');
    return { data, offline: true, savedAt: cached!.savedAt };
  }
  try {
    const res = await api.get(`/v1/comandas/${id}`, { timeout: 6000, expectedTenantId: tenantId } as any);
    assertScope(tenantId);
    return { data: res.data, offline: false, savedAt: Date.now() };
  } catch (err: any) {
    if (err.response && err.response.status < 500) throw err;
    if (!isNetworkError(err)) throw err;
    const cached = await db.comandas_cache.get(tenantId);
    const data = cached?.items.find(c => c.id === id);
    if (!data) throw new Error('Esta comanda não está disponível na cópia local.');
    return { data, offline: true, savedAt: cached!.savedAt };
  }
}
