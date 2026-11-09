import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldAlert, Sparkles, User, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface CollaboratorAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CollaboratorAccessModal({
  isOpen,
  onClose,
  onSuccess,
}: CollaboratorAccessModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingUser, setExistingUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setPassword('');
    setShowPassword(false);

    api
      .get('/users')
      .then(res => {
        const users = res.data || [];
        const opUser = users.find((u: any) => u.role === 'operator');
        if (opUser) {
          setExistingUser(opUser);
          setEmail(opUser.email);
        } else {
          setExistingUser(null);
          setEmail('');
        }
      })
      .catch(() => {
        setExistingUser(null);
        setEmail('');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789!@#$';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
    setShowPassword(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      toast.error('Informe um e-mail válido para o acesso da equipe.');
      return;
    }

    if (!existingUser && password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (existingUser && password && password.length < 6) {
      toast.error('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (existingUser) {
        const payload: any = { email: email.trim().toLowerCase() };
        if (password) payload.password = password;
        await api.patch(`/users/${existingUser.id}`, payload);
        toast.success('Credenciais de login dos colaboradores atualizadas com sucesso!');
      } else {
        await api.post('/users', {
          name: 'Colaboradores',
          email: email.trim().toLowerCase(),
          password,
          role: 'operator',
        });
        toast.success('Conta de acesso dos colaboradores criada com sucesso!');
      }

      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar as credenciais da equipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] overflow-y-auto rounded-2xl border border-[var(--pc-border)] bg-white shadow-2xl text-[var(--pc-text)]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[var(--pc-border)] bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-[var(--pc-action)] ring-1 ring-emerald-100">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Acesso dos Colaboradores</h2>
              <p className="text-xs text-slate-500">
                Credencial única da equipe para entrar no sistema
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="flex h-44 items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="animate-spin text-[var(--pc-action)]" size={18} />
            <span>Consultando credenciais da equipe…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Aviso Explicativo do Fluxo */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700 space-y-1">
              <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                <KeyRound size={13} className="text-emerald-700" />
                Como funciona o acesso da equipe?
              </p>
              <p className="text-2xs text-slate-600 leading-relaxed">
                Todos os colaboradores entram no sistema no computador, tablet ou celular com este <strong>e-mail e senha</strong>. Logo após entrar, cada colaborador seleciona seu perfil e digita seu <strong>PIN de 4 dígitos</strong> para ter acesso restrito à Agenda e ao PDV.
              </p>
            </div>

            {/* E-mail de Login */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                E-mail de Login da Equipe *
              </label>
              <div className="relative">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="colaborador@petshop.com"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-[var(--pc-border-strong)] bg-white text-sm text-slate-900 focus:outline-none focus:border-[var(--pc-action)] transition"
                />
                <Mail size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Senha */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  {existingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha de Acesso *'}
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-2xs font-semibold text-[var(--pc-action)] hover:underline flex items-center gap-1"
                >
                  <Sparkles size={11} />
                  Gerar senha aleatória
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={existingUser ? '••••••••' : 'Mínimo 6 caracteres'}
                  className="w-full h-11 pl-9 pr-10 rounded-xl border border-[var(--pc-border-strong)] bg-white text-sm font-mono text-slate-900 focus:outline-none focus:border-[var(--pc-action)] transition"
                />
                <Lock size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-2xs text-slate-400">
                {existingUser
                  ? 'Preencha este campo somente se desejar alterar a senha atual da equipe.'
                  : 'Defina a senha que a equipe usará na tela de login.'}
              </p>
            </div>

            {/* Rodapé com botões de ação */}
            <div className="flex items-center justify-end gap-2.5 border-t border-[var(--pc-border)] pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="h-10 px-4 rounded-xl border border-[var(--pc-border-strong)] bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !email.trim() || (!existingUser && password.length < 6)}
                className="h-10 px-5 rounded-xl bg-[var(--pc-action)] text-xs font-bold text-white hover:bg-[var(--pc-action-hover)] disabled:opacity-50 transition flex items-center gap-2 shadow-2xs"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                <span>{saving ? 'Salvando…' : existingUser ? 'Salvar Credenciais' : 'Criar Acesso da Equipe'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
