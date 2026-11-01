/**
 * ============================================================
 *  useNetworkStatus.ts — Hook de Conectividade em 4 Estados
 *  7bar PDV — Lote 1 de Robustez
 * ============================================================
 *
 *  Estados:
 *    online     — API respondendo normalmente (<3s)
 *    degraded   — rede oscilando / timeouts / respostas lentas (>=3s)
 *    offline    — navigator.onLine === false
 *    recovering — probe voltou a responder; sincronização em andamento
 *
 *  Probe: GET /api/ — endpoint leve existente, sem auth, sem cache.
 *  Debounce: 2 confirmações consecutivas para transição de estado,
 *  evitando alternância frenética do banner.
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

export type NetworkStatus = 'online' | 'degraded' | 'offline' | 'recovering';

export interface NetworkStatusState {
  status: NetworkStatus;
  /** true quando a API está respondendo (online ou recovering) */
  isApiReachable: boolean;
  /** true quando navigator.onLine === false */
  isNavigatorOffline: boolean;
}

const probeAxios = axios.create({ baseURL: '/', timeout: 8_000 });

const PROBE_INTERVAL_NORMAL   = 60_000; // 60s quando online
const PROBE_INTERVAL_DEGRADED = 5_000;  // 5s quando degraded/offline (recuperação ágil)
const DEBOUNCE_THRESHOLD      = 2;      // confirmações consecutivas

export function useNetworkStatus(): NetworkStatusState {
  const [status, setStatus] = useState<NetworkStatus>('online');
  const [isNavigatorOffline, setNavigatorOffline] = useState(!navigator.onLine);

  const statusRef            = useRef<NetworkStatus>('online');
  const consecutiveSuccesses = useRef(0);
  const consecutiveFailures  = useRef(0);
  const destroyed            = useRef(false);
  const probeTimeout         = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const probeAbort           = useRef<AbortController | undefined>(undefined);

  const applyStatus = useCallback((next: NetworkStatus) => {
    statusRef.current = next;
    setStatus(prev => (prev === next ? prev : next));
  }, []);

  const runProbe = useCallback(async () => {
    if (destroyed.current) return;

    // Cancela qualquer timeout agendado anteriormente para evitar execuções paralelas
    if (probeTimeout.current) {
      clearTimeout(probeTimeout.current);
      probeTimeout.current = undefined;
    }

    // Se o SO/navegador já reporta sem conexão
    if (!navigator.onLine) {
      consecutiveSuccesses.current = 0;
      consecutiveFailures.current  = 0;
      applyStatus('offline');
      if (!destroyed.current) {
        probeTimeout.current = setTimeout(runProbe, PROBE_INTERVAL_DEGRADED);
      }
      return;
    }

    // Aborta probe anterior se ainda estiver em andamento
    if (probeAbort.current) {
      probeAbort.current.abort();
    }
    probeAbort.current = new AbortController();
    const start = Date.now();

    try {
      // A barra final evita o redirect automático do Nginx para HTTP/porta interna
      // quando o TLS público termina no proxy externo (produção/homologação).
      await probeAxios.get('/api/', {
        signal: probeAbort.current.signal,
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });

      if (destroyed.current) return;
      const latency = Date.now() - start;

      if (latency < 3_000) {
        consecutiveSuccesses.current++;
        consecutiveFailures.current = 0;
      } else {
        // Resposta lenta (>= 3s) conta como degradação
        consecutiveFailures.current++;
        consecutiveSuccesses.current = 0;
      }

      const current = statusRef.current;
      if (current === 'offline') {
        // Ao voltar de offline com probe válida, recupera imediatamente
        applyStatus('recovering');
        consecutiveSuccesses.current = 0;
      } else if (consecutiveSuccesses.current >= DEBOUNCE_THRESHOLD) {
        if (current === 'degraded') {
          applyStatus('recovering');
        } else {
          applyStatus('online');
        }
        consecutiveSuccesses.current = 0;
      } else if (consecutiveFailures.current >= DEBOUNCE_THRESHOLD) {
        applyStatus('degraded');
        consecutiveFailures.current = 0;
      }

      if (!destroyed.current) {
        const interval = (statusRef.current === 'degraded' || statusRef.current === 'offline')
          ? PROBE_INTERVAL_DEGRADED
          : PROBE_INTERVAL_NORMAL;
        probeTimeout.current = setTimeout(runProbe, interval);
      }
    } catch (err: unknown) {
      if (destroyed.current) return;

      // Se foi cancelamento voluntário (abort), não conta como falha nem reagenda
      const isCanceled = axios.isCancel(err) ||
        (err as { name?: string })?.name === 'CanceledError' ||
        (err as { code?: string })?.code === 'ERR_CANCELED';

      if (isCanceled) return;

      consecutiveSuccesses.current = 0;
      consecutiveFailures.current++;

      if (consecutiveFailures.current >= DEBOUNCE_THRESHOLD) {
        applyStatus('degraded');
        consecutiveFailures.current = 0;
      }

      if (!destroyed.current) {
        probeTimeout.current = setTimeout(runProbe, PROBE_INTERVAL_DEGRADED);
      }
    }
  }, [applyStatus]);

  // Listeners online / offline do navegador
  useEffect(() => {
    const handleOffline = () => {
      setNavigatorOffline(true);
      consecutiveSuccesses.current = 0;
      consecutiveFailures.current  = 0;
      applyStatus('offline');
      if (probeAbort.current) probeAbort.current.abort();
      if (probeTimeout.current) clearTimeout(probeTimeout.current);
      probeTimeout.current = setTimeout(runProbe, PROBE_INTERVAL_DEGRADED);
    };

    const handleOnline = () => {
      setNavigatorOffline(false);
      consecutiveSuccesses.current = 0;
      consecutiveFailures.current = 0;
      // Dispara verificação imediata para confirmar disponibilidade real da API
      if (probeAbort.current) probeAbort.current.abort();
      if (probeTimeout.current) clearTimeout(probeTimeout.current);
      void runProbe();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [applyStatus, runProbe]);

  // Ciclo principal
  useEffect(() => {
    destroyed.current = false;
    void runProbe();

    return () => {
      destroyed.current = true;
      if (probeTimeout.current) clearTimeout(probeTimeout.current);
      if (probeAbort.current) probeAbort.current.abort();
    };
  }, [runProbe]);

  // Transição suave de recovering para online após estabilização (1.8s)
  useEffect(() => {
    if (status !== 'recovering') return;
    const timer = setTimeout(() => {
      if (!destroyed.current && statusRef.current === 'recovering') {
        applyStatus('online');
      }
    }, 1_800);
    return () => clearTimeout(timer);
  }, [status, applyStatus]);

  return {
    status,
    isApiReachable: status === 'online' || status === 'recovering',
    isNavigatorOffline,
  };
}
