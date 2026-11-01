"use client";
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useNavigate } from 'react-router-dom';
import { Wine, Lock, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.access_token, data.user);
      toast.success(`Bem vindo ao ${data.user.tenant}, ${data.user.name}!`);
      navigate('/');
    } catch (err) {
      toast.error('Credenciais inválidas. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 bg-gradient-to-br from-zinc-900 to-black text-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-96 h-96 bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-sky-600 rounded-full blur-[150px]"></div>
      </div>

      <div className="w-full max-w-md z-10 p-8 rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
            <Wine size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">7bar POS</h1>
          <p className="text-zinc-400 mt-2 text-sm">Acesse o seu Ponto de Venda</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-zinc-300 ml-1">Email Profissional</label>
            <div className="relative mt-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-zinc-500" />
              </div>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/50 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-zinc-600"
                placeholder="admin@7bar.com.br"
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-zinc-300 ml-1">Senha de Acesso</label>
            <div className="relative mt-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-zinc-500" />
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/50 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-white placeholder-zinc-600"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Entrar no Sistema"}
          </button>
        </form>
      </div>
    </div>
  );
}
