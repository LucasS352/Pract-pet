import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { apiGet } from '@/lib/api';
import { useOperatorTokenStore } from '@/store/operatorToken';
import { usePinAuthStore } from '@/store/pinAuth';
import { useAuthStore } from '@/store/auth';
import { useCartStore } from '@/store/cart';
import { getOfflineSale } from '@/lib/db';

interface Operator {
  id: string;
  name: string;
  role: string;
  isManager?: boolean;
}

interface CashRegister {
  id: string;
  status: string;
}

export type RegisterStatus =
  | 'idle'             // Nenhum operador logado
  | 'querying'         // Consulta ao servidor em andamento
  | 'open_confirmed'   // Servidor respondeu 200 confirmando caixa aberto
  | 'closed_confirmed' // Servidor respondeu 200 confirmando que NÃO há caixa aberto
  | 'query_failed';    // Consulta falhou por timeout, rede ou offline

interface ShiftContextType {
  operator: Operator | null;
  cashRegister: CashRegister | null;
  registerStatus: RegisterStatus;
  /** true quando os dados de caixa foram lidos do cache local e não revalidados pelo servidor */
  isUnconfirmedCache: boolean;
  /** token opcional: instala credencial do operador atomicamente com a transição de identidade */
  setOperator: (op: Operator | null, token?: string) => void;
  setCashRegister: (reg: CashRegister | null) => void;
  isLoading: boolean;
  isRegisterQuerying: boolean;
  registerQueryFailed: boolean;
  /** true quando operador foi restaurado do localStorage mas ainda não tem token em memória
   *  (ex: recarga da página). Componentes sensíveis devem solicitar re-autenticação por PIN. */
  needsOperatorReauth: boolean;
  logoutOperator: () => void;
  refreshShift: (operatorId?: string) => Promise<void>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const [operator, setOperatorState] = useState<Operator | null>(null);
  const [cashRegister, setCashRegister] = useState<CashRegister | null>(null);
  const [registerStatus, setRegisterStatus] = useState<RegisterStatus>('idle');
  const [isUnconfirmedCache, setIsUnconfirmedCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const hasOpToken = useOperatorTokenStore((state) => Boolean(state.token));
  const needsOperatorReauth = Boolean(operator && !hasOpToken);

  // Limpa credenciais em memória no logout da loja
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state) => {
      if (!state.token) {
        useCartStore.getState().selectScope('', '');
        useOperatorTokenStore.getState().clearToken();
        usePinAuthStore.getState().clearPinAuth();
      }
    });
    return unsub;
  }, []);

  // ─── Coordenação Centralizada de Requisições de Turno / Caixa ───────────────
  // Evita concorrência, corrida de respostas (race condition), duplicidade de polling
  // e contaminação de estado entre operadores diferentes.
  const querySeqRef = useRef<number>(0);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operatorRef = useRef<Operator | null>(null);
  operatorRef.current = operator;

  // ─── performRegisterQuery: Pipeline Único de Consulta de Caixa ──────────────
  const performRegisterQuery = useCallback(async (targetOpId: string) => {
    if (!targetOpId) return;

    // 1. Cancela timer de polling pendente
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    // 2. Aborta qualquer requisição em voo anterior
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
      inFlightAbortRef.current = null;
    }

    // 3. Incrementa o sequenciador de requisições
    const currentReqId = ++querySeqRef.current;

    // 4. Cenário: Aba Oculta (document.hidden)
    // Não dispara consulta agora nem agenda polling enquanto a aba estiver oculta;
    // O evento 'visibilitychange' disparará assim que a aba voltar ao primeiro plano.
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    // 5. Cenário: Offline declarado no navegador
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (currentReqId === querySeqRef.current && targetOpId === operatorRef.current?.id) {
        try {
          const cached = localStorage.getItem(`pdvpro_cached_register_${targetOpId}`);
          if (cached) {
            setCashRegister(JSON.parse(cached));
            setIsUnconfirmedCache(true);
          } else {
            setCashRegister(null);
            setIsUnconfirmedCache(false);
          }
        } catch {
          setCashRegister(null);
          setIsUnconfirmedCache(false);
        }
        setRegisterStatus('query_failed');
        setIsLoading(false);
        // Reagenda tentativa em 30s
        pollTimerRef.current = setTimeout(() => {
          if (operatorRef.current?.id === targetOpId) {
            void performRegisterQuery(targetOpId);
          }
        }, 30_000);
      }
      return;
    }

    // 6. Prepara novo AbortController
    const abortController = new AbortController();
    inFlightAbortRef.current = abortController;
    setRegisterStatus('querying');

    try {
      // Cache-busting explícito (_t) e cabeçalhos anti-cache garantem
      // que a resposta veio autoritativamente da rede/servidor, nunca de cache intermediário
      const res = await apiGet(`/cash-registers/current?operatorId=${targetOpId}&_t=${Date.now()}`, {
        signal: abortController.signal,
        headers: {
          'X-Silent-Poll': 'true',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      // ⚠️ GUARDA DE CONCORRÊNCIA E TROCA DE OPERADOR:
      // Descarte absoluto se esta requisição foi superada por outra mais nova,
      // ou se o operador ativo não é mais o mesmo desta requisição.
      if (currentReqId !== querySeqRef.current || targetOpId !== operatorRef.current?.id) {
        return;
      }

      const register = res.data || null;
      setCashRegister(register);
      setIsUnconfirmedCache(false);

      if (register) {
        // Servidor confirmou caixa aberto
        setRegisterStatus('open_confirmed');
        localStorage.setItem(`pdvpro_cached_register_${targetOpId}`, JSON.stringify(register));
      } else {
        // Servidor confirmou expressamente que NÃO há caixa aberto
        setRegisterStatus('closed_confirmed');
        localStorage.removeItem(`pdvpro_cached_register_${targetOpId}`);
      }
    } catch (err: unknown) {
      // ⚠️ GUARDA DE ERRO CONTRA CONCORRÊNCIA E TROCA DE OPERADOR:
      // Protege contra requisições canceladas, superadas por novas consultas ou
      // de operadores anteriores (ex: erro de A não afeta B).
      if (currentReqId !== querySeqRef.current || targetOpId !== operatorRef.current?.id) {
        return;
      }

      const isCanceled =
        (err as { code?: string })?.code === 'ERR_CANCELED' ||
        (err as { name?: string })?.name === 'CanceledError' ||
        abortController.signal.aborted;

      if (isCanceled) {
        // Cancelamento intencional por superação de requisição ou troca de tela: ignora silenciosamente
        return;
      }

      // Falha real de rede ou timeout: marca query_failed e tenta carregar cache local não revalidado
      console.warn(`[ShiftContext] Falha na consulta de caixa do operador ${targetOpId}:`, err);
      setRegisterStatus('query_failed');

      try {
        const cached = localStorage.getItem(`pdvpro_cached_register_${targetOpId}`);
        if (cached) {
          setCashRegister(JSON.parse(cached));
          setIsUnconfirmedCache(true); // Cache local não revalidado
        } else {
          setCashRegister(null);
          setIsUnconfirmedCache(false);
        }
      } catch {
        setCashRegister(null);
        setIsUnconfirmedCache(false);
      }
    } finally {
      // Limpa a ref se ainda formos o controller ativo
      if (inFlightAbortRef.current === abortController) {
        inFlightAbortRef.current = null;
      }

      if (currentReqId === querySeqRef.current && targetOpId === operatorRef.current?.id) setIsLoading(false);

      // Reagenda o próximo ciclo estritamente se esta ainda for a consulta ativa e o operador for o mesmo
      if (currentReqId === querySeqRef.current && targetOpId === operatorRef.current?.id) {
        // Apenas agenda polling periódico se a aba não estiver oculta
        if (typeof document === 'undefined' || !document.hidden) {
          pollTimerRef.current = setTimeout(() => {
            if (operatorRef.current?.id === targetOpId) {
              void performRegisterQuery(targetOpId);
            }
          }, 30_000);
        }
      }
    }
  }, []);

  // ─── Transição de Operador: Desassociação Síncrona Imediata ──────────────
  // Invalida e limpa o caixa anterior no momento exato em que o operador muda,
  // antes mesmo de o React processar os efeitos assíncronos.
  const setOperator = useCallback((newOp: Operator | null, newToken?: string) => {
    // 1. Cancela timer e requisições em voo do operador anterior
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
      inFlightAbortRef.current = null;
    }
    // 2. Invalida qualquer resposta tardia do operador anterior
    querySeqRef.current += 1;

    if (!newOp) {
      useCartStore.getState().selectScope('', '');
      useOperatorTokenStore.getState().clearToken();
      usePinAuthStore.getState().clearPinAuth();
      localStorage.removeItem('currentOperator');
      operatorRef.current = null;
      setOperatorState(null);
      setCashRegister(null);
      setIsUnconfirmedCache(false);
      setRegisterStatus('idle');
      setIsLoading(false);
    } else {
      const currentTenantId = useAuthStore.getState().user?.tenant || '';
      useCartStore.getState().selectScope(currentTenantId, newOp.id);
      const restoredOperationId = useCartStore.getState().cartOperationId;
      // A submitted order belongs to the durable recovery queue. Never rebuild it as another sale after F5.
      void getOfflineSale(currentTenantId, restoredOperationId).then(saved => {
        if (!saved || saved.operatorId !== newOp.id || operatorRef.current?.id !== newOp.id) return;
        const cart = useCartStore.getState();
        if (cart.scope === `7bar-cart-v2:${currentTenantId}:${newOp.id}` && cart.cartOperationId === restoredOperationId) {
          cart.setOperationLocked(false);
          cart.clearCart();
        }
      }).catch(() => { /* Preserve draft if local database cannot be inspected. */ });

      if (newToken) {
        useOperatorTokenStore.getState().setToken(newToken, newOp.id, currentTenantId);
      } else {
        // Tentativa de retomada de sessão segura via sessionStorage no F5
        const restored = useOperatorTokenStore.getState().restoreFromSession(newOp.id, currentTenantId);
        if (!restored) {
          useOperatorTokenStore.getState().clearToken();
        }
      }
      usePinAuthStore.getState().clearPinAuth();

      // Serializa o operador SEM o token (operadorToken não pertence a este objeto)
      localStorage.setItem('currentOperator', JSON.stringify(newOp));
      operatorRef.current = newOp;

      setCashRegister(null);
      setIsUnconfirmedCache(false);

      setOperatorState(newOp);
      setRegisterStatus('querying');
      setIsLoading(true);
    }
  }, []);

  // ─── refreshShift: aceita operatorId EXPLÍCITO para evitar closure stale ───
  const refreshShift = useCallback(async (operatorId?: string) => {
    const resolvedId = operatorId
      ?? (() => {
        try {
          const saved = localStorage.getItem('currentOperator');
          return saved ? JSON.parse(saved).id : null;
        } catch { return null; }
      })()
      ?? operatorRef.current?.id;

    if (!resolvedId) return;

    await performRegisterQuery(resolvedId);
  }, [performRegisterQuery]);

  // ─── Inicialização: carrega apenas o operador da sessão ───────────────────
  useEffect(() => {
    const IS_DEMO = import.meta.env.VITE_APP_MODE === 'demo';

    const init = async () => {
      try {
        const token = useAuthStore.getState().token;
        if (!token && !IS_DEMO) {
          setOperator(null);
          return;
        }

        const savedOp = localStorage.getItem('currentOperator');
        let currentOp = savedOp ? JSON.parse(savedOp) : null;

        // ── Demo Mode: auto-selecionar operador se não houver ──
        if (!currentOp && IS_DEMO) {
          try {
            const res = await apiGet('/operators', {
              skipAuthRedirect: true,
              headers: { 'X-Silent-Poll': 'true' },
            } as any);
            const operators = (res.data || []).filter((u: any) => u.active);
            if (operators.length > 0) {
              currentOp = {
                id: operators[0].id,
                name: operators[0].name,
                role: operators[0].jobTitle || 'Caixa',
                isManager: operators[0].isManager || false,
              };
            }
          } catch (e) {
            console.warn('[Demo] Erro ao auto-selecionar operador:', e);
          }
        }

        if (currentOp && token) {
          // Sincroniza dados atualizados do operador do banco
          try {
            const opRes = await apiGet(`/operators/${currentOp.id}`, {
              skipAuthRedirect: true,
              headers: { 'X-Silent-Poll': 'true' },
            } as any);
            if (opRes.data) {
              currentOp = {
                ...currentOp,
                name: opRes.data.name,
                isManager: Boolean(opRes.data.isManager),
                jobTitle: opRes.data.jobTitle,
              };
            }
          } catch { /* se falhar rede, mantém o cache local */ }

          // Aplica a transição inicial do operador
          setOperator(currentOp);
        } else if (currentOp && !token) {
          setOperator(null);
        } else {
          setOperator(null);
        }
      } catch (err) {
        console.error('Erro na inicialização do turno:', err);
        setOperator(null);
      }
    };

    void init();
  }, [setOperator]);

  // ─── Ciclo de Caixa e Polling Vinculado ao Operador Ativo ──────────────────
  useEffect(() => {
    if (!operator?.id) return;

    // Dispara a consulta inicial coordenada para o operador logado
    void performRegisterQuery(operator.id);

    // Revalidação imediata assim que o usuário retornar à aba
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (operatorRef.current?.id) {
          void performRegisterQuery(operatorRef.current.id);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      querySeqRef.current += 1; // Invalida qualquer requisição em voo para que seu finally não reagende timers
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
        inFlightAbortRef.current = null;
      }
    };
  }, [operator?.id, hasOpToken, performRegisterQuery]);

  const logoutOperator = () => {
    setOperator(null);
  };

  return (
    <ShiftContext.Provider
      value={{
        operator,
        cashRegister,
        registerStatus,
        isUnconfirmedCache,
        setOperator,
        setCashRegister,
        isLoading,
        isRegisterQuerying: registerStatus === 'querying',
        registerQueryFailed: registerStatus === 'query_failed',
        needsOperatorReauth,
        logoutOperator,
        refreshShift,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextType {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    return {
      operator: null,
      cashRegister: null,
      registerStatus: 'idle',
      isUnconfirmedCache: false,
      setOperator: () => {},
      setCashRegister: () => {},
      isLoading: false,
      isRegisterQuerying: false,
      registerQueryFailed: false,
      needsOperatorReauth: false,
      logoutOperator: () => {},
      refreshShift: async () => {},
    };
  }
  return context;
}
