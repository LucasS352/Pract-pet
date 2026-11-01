import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export function OperationalRoute({ module, children }: { module: 'waiter' | 'kds'; children: ReactNode }) {
  const { token, user } = useAuthStore();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const station = user?.station;
    const stationMatchesModule = station !== undefined && (station === 'WAITER') === (module === 'waiter');

    // Uma estação já autenticada carrega sua própria autorização no JWT. A
    // consulta abaixo continua importante para refletir uma desativação real
    // do módulo, mas uma falha transitória ao voltar do bloqueio não pode
    // derrubar a tela para "módulo indisponível".
    setAllowed(token ? (stationMatchesModule ? true : null) : null);

    const check = async () => {
      if (!token) return;
      try {
        // A configuração controla a própria rota. Um identificador por consulta
        // evita que o navegador devolva um 304 sem corpo de uma verificação
        // anterior e o Axios a interprete como erro de acesso.
        const { data } = await api.get('/auth/access/config', {
          timeout: 10_000,
          params: { _ts: Date.now() },
        });
        if (active) setAllowed(module === 'waiter' ? data.waiter === true : data.stations.some((s: string) => s !== 'WAITER'));
      } catch (error: any) {
        if (!active) return;
        // Apenas uma negação explícita é tratada como módulo desativado. Rede,
        // timeout, retorno do PWA e 5xx preservam a última autorização válida.
        if (error?.response?.status === 403) setAllowed(false);
      }
    };

    const retryWhenAppReturns = () => {
      if (document.visibilityState === 'visible') void check();
    };

    if (token) void check();
    const timer = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', retryWhenAppReturns);
    window.addEventListener('pageshow', retryWhenAppReturns);
    window.addEventListener('online', retryWhenAppReturns);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', retryWhenAppReturns);
      window.removeEventListener('pageshow', retryWhenAppReturns);
      window.removeEventListener('online', retryWhenAppReturns);
    };
  }, [token, user?.station, module]);

  if (!token) return <Navigate to="/login" replace />;
  if (user?.station && (user.station === 'WAITER') !== (module === 'waiter')) return <Navigate to={user.station === 'WAITER' ? '/garcom' : '/kds'} replace />;
  if (allowed === null) return <p className="p-6">Reconectando ao servidor…</p>;
  if (!allowed) return <p role="alert" className="p-6">Módulo indisponível para esta loja. Consulte o administrador.</p>;
  return <>{children}</>;
}
