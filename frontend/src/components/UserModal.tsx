"use client";
import { useState } from "react";
import { X, Loader2, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface UserModalProps {
  onClose: () => void;
  onSuccess: () => void;
  user?: any;
}

export default function UserModal({ onClose, onSuccess, user }: UserModalProps) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role || "operator");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user && password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    
    setLoading(true);
    try {
      const payload: any = { name, email, role };
      if (password) payload.password = password;

      if (user) {
        await api.patch(`/users/${user.id}`, payload);
        toast.success("Usuário atualizado com sucesso!");
      } else {
        await api.post("/users", payload);
        toast.success("Usuário criado com sucesso!");
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Erro ao ${user ? 'atualizar' : 'criar'} usuário.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white">{user ? "Editar Conta de Acesso" : "Nova Conta de Acesso"}</h2>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João da Silva"
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all outline-none text-white text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">E-mail de Acesso</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@restaurante.com.br"
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all outline-none text-white text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">Nível de Acesso (Função)</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={user?.role === "admin"}
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all outline-none text-white text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="operator">Operador de Caixa (Terminal)</option>
              <option value="admin">Administrador (Total)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-1.5 block">
              {user ? "Nova Senha (deixe em branco para manter)" : "Senha Inicial"}
            </label>
            <input
              type="text" // Texto para facilitar a cópia
              required={!user}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all outline-none text-white text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-lg flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (user ? "Salvar Alterações" : "Cadastrar Conta")}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
