import { create } from 'zustand';

/** Store memory-only para a autorização adicional por PIN do caixa.
 *  Gerado após /tenants/me/verify-cashier-pin validar o PIN (compartilhado ou pessoal de gerente).
 *  Escopo: inclui o registerId do caixa para o qual foi emitido — validado pelo backend.
 *  NUNCA persiste em localStorage — intencional para segurança.
 *  Limpo em: troca de operador, logout, expiração (401 pin_auth). */
interface PinAuthState {
  token: string | null;
  setPinAuth: (t: string) => void;
  clearPinAuth: () => void;
}

export const usePinAuthStore = create<PinAuthState>()((set) => ({
  token: null,
  setPinAuth: (t) => set({ token: t }),
  clearPinAuth: () => set({ token: null }),
}));
