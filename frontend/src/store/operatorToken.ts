import { create } from 'zustand';

export interface OperatorSessionEnvelope {
  operatorId: string;
  tenantId: string;
  token: string;
  expiresAt: number | null;
}

const STORAGE_KEY = 'pdv_operator_session';
const WAITER_STORAGE_KEY = 'pdv_waiter_session';

function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    // Falha silenciosa ao fazer parse do JWT
  }
  return null;
}

function readSessionEnvelope(): OperatorSessionEnvelope | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(WAITER_STORAGE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as OperatorSessionEnvelope;
    if (!envelope || !envelope.token || (envelope.expiresAt !== null && typeof envelope.expiresAt !== 'number')) return null;
    if (envelope.expiresAt !== null && Date.now() >= envelope.expiresAt) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return envelope;
  } catch {
    return null;
  }
}

function writeSessionEnvelope(envelope: OperatorSessionEnvelope) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(WAITER_STORAGE_KEY);
    if (envelope.expiresAt === null) window.localStorage.setItem(WAITER_STORAGE_KEY, JSON.stringify(envelope));
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Falha silenciosa caso storage falhe
  }
}

function removeSessionEnvelope() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(WAITER_STORAGE_KEY);
  } catch {
    // Falha silenciosa
  }
}

interface OperatorTokenState {
  token: string | null;
  operatorId: string | null;
  tenantId: string | null;
  expiresAt: number | null;
  setToken: (t: string, opId?: string, tId?: string) => void;
  restoreFromSession: (opId: string, tId?: string) => boolean;
  clearToken: () => void;
}

const initialEnvelope = readSessionEnvelope();

export const useOperatorTokenStore = create<OperatorTokenState>()((set, get) => ({
  token: initialEnvelope?.token ?? null,
  operatorId: initialEnvelope?.operatorId ?? null,
  tenantId: initialEnvelope?.tenantId ?? null,
  expiresAt: initialEnvelope?.expiresAt ?? null,

  setToken: (t, opId, tId) => {
    const expFromJwt = parseJwtExp(t);
    const expiresAt = expFromJwt;
    const operatorId = opId || get().operatorId || '';
    const tenantId = tId || get().tenantId || '';

    const envelope: OperatorSessionEnvelope = {
      token: t,
      operatorId,
      tenantId,
      expiresAt,
    };
    writeSessionEnvelope(envelope);

    set({ token: t, operatorId, tenantId, expiresAt });
  },

  restoreFromSession: (opId: string, tId?: string) => {
    const env = readSessionEnvelope();
    if (!env) {
      set({ token: null, operatorId: null, tenantId: null, expiresAt: null });
      return false;
    }

    const tenantMatches = Boolean(tId && env.tenantId && env.tenantId === tId);
    const isNotExpired = env.expiresAt === null || Date.now() < env.expiresAt;

    if (env.operatorId === opId && tenantMatches && isNotExpired) {
      set({
        token: env.token,
        operatorId: env.operatorId,
        tenantId: env.tenantId,
        expiresAt: env.expiresAt,
      });
      return true;
    }

    removeSessionEnvelope();
    set({ token: null, operatorId: null, tenantId: null, expiresAt: null });
    return false;
  },

  clearToken: () => {
    removeSessionEnvelope();
    set({ token: null, operatorId: null, tenantId: null, expiresAt: null });
  },
}));
