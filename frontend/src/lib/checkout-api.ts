import { api } from './api';

/**
 * Envia o checkout da venda diretamente ao backend sem roundtrips síncronos extras.
 * Timeout ajustado para 35 segundos para suportar oscilações de Wi-Fi/4G sem abort falso.
 */
export async function sendCheckout(body: any, tenantId: string, operatorId: string) {
  const expected = { expectedTenantId: tenantId, expectedOperatorId: operatorId };
  return api.post('/sales/checkout', body, { ...expected, timeout: 35_000 } as any);
}
