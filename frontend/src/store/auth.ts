import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useOperatorTokenStore } from './operatorToken';
import { clearProductsCache } from '@/lib/db';

export type User = { id: string, name: string, role: string, tenant: string, groupId?: string | null, termsAccepted?: boolean, station?: string, modules?: Record<string, boolean> };

function clearTenantClientCaches() {
  void clearProductsCache().catch(() => {});
  if (typeof caches !== 'undefined') {
    void caches.delete('pdvpro-api-critical').catch(() => {});
  }
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  setTermsAccepted: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) =>
        set((state) => {
          const prevTenant = state.user?.tenant;
          if (prevTenant && prevTenant !== user.tenant) {
            clearTenantClientCaches();
          }
          return { token, user };
        }),
      logout: () => {
        useOperatorTokenStore.getState().clearToken();
        localStorage.removeItem('garcom_operator');
        localStorage.removeItem('currentOperator');
        clearTenantClientCaches();
        set({ token: null, user: null });
      },
      setTermsAccepted: () => set((state) => ({ user: state.user ? { ...state.user, termsAccepted: true } : null })),
    }),
    { name: '7bar-auth' }
  )
);
