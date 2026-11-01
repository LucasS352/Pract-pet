import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useShift } from '@/contexts/ShiftContext';
import { Lock, User, Loader2, ArrowLeft, LayoutDashboard, LogOut, AlertCircle, UtensilsCrossed, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';

interface OperatorLoginModalProps {
  onSuccess: () => void;
  onClose?: () => void;
  isReauth?: boolean;
  returnPath?: string;
}

interface OperatorData {
  id: string;
  name: string;
  isManager?: boolean;
  jobTitle?: string | null;
  hasOpenRegister?: boolean;
}

export function OperatorLoginModal({ onSuccess, onClose, isReauth = false, returnPath }: OperatorLoginModalProps) {
  const [operators, setOperators] = useState<OperatorData[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [tenantResolved, setTenantResolved] = useState(false);
  const [hasRestaurantModule, setHasRestaurantModule] = useState(false);
  const [hasPetshopModule, setHasPetshopModule] = useState(true);
  
  const [selectedOp, setSelectedOp] = useState<OperatorData | null>(null);
  const [pin, setPin] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const { operator, setOperator } = useShift();
  const navigate = useNavigate();

  useEffect(() => {
    // O servidor preserva o legado de adegas e aplica o isolamento por módulos.
    api.get('/operators?context=cashier')
      .then(res => {
        const ops = res.data;
        setOperators(ops);
        // Em reautenticação (F5 ou token expirado), pré-seleciona automaticamente o operador já logado
        if (isReauth && operator?.id) {
          const matched = ops.find((o: any) => o.id === operator.id);
          if (matched) setSelectedOp(matched);
        }
      })
      .catch(() => toast.error('Erro ao carregar operadores.'))
      .finally(() => setLoadingOps(false));

    api.get('/tenants/me')
      .then(res => {
        const mod = res.data?.modulos;
        const parsed = typeof mod === 'string' ? JSON.parse(mod) : (mod || {});
        if (parsed?.restaurante === true) {
          setHasRestaurantModule(true);
        }
        if (parsed?.petshop === true) {
          setHasPetshopModule(true);
        }
      })
      .catch(() => {})
      .finally(() => setTenantResolved(true));
  }, [isReauth, operator?.id]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOp || pin.length < 4) return;
    
    setLoadingLogin(true);
    setErrorMessage(null);
    try {
      const res = await api.post('/auth/operator-login', { operatorId: selectedOp.id, pin, context: 'cashier' });
      const { operatorToken, ...operatorData } = res.data;
      setOperator(operatorData, operatorToken);
      toast.success(isReauth ? 'Reautenticação concluída com sucesso!' : `Bem-vindo, ${res.data.name}!`);
      onSuccess();
    } catch (err: any) {
      const msg = 'Senha incorreta. Ao esquecer, contate o administrador.';
      setErrorMessage(msg);
      toast.error(msg, { duration: 4000 });
      setPin('');
    } finally {
      setLoadingLogin(false);
    }
  };

  const { logout } = useAuthStore();

  const handleGlobalLogout = () => {
    logout();
    navigate('/login');
  };

  if (!tenantResolved) {
    return <div className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950" role="status" aria-label="Preparando acesso ao caixa"><Loader2 className="animate-spin text-zinc-500" size={30} /></div>;
  }

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-md ${hasPetshopModule ? 'petcare-operator-modal' : ''}`}>
      <div className="relative bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden p-8 animate-in fade-in zoom-in-95 duration-300">
        {!isReauth && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 transition cursor-pointer"
            title="Cancelar e manter operador atual"
          >
            <X size={18} />
          </button>
        )}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Lock className="text-blue-500" size={32} />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {isReauth ? 'Reautenticação do Operador' : 'Seleção de Operador'}
          </h2>
          <p className="text-zinc-400 mt-2">
            {isReauth
              ? 'Sua credencial de segurança expirou ou a página foi recarregada. Confirme seu PIN para continuar.'
              : 'Escolha seu perfil e informe seu PIN para acessar o PDV.'}
          </p>
        </div>

        {loadingOps ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : !selectedOp ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {operators.map(op => (
              <button
                key={op.id}
                onClick={() => setSelectedOp(op)}
                className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/50 p-4 rounded-2xl flex items-center gap-4 transition-all text-left group"
              >
                <div className="relative w-10 h-10 bg-zinc-800 group-hover:bg-blue-500/20 rounded-full flex items-center justify-center shrink-0 transition-colors">
                  <User className="text-zinc-400 group-hover:text-blue-400 transition-colors" size={20} />
                  {op.hasOpenRegister && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-zinc-950 rounded-full" title="Ativo no caixa"></span>
                  )}
                </div>
                <div className="flex-1 flex justify-between items-center overflow-hidden gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-bold truncate">{op.name}</p>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider truncate">
                      {op.jobTitle || (op.isManager ? 'Gerente' : 'Operador')}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <button
              type="button"
              onClick={() => { setSelectedOp(null); setPin(''); setErrorMessage(null); }}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-semibold mb-4"
            >
              <ArrowLeft size={16} /> {isReauth ? 'Entrar com outro operador' : 'Voltar aos operadores'}
            </button>
            
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <User className="text-blue-400" size={32} />
              </div>
              <h3 className="text-xl font-bold text-white">{selectedOp.name}</h3>
              <p className="text-zinc-500 text-sm">{selectedOp.jobTitle || (selectedOp.isManager ? 'Gerente de Caixa' : 'Operador')}</p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-zinc-400 mb-1 block text-center">Digite seu PIN (4-6 dígitos)</label>
              <input
                type="password"
                autoFocus
                value={pin}
                onChange={e => {
                  setPin(e.target.value.replace(/[^0-9]/g, ''));
                  if (errorMessage) setErrorMessage(null);
                }}
                maxLength={6}
                className={`w-full bg-zinc-950 border-2 ${errorMessage ? 'border-red-500/80 bg-red-500/5 focus:border-red-500' : 'border-zinc-800 focus:border-blue-500'} rounded-2xl px-4 py-4 text-center text-3xl tracking-[1em] font-black text-white outline-none transition-all`}
                placeholder="••••"
              />

              {errorMessage && (
                <div className="flex items-center justify-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-400 text-xs font-semibold animate-in fade-in slide-in-from-top-1 duration-200 text-center">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loadingLogin || pin.length < 4}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/20 flex justify-center items-center gap-2 text-lg active:scale-95"
            >
              {loadingLogin ? <Loader2 className="animate-spin" size={24} /> : <Lock size={20} />}
              Acessar PDV
            </button>
          </form>
        )}
        
        <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button 
              type="button"
              onClick={() => navigate(returnPath || (hasPetshopModule ? '/petshop' : '/dashboard'))}
              className="text-zinc-500 hover:text-zinc-300 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <LayoutDashboard size={16} /> {returnPath?.startsWith('/restaurante') ? 'Voltar ao restaurante' : hasPetshopModule ? 'Voltar ao Pet Care' : 'Voltar ao Painel Administrativo'}
            </button>

            {hasRestaurantModule && (
              <button 
                type="button"
                onClick={() => navigate('/garcom')} 
                className="bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 hover:border-orange-500/50 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
              >
                <UtensilsCrossed size={14} /> Modo Garçom
              </button>
            )}
          </div>
          
          <button 
            type="button"
            onClick={handleGlobalLogout} 
            className="text-red-500/70 hover:text-red-400 font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto cursor-pointer"
          >
            <LogOut size={14} /> Sair do Sistema (Logout)
          </button>
        </div>
      </div>
    </div>
  );
}
