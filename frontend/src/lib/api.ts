import axios from 'axios';
import { useAuthStore } from '../store/auth';
import { useOperatorTokenStore } from '../store/operatorToken';
import { usePinAuthStore } from '../store/pinAuth';
import { recordTelemetry, anonymizePath } from './telemetry';

export const api = axios.create({
  // Usa caminho relativo '/api'. O proxy do Vite (dev) ou Nginx (prod) repassa para o backend.
  // Sem timeout global — writes (checkout, sync) não devem ser interrompidos por timeout de leitura.
  // Use apiGet() para GETs com timeout de 10s.
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const expected = config as any;
  const currentOpId = useOperatorTokenStore.getState().operatorId;
  if ((expected.expectedTenantId && expected.expectedTenantId !== useAuthStore.getState().user?.tenant) ||
      (expected.expectedOperatorId && currentOpId && expected.expectedOperatorId !== currentOpId)) {
    return Promise.reject(new axios.CanceledError('Loja ou operador mudou antes do envio. Pedido preservado.'));
  }
  (config as any).__startTime = Date.now();
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const opToken = useOperatorTokenStore.getState().token;
  if (opToken) {
    config.headers['X-Operator-Token'] = opToken;
  }
  const pinToken = usePinAuthStore.getState().token;
  if (pinToken) {
    config.headers['X-Pin-Auth-Token'] = pinToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isSilentPoll = Boolean(error.config?.headers?.['X-Silent-Poll']);
    const startTime = (error.config as any)?.__startTime;
    const durationMs = startTime ? Date.now() - startTime : undefined;

    // Preserva as exceções existentes de autenticação (sem alterar regras antigas)
    const isAuthEndpoint =
      url.includes('/auth/operator-login') ||
      url.includes('/auth/login') ||
      url.includes('/auth/station-login') ||
      Boolean(error.config?.skipAuthRedirect);

    // Timeout ou cancelamento (AbortController) → NÃO é logout, é falha de rede
    const isNetworkOrTimeout = ['ECONNABORTED', 'ERR_CANCELED', 'ERR_NETWORK'].includes(
      error.code ?? ''
    );

    // ── Telemetria Desacoplada (Fire-and-forget: nunca bloqueia o fluxo) ──
    const path = anonymizePath(url);

    if (isNetworkOrTimeout) {
      const isTimeout = error.code === 'ECONNABORTED' || Boolean(error.message?.includes('timeout'));
      const isCanceled = error.code === 'ERR_CANCELED' || axios.isCancel(error);

      // Cancelamento intencional de polling silencioso não é falha de rede
      if (!isCanceled || !isSilentPoll) {
        recordTelemetry({
          type: isTimeout ? 'request_timeout' : 'request_network_error',
          path,
          errorCode: error.code,
          durationMs,
        });
      }
      return Promise.reject(error);
    }


    if (error.response?.status >= 500) {
      recordTelemetry({
        type: 'received_5xx',
        path,
        statusCode: error.response.status,
        durationMs,
      });
    }

    // ── Proteção 401 ───────────────────────────────────────────────────────
    if (error.response?.status === 401) {
      const errorSource = error.response?.data?.errorSource;

      // 401 de token de operador expirado/inválido: limpa credencial e notifica UI, SEM deslogar a loja
      if (errorSource === 'operator_token') {
        useOperatorTokenStore.getState().clearToken();
        recordTelemetry({
          type: 'received_401',
          path,
          statusCode: 401,
          durationMs,
        });
        window.dispatchEvent(new CustomEvent('operator-token-expired'));
        return Promise.reject(error);
      }

      // 401 de autorização por PIN expirada/inválida: limpa PIN auth e notifica UI, SEM deslogar a loja
      if (errorSource === 'pin_auth') {
        usePinAuthStore.getState().clearPinAuth();
        recordTelemetry({
          type: 'received_401',
          path,
          statusCode: 401,
          durationMs,
        });
        window.dispatchEvent(new CustomEvent('pin-auth-expired'));
        return Promise.reject(error);
      }

      if (isSilentPoll) {
        // Polling silencioso recebendo 401 → registra mas NÃO derruba sessão
        recordTelemetry({
          type: 'polling_error',
          path,
          statusCode: 401,
          durationMs,
          // "received_401" — não "token_expired" sem prova
          sessionEndReason: 'received_401_polling',
        });
        return Promise.reject(error);
      }

      if (!isAuthEndpoint) {
        // 401 real em endpoint interativo → registra e desloga
        // (Lote 3 adicionará tentativa de refresh aqui antes do logout)
        recordTelemetry({
          type: 'received_401',
          path,
          statusCode: 401,
          durationMs,
          sessionEndReason: 'received_401_interactive',
        });
        recordTelemetry({ type: 'session_ended', sessionEndReason: 'received_401_interactive' });
        useAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Helper para GETs com timeout de 10s e AbortController.
 * Use este para todas as leituras/polling — nunca para writes (POST/PUT/DELETE).
 *
 * @example
 * const res = await apiGet('/products', { signal: controller.signal });
 */
export function apiGet<T = any>(
  url: string,
  config?: Parameters<typeof api.get>[1]
): ReturnType<typeof api.get<T>> {
  return api.get<T>(url, { timeout: 10_000, ...config });
}


