import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useOperatorTokenStore } from '@/store/operatorToken';
import { usePinAuthStore } from '@/store/pinAuth';

export function StationAccessPage() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = location.hash.slice(1);
    history.replaceState(null, '', '/acesso');
    if (!token) { setError('Abra o link completo enviado pelo administrador.'); return; }
    api.post('/auth/station-login', { token }).then(({ data }) => {
      useAuthStore.getState().logout();
      useOperatorTokenStore.getState().clearToken();
      usePinAuthStore.getState().clearPinAuth();
      localStorage.removeItem('garcom_operator');
      useAuthStore.getState().login(data.access_token, data.user);
      navigate(data.user.station === 'WAITER' ? '/garcom' : '/kds', { replace: true });
    }).catch(err => setError(err.response?.data?.message || 'Não foi possível abrir este acesso. Solicite um novo link ao administrador.'));
  }, [navigate]);
  return <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6"><p role={error ? 'alert' : 'status'}>{error || 'Abrindo acesso do setor…'}</p></main>;
}
