"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Package, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export interface PackagingItem {
  id: string;
  name: string;
  multiplier: number;
  createdAt?: string;
}

interface ManagePackagingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPackagingsChange?: () => void;
  theme?: 'light' | 'dark';
}

export default function ManagePackagingsModal({
  isOpen,
  onClose,
  onPackagingsChange,
  theme,
}: ManagePackagingsModalProps) {
  const [packagings, setPackagings] = useState<PackagingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newMultiplier, setNewMultiplier] = useState<number | ''>(6);

  const isPetshop = theme === 'light' || (typeof window !== 'undefined' && window.location.pathname.startsWith('/petshop'));

  const fetchPackagings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/purchase-orders/packagings/all');
      setPackagings(data || []);
    } catch {
      toast.error('Erro ao buscar embalagens.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchPackagings();
    }
  }, [isOpen, fetchPackagings]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const trimmedName = newName.trim();
    const multNum = Number(newMultiplier);

    if (!trimmedName) {
      toast.error('Informe o nome da embalagem (ex: Fardo c/ 6).');
      return;
    }

    if (!multNum || multNum < 1) {
      toast.error('Informe uma quantidade de unidades válida (maior ou igual a 1).');
      return;
    }

    setCreating(true);
    try {
      await api.post('/purchase-orders/packagings', {
        name: trimmedName,
        multiplier: multNum,
      });

      setNewName('');
      setNewMultiplier(6);
      toast.success(`Embalagem "${trimmedName}" cadastrada com sucesso!`);
      await fetchPackagings();
      onPackagingsChange?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Erro ao cadastrar embalagem.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/purchase-orders/packagings/${id}`);
      toast.success(`Embalagem "${name}" removida!`);
      await fetchPackagings();
      onPackagingsChange?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Erro ao remover embalagem.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 ${
      isPetshop ? 'bg-slate-950/45 backdrop-blur-[2px]' : 'bg-black/70 backdrop-blur-xs'
    }`}>
      <div className={`w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] ${
        isPetshop
          ? 'bg-white border border-[var(--pc-border)] text-slate-800'
          : 'bg-zinc-900 border border-zinc-800 text-white'
      }`}>
        {/* Header */}
        <div className={`p-5 flex justify-between items-center z-10 sticky top-0 ${
          isPetshop
            ? 'bg-white/95 border-b border-[var(--pc-border)] backdrop-blur'
            : 'bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isPetshop
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}>
              <Package size={18} />
            </div>
            <div>
              <h2 className={`font-bold text-base ${isPetshop ? 'text-slate-900' : 'text-white'}`}>
                Gerenciar Embalagens
              </h2>
              <p className={`text-xs ${isPetshop ? 'text-slate-500' : 'text-zinc-500'}`}>
                Configure fardos, caixas e kits para conversão
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isPetshop
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Cadastro Rápido */}
          <div className={`rounded-xl p-3.5 space-y-2.5 border ${
            isPetshop
              ? 'bg-slate-50/80 border-[var(--pc-border)]'
              : 'bg-zinc-950/70 border-zinc-800/80'
          }`}>
            <label className={`text-xs font-semibold block ${isPetshop ? 'text-slate-700' : 'text-zinc-400'}`}>
              Cadastrar Nova Embalagem:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nome (ex: Fardo c/ 6)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                disabled={creating}
                className={`flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors disabled:opacity-50 border ${
                  isPetshop
                    ? 'bg-white border-[var(--pc-border-strong)] text-slate-900 placeholder:text-slate-400 focus:border-[var(--pc-action)]'
                    : 'bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-emerald-500'
                }`}
              />
              <div className="relative w-24">
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Und (ex: 6)"
                  value={newMultiplier}
                  onChange={(e) => setNewMultiplier(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  disabled={creating}
                  className={`w-full rounded-xl px-3 py-2 text-sm text-center focus:outline-none transition-colors disabled:opacity-50 border ${
                    isPetshop
                      ? 'bg-white border-[var(--pc-border-strong)] text-slate-900 focus:border-[var(--pc-action)]'
                      : 'bg-zinc-900 border-zinc-800 text-white focus:border-emerald-500'
                  }`}
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newMultiplier}
                className={`px-3.5 rounded-xl font-bold transition flex items-center justify-center shadow-xs active:scale-95 shrink-0 text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                  isPetshop
                    ? 'bg-[var(--pc-action)] hover:bg-[var(--pc-action-hover)]'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-md'
                }`}
                title="Adicionar Embalagem"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              </button>
            </div>
            <p className={`text-[11px] leading-relaxed ${isPetshop ? 'text-slate-500' : 'text-zinc-500'}`}>
              Exemplo: ao cadastrar <strong>Fardo c/ 12</strong> (Und: 12), dar entrada em 2 fardos somará 24 unidades no estoque.
            </p>
          </div>

          {/* Lista de Embalagens */}
          <div className="space-y-2">
            <div className={`flex items-center justify-between text-xs font-semibold px-1 ${
              isPetshop ? 'text-slate-500' : 'text-zinc-400'
            }`}>
              <span>Embalagens Cadastradas</span>
              <span className={isPetshop ? 'text-slate-400' : 'text-zinc-500'}>
                {packagings.length} {packagings.length === 1 ? 'tipo' : 'tipos'}
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className={`animate-spin ${isPetshop ? 'text-[var(--pc-action)]' : 'text-emerald-500'}`} />
              </div>
            ) : packagings.length === 0 ? (
              <div className={`text-center py-8 px-4 border border-dashed rounded-xl ${
                isPetshop
                  ? 'bg-slate-50/60 border-[var(--pc-border-strong)]'
                  : 'bg-zinc-950/40 border-zinc-800'
              }`}>
                <Package size={28} className={`mx-auto mb-2 opacity-60 ${isPetshop ? 'text-slate-400' : 'text-zinc-600'}`} />
                <p className={`text-sm font-medium ${isPetshop ? 'text-slate-700' : 'text-zinc-400'}`}>
                  Nenhuma embalagem cadastrada.
                </p>
                <p className={`text-xs mt-0.5 ${isPetshop ? 'text-slate-400' : 'text-zinc-600'}`}>
                  Cadastre acima os formatos de venda/compra do seu estabelecimento.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-0.5">
                {packagings.map((p) => (
                  <div
                    key={p.id}
                    className={`flex justify-between items-center p-3 rounded-xl transition-colors border ${
                      isPetshop
                        ? 'bg-white border-[var(--pc-border)] hover:border-[var(--pc-border-strong)] shadow-2xs'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold border ${
                        isPetshop
                          ? 'bg-slate-100 text-slate-700 border-[var(--pc-border)]'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                      }`}>
                        {p.multiplier}x
                      </div>
                      <div>
                        <strong className={`block text-sm ${isPetshop ? 'text-slate-900' : 'text-zinc-200'}`}>
                          {p.name}
                        </strong>
                        <span className={`text-xs font-medium ${isPetshop ? 'text-emerald-700' : 'text-emerald-400'}`}>
                          Multiplica por {p.multiplier} un no estoque
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deletingId === p.id}
                      className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                        isPetshop
                          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title="Excluir embalagem"
                    >
                      {deletingId === p.id ? (
                        <Loader2 size={16} className={`animate-spin ${isPetshop ? 'text-rose-600' : 'text-red-400'}`} />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex justify-end ${
          isPetshop
            ? 'bg-slate-50/70 border-[var(--pc-border)]'
            : 'bg-zinc-950/60 border-zinc-800'
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              isPetshop
                ? 'border border-[var(--pc-border-strong)] bg-white text-slate-700 hover:bg-slate-100 shadow-2xs'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
