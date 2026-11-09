import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react';
import './login.css';
import { loginDestination } from '@/lib/experience-routing';

const encodePass = (pass: string) => {
  try { return btoa(encodeURIComponent(pass)); } catch { return pass; }
};
const decodePass = (encoded: string) => {
  try { return decodeURIComponent(atob(encoded)); } catch { return encoded; }
};

export function LoginPage() {
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuthStore();
  const navigate   = useNavigate();

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem('pdv_remember_me') === 'true';
      const savedEmail = localStorage.getItem('pdv_remember_email');
      const savedPass = localStorage.getItem('pdv_remember_pass');

      if (savedRemember && savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
        if (savedPass) {
          setPassword(decodePass(savedPass));
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar credenciais salvas:', e);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.access_token, data.user);

      if (rememberMe) {
        localStorage.setItem('pdv_remember_me', 'true');
        localStorage.setItem('pdv_remember_email', email);
        localStorage.setItem('pdv_remember_pass', encodePass(password));
      } else {
        localStorage.removeItem('pdv_remember_me');
        localStorage.removeItem('pdv_remember_email');
        localStorage.removeItem('pdv_remember_pass');
      }

      toast.success(`Bem-vindo ao ${data.user.tenant}, ${data.user.name}!`);
      navigate(loginDestination(data.user));
    } catch {
      toast.error('Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="pratic-login">
      <div className="pratic-login-backdrop" aria-hidden="true">
        <svg className="pratic-wave-layer pratic-wave-layer--primary" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g className="pratic-wave-flow pratic-wave-flow--first">
            <path className="pratic-wave-band" d="M-8 20 C14 19 15 43 31 51 S49 54 59 49" />
            <path d="M-8 20 C14 19 15 43 31 51 S49 54 59 49" />
          </g>
          <g className="pratic-wave-flow pratic-wave-flow--second">
            <path d="M-8 39 C12 36 18 57 32 63 S49 64 59 60" />
          </g>
        </svg>
        <svg className="pratic-wave-layer pratic-wave-layer--secondary" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g className="pratic-wave-flow pratic-wave-flow--first">
            <path className="pratic-wave-band" d="M55 71 C68 78 77 70 85 62 S98 47 108 44" />
            <path d="M55 71 C68 78 77 70 85 62 S98 47 108 44" />
          </g>
          <g className="pratic-wave-flow pratic-wave-flow--second">
            <path d="M59 84 C73 86 81 81 89 75 S100 69 109 70" />
          </g>
        </svg>
      </div>

      <header className="pratic-login-brand">
        <div className="pratic-brand-lockup-wrap">
          <img
            className="pratic-brand-lockup"
            src="/pratic/logo-pratic-completo.png"
            alt="Pratic — uma rede de praticidade"
            width="640"
            height="256"
          />
          <svg className="pratic-logo-sweep" viewBox="0 0 1254 1254" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="pratic-mark-light" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
                <stop offset="36%" stopColor="#a7f3d0" stopOpacity="0.26" />
                <stop offset="72%" stopColor="#10b981" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="pratic-mark-light-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="52%" stopColor="#d1fae5" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g>
              <circle r="280" fill="url(#pratic-mark-light)">
                <animateMotion
                  dur="8s"
                  repeatCount="indefinite"
                  path="M 125 475 C 155 430 185 420 260 420 L 860 420 C 1030 420 1130 490 1140 590 C 1150 690 1070 745 930 745 L 760 745 C 645 745 585 800 560 900 L 550 995 C 548 1065 465 1095 405 1050 C 350 1010 355 940 355 830 L 355 610 C 350 560 320 525 270 500 C 220 480 170 480 125 475"
                />
              </circle>
              <circle r="150" fill="url(#pratic-mark-light-core)">
                <animateMotion
                  dur="8s"
                  repeatCount="indefinite"
                  path="M 125 475 C 155 430 185 420 260 420 L 860 420 C 1030 420 1130 490 1140 590 C 1150 690 1070 745 930 745 L 760 745 C 645 745 585 800 560 900 L 550 995 C 548 1065 465 1095 405 1050 C 350 1010 355 940 355 830 L 355 610 C 350 560 320 525 270 500 C 220 480 170 480 125 475"
                />
              </circle>
            </g>
          </svg>
        </div>
      </header>

      <section className="pratic-login-panel" aria-labelledby="login-title">
        <div className="pratic-login-card">
          <div className="pratic-login-heading">
            <span className="pratic-login-eyebrow">ACESSO AO SISTEMA</span>
            <h1 id="login-title">Bem-vindo de volta</h1>
            <p>Entre com seu e-mail e senha para continuar.</p>
          </div>

          <form onSubmit={handleLogin} className="pratic-login-form">
            <div className="pratic-field">
              <label htmlFor="login-email">E-mail</label>
              <div className="pratic-input-wrap">
                <Mail aria-hidden="true" size={18} />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                />
              </div>
            </div>

            <div className="pratic-field">
              <label htmlFor="login-password">Senha</label>
              <div className="pratic-input-wrap">
                <Lock aria-hidden="true" size={18} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                />
                <button
                  type="button"
                  className="pratic-password-toggle"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(current => !current)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </div>
            </div>

            <label className="pratic-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              <span>Lembrar-me neste dispositivo</span>
            </label>

            <button type="submit" className="pratic-submit" disabled={loading}>
              {loading ? <><Loader2 aria-hidden="true" className="pratic-spinner" size={18} />Entrando…</> : 'Entrar'}
            </button>
          </form>

          <p className="pratic-login-footer">Uma solução Pract</p>
        </div>

        <footer className="pratic-login-tagline">
          <h2>Sua operação. <span>Mais simples</span> de controlar.</h2>
          <p>Fazer funcionar. Fazer fluir. Fazer sentido.</p>
        </footer>
      </section>
    </main>
  );
}
