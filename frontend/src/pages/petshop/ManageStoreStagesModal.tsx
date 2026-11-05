import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  CheckCircle2,
  Sparkles,
  Droplets,
  Scissors,
  LogIn,
  Layers,
  Info,
  Sliders,
  Workflow,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ALL_PETSHOP_STAGES, type PetshopStageItem, normalizeStages } from './types';
import { primaryButton, secondaryButton } from './ui';

interface ManageStoreStagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const COLOR_OPTIONS = [
  { id: 'sky', label: 'Azul Celeste', bg: 'bg-sky-100 text-sky-800 border-sky-300' },
  { id: 'indigo', label: 'Índigo / Roxo', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { id: 'purple', label: 'Púrpura', bg: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'amber', label: 'Âmbar / Dourado', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'teal', label: 'Verde PetCare', bg: 'bg-teal-100 text-teal-800 border-teal-300' },
  { id: 'rose', label: 'Rosa Suave', bg: 'bg-rose-100 text-rose-800 border-rose-300' },
];

export const ManageStoreStagesModal: React.FC<ManageStoreStagesModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [stages, setStages] = useState<PetshopStageItem[]>([]);
  const [commissionRules, setCommissionRules] = useState<Record<string, { kind: string; value: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estado para adicionar nova etapa customizada
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPosition, setNewPosition] = useState<'after_bathing' | 'after_grooming' | 'before_ready'>('after_bathing');
  const [newColor, setNewColor] = useState('indigo');

  useEffect(() => {
    if (!isOpen) return;
    loadStages();
  }, [isOpen]);

  const loadStages = async () => {
    setLoading(true);
    try {
      const [res, rulesRes] = await Promise.all([
        api.get<PetshopStageItem[]>('/petshop/stages'),
        api.get<{ stageKey: string; serviceId: string | null; operatorId: string | null; kind: string; value: string }[]>('/petshop/commissions/rules'),
      ]);
      setCommissionRules(Object.fromEntries(rulesRes.data.filter(rule => !rule.serviceId && !rule.operatorId).map(rule => [rule.stageKey, { kind: rule.kind, value: rule.value }])));
      if (Array.isArray(res.data) && res.data.length > 0) {
        setStages(normalizeStages(res.data));
      } else {
        setStages(normalizeStages([]));
      }
    } catch {
      setStages(normalizeStages([]));
    } finally {
      setLoading(false);
    }
  };

  const handleLabelChange = (key: string, newName: string) => {
    setStages(prev =>
      prev.map(s => (s.key === key ? { ...s, label: newName } : s))
    );
  };

  const handleDescChange = (key: string, newDesc: string) => {
    setStages(prev =>
      prev.map(s => (s.key === key ? { ...s, description: newDesc } : s))
    );
  };

  const handleTrackChange = (key: string, checked: boolean) => {
    setStages(prev => prev.map(s => s.key === key ? { ...s, trackProfessional: checked } : s));
  };

  const handleResetStage = (key: string) => {
    const def = ALL_PETSHOP_STAGES.find(d => d.key === key);
    if (!def) return;
    setStages(prev =>
      prev.map(s =>
        s.key === key ? { ...s, label: def.label, description: def.description } : s
      )
    );
  };

  const handleRemoveCustomStage = (key: string) => {
    setStages(prev => prev.filter(s => s.key !== key));
  };

  const handleAddCustomStage = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = newLabel.trim();
    if (!cleanLabel) {
      toast.error('Informe o nome da etapa.');
      return;
    }

    const slug = cleanLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 20);

    const key = `custom_${slug || 'etapa'}_${Date.now().toString(36).slice(-4)}`;

    const newStageItem: PetshopStageItem = {
      key,
      label: cleanLabel,
      description: newDesc.trim() || undefined,
      isCustom: true,
      isSystem: false,
      color: newColor,
    };

    setStages(prev => {
      const updated = [...prev];
      const readyIdx = updated.findIndex(s => s.key === 'ready');
      const bathingIdx = updated.findIndex(s => s.key === 'bathing');
      const groomingIdx = updated.findIndex(s => s.key === 'grooming');

      let insertIdx = readyIdx !== -1 ? readyIdx : updated.length;

      if (newPosition === 'after_bathing' && bathingIdx !== -1) {
        insertIdx = bathingIdx + 1;
      } else if (newPosition === 'after_grooming' && groomingIdx !== -1) {
        insertIdx = groomingIdx + 1;
      }

      updated.splice(insertIdx, 0, newStageItem);
      return updated;
    });

    setNewLabel('');
    setNewDesc('');
    setShowAddForm(false);
    toast.success(`Etapa "${cleanLabel}" adicionada ao fluxo!`);
  };

  const handleResetAllToDefaults = () => {
    if (!window.confirm('Deseja restaurar todas as etapas e nomes para o padrão original do sistema?')) {
      return;
    }
    setStages(normalizeStages([]));
    toast.info('Etapas restauradas para o padrão. Clique em Salvar para confirmar.');
  };

  const handleSave = async () => {
    // Validações básicas
    if (stages.length < 3) {
      toast.error('O fluxo deve conter pelo menos uma etapa intermediária.');
      return;
    }
    const emptyNames = stages.some(s => !s.label.trim());
    if (emptyNames) {
      toast.error('Todas as etapas devem possuir um nome válido.');
      return;
    }

    setSaving(true);
    try {
      await api.put('/petshop/stages', { stages, commissionRules: stages.filter(stage => stage.trackProfessional).map(stage => ({ stageKey: stage.key, ...(commissionRules[stage.key] || { kind: 'NONE', value: '0' }) })) });
      toast.success('Etapas da loja salvas com sucesso!');
      onUpdated?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Falha ao salvar etapas da loja.');
    } finally {
      setSaving(false);
    }
  };

  const getStageIcon = (key: string, isCustom?: boolean) => {
    if (key === 'checked_in') return <LogIn size={16} className="text-teal-700" />;
    if (key === 'bathing') return <Droplets size={16} className="text-sky-700" />;
    if (key === 'grooming') return <Scissors size={16} className="text-purple-700" />;
    if (key === 'finishing') return <Sparkles size={16} className="text-amber-700" />;
    if (key === 'ready') return <CheckCircle2 size={16} className="text-emerald-700" />;
    return <Workflow size={16} className="text-indigo-600" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 bg-zinc-50/70">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100/80 text-teal-800 ring-1 ring-teal-200">
              <Workflow size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Gerenciar Etapas do Atendimento (Loja)
              </h2>
              <p className="text-xs text-zinc-500">
                Personalize os nomes das etapas padrão ou crie novas etapas para a sua operação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Alerta Informativo */}
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/60 p-3.5 flex items-start gap-2.5">
            <Info size={18} className="text-teal-700 shrink-0 mt-0.5" />
            <div className="text-xs text-teal-950 space-y-1">
              <p className="font-semibold">
                Flexibilidade Total para o seu Pet Shop:
              </p>
              <p className="text-teal-900">
                Você pode renomear qualquer etapa para o termo que sua equipe já utiliza (ex: trocar <em>Banho</em> por <em>Lavatório & Spa</em>, ou <em>Finalização</em> por <em>Secador & Perfume</em>). As etapas criadas aqui ficam disponíveis para todos os serviços da loja.
              </p>
            </div>
          </div>

          {/* Lista de Etapas em Sequência */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Sequência Operacional da Loja ({stages.length} etapas)
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(prev => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-2.5 py-1 transition cursor-pointer"
              >
                <Plus size={14} />
                Nova Etapa Personalizada
              </button>
            </div>

            {/* Formulário Inline de Nova Etapa */}
            {showAddForm && (
              <form
                onSubmit={handleAddCustomStage}
                className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 p-4 space-y-3 animate-in fade-in"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-teal-700" />
                    Adicionar Nova Etapa ao Fluxo
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-zinc-400 hover:text-zinc-600 text-xs"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Nome da Etapa *
                    </label>
                    <input
                      type="text"
                      value={newLabel}
                      onChange={e => setNewLabel(e.target.value)}
                      placeholder="Ex: Secador e Soprador, Ozonioterapia, etc."
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Onde entra no fluxo?
                    </label>
                    <select
                      value={newPosition}
                      onChange={e => setNewPosition(e.target.value as any)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="after_bathing">Após o Banho (secagem/ozônio)</option>
                      <option value="after_grooming">Após a Tosa (inspeção/escovação)</option>
                      <option value="before_ready">Antes de Pronto (ensaio/finalização)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Descrição Curta (opcional)
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Ex: Secagem profunda e remoção de pelos mortos"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 shadow-xs"
                  >
                    Adicionar Etapa
                  </button>
                </div>
              </form>
            )}

            {/* Cards de Etapas */}
            <div className="space-y-2">
              {stages.map((st, idx) => {
                const isDefault = ALL_PETSHOP_STAGES.some(d => d.key === st.key);
                const originalDef = ALL_PETSHOP_STAGES.find(d => d.key === st.key);
                const isModified = originalDef && originalDef.label !== st.label;

                return (
                  <div
                    key={st.key}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition ${
                      st.isSystem
                        ? 'bg-zinc-50/70 border-zinc-200'
                        : st.isCustom
                        ? 'bg-indigo-50/40 border-indigo-200 ring-1 ring-indigo-200/60'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    {/* Número e Ícone */}
                    <div className="flex items-center gap-2.5 min-w-[140px] sm:min-w-[180px]">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-bold text-zinc-700">
                        {idx + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {getStageIcon(st.key, st.isCustom)}
                        <span className="text-xs font-semibold text-zinc-500">
                          {st.isSystem ? (st.key === 'checked_in' ? 'Início' : 'Conclusão') : 'Etapa'}
                        </span>
                      </div>
                    </div>

                    {/* Inputs de Nome e Descrição */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          value={st.label}
                          onChange={e => handleLabelChange(st.key, e.target.value)}
                          placeholder="Nome da etapa"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        {isModified && (
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            Original: {originalDef?.label}
                          </span>
                        )}
                      </div>

                      <div className="hidden sm:block">
                        <input
                          type="text"
                          value={st.description || ''}
                          onChange={e => handleDescChange(st.key, e.target.value)}
                          placeholder="Descrição opcional"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-zinc-700">
                      <input type="checkbox" checked={Boolean(st.trackProfessional)} disabled={st.key === 'checked_in'} onChange={e => handleTrackChange(st.key, e.target.checked)} className="h-4 w-4 accent-teal-700 disabled:opacity-50" />
                      Rastrear profissional responsável
                    </label>
                    {st.trackProfessional && <div className="flex w-full flex-col gap-1 sm:w-44">
                      <label className="text-xs font-medium text-zinc-700">Comissão
                        <select value={commissionRules[st.key]?.kind || 'NONE'} onChange={e => setCommissionRules(prev => ({ ...prev, [st.key]: { kind: e.target.value, value: '0' } }))} className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs">
                          <option value="NONE">Sem comissão</option><option value="PERCENT">Percentual</option><option value="FIXED">Valor fixo</option>
                        </select>
                      </label>
                      {(commissionRules[st.key]?.kind || 'NONE') !== 'NONE' && <label className="text-xs font-medium text-zinc-700">{commissionRules[st.key]?.kind === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'}
                        <input type="number" min="0" max={commissionRules[st.key]?.kind === 'PERCENT' ? 100 : undefined} step="0.01" value={commissionRules[st.key]?.value || '0'} onChange={e => setCommissionRules(prev => ({ ...prev, [st.key]: { kind: prev[st.key]?.kind || 'NONE', value: e.target.value } }))} className="mt-1 min-h-10 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs" />
                      </label>}
                    </div>}

                    {/* Ações / Badges */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {st.isCustom ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomStage(st.key)}
                          className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer"
                          title="Remover esta etapa customizada"
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : isModified ? (
                        <button
                          type="button"
                          onClick={() => handleResetStage(st.key)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition cursor-pointer"
                          title="Restaurar nome padrão original"
                        >
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-400 px-1.5 py-0.5">
                          Padrão
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3.5 bg-zinc-50/80">
          <button
            type="button"
            onClick={handleResetAllToDefaults}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 transition"
          >
            <RotateCcw size={13} />
            Restaurar Padrões do Sistema
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar Etapas da Loja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
