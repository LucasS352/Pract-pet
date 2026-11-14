import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Coins,
  Edit3,
  Layers,
  Lock,
  PawPrint,
  Percent,
  Plus,
  Scissors,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader, pageClass, TeamTabs } from './ui';
import { ManageStoreStagesModal } from './ManageStoreStagesModal';
import {
  type PetService,
  type PetshopStageItem,
  normalizeStages,
  suggestStagesForService,
} from './types';
import {
  type CommissionRule,
  PET_SIZE_OPTIONS,
  SIZE_LABEL_MAP,
  formatCommissionBrl,
  formatRuleValue,
  isPositiveRule,
  resolveEffectiveRule,
  resolveStageLabel,
  rulePrecedenceLabel,
  ruleScopeScore,
} from './commissionRulesUtils';

type ViewMode = 'all' | 'stages' | 'services' | 'rules';

type InlineDraft = {
  id: string;
  stageKey: string;
  serviceId: string | null;
  operatorId: string | null;
  size: string;
  kind: 'NONE' | 'PERCENT' | 'FIXED';
  value: string;
};

type RuleModalForm = {
  stageKey: string;
  serviceId: string;
  operatorId: string;
  size: string;
  kind: 'NONE' | 'PERCENT' | 'FIXED';
  value: string;
};

const STAGE_COLOR_CLASS: Record<string, string> = {
  teal: 'border-teal-200 bg-teal-50 text-teal-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  purple: 'border-purple-200 bg-purple-50 text-purple-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
};

const stagePillClass = (color?: string) =>
  STAGE_COLOR_CLASS[color || 'indigo'] || STAGE_COLOR_CLASS.indigo;

const getServiceStageKeys = (svc: PetService, storeStages: PetshopStageItem[]): string[] => {
  const raw = Array.isArray(svc.customStages) && svc.customStages.length > 0
    ? svc.customStages.map(item => (typeof item === 'string' ? item : item.key))
    : suggestStagesForService(svc.name, svc.category);
  const storeOrder = new Map(storeStages.map((s, idx) => [s.key, idx]));
  return [...new Set(raw)].sort(
    (a, b) => (storeOrder.get(a) ?? 999) - (storeOrder.get(b) ?? 999),
  );
};

export default function PetshopCommissionRulesPage() {
  const [stages, setStages] = useState<PetshopStageItem[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [services, setServices] = useState<PetService[]>([]);
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [onlyPositive, setOnlyPositive] = useState(false);
  const [showInactiveServices, setShowInactiveServices] = useState(false);

  const [inlineDraft, setInlineDraft] = useState<InlineDraft | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [stagesModalOpen, setStagesModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState<RuleModalForm>({
    stageKey: '',
    serviceId: '',
    operatorId: '',
    size: 'all',
    kind: 'PERCENT',
    value: '10',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesRes, rulesRes, servicesRes, operatorsRes] = await Promise.all([
        api.get<PetshopStageItem[]>('/petshop/stages'),
        api.get<CommissionRule[]>('/petshop/commissions/rules'),
        api.get<PetService[]>('/petshop/services', { params: { includeInactive: 'true' } }),
        api.get<{ id: string; name: string }[]>('/operators'),
      ]);
      setStages(normalizeStages(stagesRes.data || []));
      setRules(rulesRes.data || []);
      setServices(servicesRes.data || []);
      setOperators(operatorsRes.data || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível carregar o mapa de comissões.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const serviceName = useCallback(
    (serviceId: string | null) =>
      serviceId ? services.find(s => s.id === serviceId)?.name || 'Serviço removido' : 'Todos os serviços',
    [services],
  );

  const operatorName = useCallback(
    (operatorId: string | null) =>
      operatorId ? operators.find(o => o.id === operatorId)?.name || 'Profissional inativo' : 'Todos os profissionais',
    [operators],
  );

  const openNewRuleModal = (prefill?: Partial<RuleModalForm>) => {
    const firstTrackable = stages.find(s => s.key !== 'checked_in' && s.trackProfessional)?.key
      || stages.find(s => s.key !== 'checked_in')?.key
      || '';
    const nextStage = prefill?.stageKey ?? firstTrackable;
    const isAddon = nextStage === 'service_added';
    setModalForm({
      stageKey: nextStage,
      serviceId: prefill?.serviceId ?? '',
      operatorId: isAddon ? '' : (prefill?.operatorId ?? ''),
      size: isAddon ? 'all' : (prefill?.size ?? 'all'),
      kind: isAddon ? 'FIXED' : (prefill?.kind ?? 'PERCENT'),
      value: prefill?.value ?? '0',
    });
    setRuleModalOpen(true);
  };

  const toggleStageTracking = async (stageKey: string, trackProfessional: boolean) => {
    if (stageKey === 'checked_in') {
      toast.error('Check-in é uma etapa de entrada e não pode ser comissionada.');
      return;
    }
    setBusy(true);
    try {
      const updated = stages.map(s => (s.key === stageKey ? { ...s, trackProfessional } : s));
      await api.put('/petshop/stages', { stages: updated });
      toast.success(
        trackProfessional
          ? 'Rastreamento de profissional ativado para a etapa.'
          : 'Rastreamento de profissional desativado para a etapa.',
      );
      await loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível atualizar o rastreamento da etapa.');
    } finally {
      setBusy(false);
    }
  };

  const persistRule = async (input: {
    stageKey: string;
    serviceId: string | null;
    operatorId: string | null;
    size: string;
    kind: string;
    value: string;
  }) => {
    if (!input.stageKey) {
      toast.error('Selecione o status/etapa.');
      return false;
    }
    if (input.stageKey === 'checked_in') {
      toast.error('Check-in não gera comissão.');
      return false;
    }
    const kind = input.kind.toUpperCase();
    const numericRaw = String(input.value ?? '0').trim().replace(',', '.');
    const numeric = Number(numericRaw);
    if (kind !== 'NONE' && (!Number.isFinite(numeric) || numeric < 0)) {
      toast.error('Informe um valor numérico válido.');
      return false;
    }
    if (kind === 'PERCENT' && numeric > 100) {
      toast.error('Percentual deve ser no máximo 100%.');
      return false;
    }
    if (input.stageKey === 'service_added' && !input.serviceId) {
      toast.error('Selecione o serviço para definir o bônus de adição.');
      return false;
    }
    if (input.stageKey === 'service_added' && kind === 'FIXED' && numeric <= 0) {
      toast.error('Para bônus de serviço adicional, informe um valor maior que R$ 0,00 ou selecione Sem comissão.');
      return false;
    }

    setBusy(true);
    try {
      // Se a etapa ainda não rastreia o profissional responsável, habilita automaticamente ao salvar comissão
      if (input.stageKey !== 'service_added') {
        const targetStage = stages.find(s => s.key === input.stageKey);
        if (targetStage && !targetStage.trackProfessional) {
          const updatedStages = stages.map(s =>
            s.key === input.stageKey ? { ...s, trackProfessional: true } : s,
          );
          await api.put('/petshop/stages', { stages: updatedStages });
        }
      }

      await api.post('/petshop/commissions/rules', {
        stageKey: input.stageKey,
        serviceId: input.serviceId || null,
        operatorId: input.stageKey === 'service_added' ? null : (input.operatorId || null),
        size: input.stageKey === 'service_added' ? 'all' : (input.size || 'all'),
        kind,
        value: kind === 'NONE' ? '0' : String(numericRaw || '0'),
      });
      toast.success('Comissão atualizada com sucesso.');
      setInlineDraft(null);
      setRuleModalOpen(false);
      await loadData();
      return true;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível salvar a regra.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (rule: CommissionRule) => {
    const label = `${resolveStageLabel(rule.stageKey, stages)} · ${serviceName(rule.serviceId)}`;
    if (!window.confirm(`Remover a regra ativa "${label}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/petshop/commissions/rules/${rule.id}`);
      toast.success('Regra removida.');
      if (inlineDraft?.id === `rule:${rule.id}`) setInlineDraft(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível remover a regra.');
    } finally {
      setBusy(false);
    }
  };

  const startInlineEdit = (
    draftId: string,
    stageKey: string,
    serviceId: string | null,
    operatorId: string | null,
    size: string,
    existing?: Pick<CommissionRule, 'kind' | 'value'> | null,
    defaultPositiveKind: 'PERCENT' | 'FIXED' = 'PERCENT',
  ) => {
    const kind = existing?.kind === 'PERCENT' || existing?.kind === 'FIXED' || existing?.kind === 'NONE'
      ? existing.kind
      : defaultPositiveKind;
    setInlineDraft({
      id: draftId,
      stageKey,
      serviceId,
      operatorId,
      size: size || 'all',
      kind,
      value: existing ? String(Number(existing.value || 0)) : '0',
    });
  };

  // KPIs
  const trackedStagesCount = useMemo(() => stages.filter(s => s.trackProfessional).length, [stages]);
  const activeServicesList = useMemo(() => services.filter(s => s.active), [services]);
  const servicesWithOwnRuleCount = useMemo(() => {
    const ids = new Set(rules.filter(r => r.serviceId && isPositiveRule(r)).map(r => r.serviceId!));
    return activeServicesList.filter(s => ids.has(s.id)).length;
  }, [activeServicesList, rules]);
  const positiveRulesCount = useMemo(() => rules.filter(r => isPositiveRule(r)).length, [rules]);
  const operatorsWithRuleCount = useMemo(
    () => new Set(rules.filter(r => r.operatorId && isPositiveRule(r)).map(r => r.operatorId!)).size,
    [rules],
  );

  // Filtros
  const normSearch = search.trim().toLowerCase();

  const filteredStages = useMemo(() => {
    return stages.filter(stage => {
      const stageRules = rules.filter(r => r.stageKey === stage.key);
      const hasPositive = stageRules.some(isPositiveRule);
      if (onlyPositive && !hasPositive) return false;
      if (!normSearch) return true;
      const matchesStage =
        stage.label.toLowerCase().includes(normSearch) ||
        stage.key.toLowerCase().includes(normSearch) ||
        (stage.description || '').toLowerCase().includes(normSearch);
      const matchesRule = stageRules.some(r =>
        serviceName(r.serviceId).toLowerCase().includes(normSearch) ||
        operatorName(r.operatorId).toLowerCase().includes(normSearch),
      );
      return matchesStage || matchesRule;
    });
  }, [stages, rules, onlyPositive, normSearch, serviceName, operatorName]);

  const filteredServices = useMemo(() => {
    return services.filter(svc => {
      if (!showInactiveServices && !svc.active) return false;
      const svcStageKeys = getServiceStageKeys(svc, stages);
      const svcRules = rules.filter(r => r.serviceId === svc.id);
      const hasPositiveEffective =
        svcRules.some(isPositiveRule) ||
        svcStageKeys.some(k => {
          const st = stages.find(s => s.key === k);
          if (!st?.trackProfessional) return false;
          const eff = resolveEffectiveRule(rules, k, svc.id, null, 'all');
          return isPositiveRule(eff);
        });
      if (onlyPositive && !hasPositiveEffective) return false;
      if (!normSearch) return true;
      return (
        svc.name.toLowerCase().includes(normSearch) ||
        svc.category.toLowerCase().includes(normSearch) ||
        svcStageKeys.some(k => resolveStageLabel(k, stages).toLowerCase().includes(normSearch))
      );
    });
  }, [services, showInactiveServices, stages, rules, onlyPositive, normSearch]);

  const sortedFilteredRules = useMemo(() => {
    return rules
      .filter(r => {
        if (onlyPositive && !isPositiveRule(r)) return false;
        if (!normSearch) return true;
        return (
          resolveStageLabel(r.stageKey, stages).toLowerCase().includes(normSearch) ||
          r.stageKey.toLowerCase().includes(normSearch) ||
          serviceName(r.serviceId).toLowerCase().includes(normSearch) ||
          operatorName(r.operatorId).toLowerCase().includes(normSearch) ||
          (SIZE_LABEL_MAP[r.size || 'all'] || '').toLowerCase().includes(normSearch)
        );
      })
      .sort((a, b) => {
        const stageDiff = a.stageKey.localeCompare(b.stageKey);
        if (stageDiff !== 0) return stageDiff;
        return ruleScopeScore(a) - ruleScopeScore(b);
      });
  }, [rules, onlyPositive, normSearch, stages, serviceName, operatorName]);

  const addonRules = useMemo(() => rules.filter(r => r.stageKey === 'service_added'), [rules]);

  return (
    <div className={`${pageClass} space-y-5 text-zinc-900`}>
      <PageHeader
        eyebrow="Equipe · Comissões"
        title="Status & Serviços Mapeados"
        description="Visualize todas as etapas do fluxo, serviços e regras de comissão aplicadas — edite qualquer comissão direto na tela."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStagesModalOpen(true)}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
            >
              <Layers size={15} className="text-[#0d6e5a]" />
              Gerenciar Etapas da Loja
            </button>
            <button
              type="button"
              onClick={() => openNewRuleModal()}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition hover:bg-[#0b5c4b]"
            >
              <Plus size={15} />
              Nova Regra
            </button>
            <Link
              to="/petshop/equipe/comissoes"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
            >
              <ArrowLeft size={15} />
              Extrato
            </Link>
          </div>
        }
      />

      <TeamTabs />

      {/* Resumo visual */}
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" aria-label="Resumo do mapeamento">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0d6e5a] ring-1 ring-teal-100">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Status / Etapas da Loja</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-900">
              {stages.length}{' '}
              <span className="text-xs font-medium text-[#0d6e5a]">({trackedStagesCount} comissionáveis)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <Scissors size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Serviços Ativos</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-900">
              {activeServicesList.length}{' '}
              <span className="text-xs font-medium text-emerald-700">({servicesWithOwnRuleCount} com regra própria)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <Percent size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Regras Ativas</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-900">
              {rules.length}{' '}
              <span className="text-xs font-medium text-sky-700">({positiveRulesCount} comissionam)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-100">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">Regras por Profissional</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-900">
              {operatorsWithRuleCount}{' '}
              <span className="text-xs font-medium text-zinc-500">de {operators.length} ativos</span>
            </p>
          </div>
        </div>
      </section>

      {/* Barra de Busca & Modos de Visualização */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por status, serviço, porte ou profissional..."
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-800 outline-none transition focus:border-[#0d6e5a] focus:ring-2 focus:ring-[#0d6e5a]/15"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: 'Visão Completa' },
                { id: 'stages', label: `Status (${filteredStages.length})` },
                { id: 'services', label: `Serviços (${filteredServices.length})` },
                { id: 'rules', label: `Tabela de Regras (${sortedFilteredRules.length})` },
              ] as Array<{ id: ViewMode; label: string }>
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  viewMode === tab.id
                    ? 'bg-[#0d6e5a] text-white shadow-2xs'
                    : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={onlyPositive}
                onChange={e => setOnlyPositive(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#0d6e5a]"
              />
              Somente comissionados
            </label>
          </div>
        </div>
      </section>

      {loading && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-8 text-center text-sm text-zinc-500">
          Carregando status, serviços e regras de comissão...
        </div>
      )}

      {/* SEÇÃO 1: TODOS OS STATUS MAPEADOS (ETAPAS DO FLUXO + EVENTOS) */}
      {!loading && (viewMode === 'all' || viewMode === 'stages') && (
        <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Layers size={18} className="text-[#0d6e5a]" />
              <div>
                <h2 className="text-base font-bold text-zinc-900">1. Status Mapeados no Fluxo do Pet Shop</h2>
                <p className="text-xs text-zinc-500">
                  Cada etapa com <strong>rastreamento ativo</strong> registra quem executou e aplica a comissão conforme a hierarquia:
                  Profissional + Serviço + Porte &gt; Profissional &gt; Serviço &gt; Porte &gt; Regra da Etapa.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-zinc-100">
            {filteredStages.map((stage, idx) => {
              const stageRules = rules.filter(r => r.stageKey === stage.key);
              const generalRule = stageRules.find(
                r => !r.serviceId && !r.operatorId && (!r.size || r.size === 'all'),
              );
              const exceptionRules = stageRules.filter(r => r !== generalRule);
              const servicesUsingStage = activeServicesList.filter(svc =>
                getServiceStageKeys(svc, stages).includes(stage.key),
              );
              const isCheckIn = stage.key === 'checked_in';
              const isEditingThisStage = inlineDraft?.id === `stage:${stage.key}`;

              return (
                <div key={stage.key} className="p-4 sm:px-5 transition hover:bg-zinc-50/40">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    {/* Identificação do Status */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-zinc-100 px-1.5 text-[11px] font-bold text-zinc-600">
                          {idx + 1}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${stagePillClass(stage.color)}`}
                        >
                          {stage.label}
                        </span>
                        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">
                          {stage.key}
                        </code>
                        {stage.isSystem && (
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                            Sistema
                          </span>
                        )}
                        {stage.isCustom && (
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Personalizada
                          </span>
                        )}
                      </div>

                      {stage.description && (
                        <p className="text-xs text-zinc-500">{stage.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-zinc-500">
                        <span className="font-medium text-zinc-600">Serviços neste status:</span>
                        {servicesUsingStage.length ? (
                          servicesUsingStage.slice(0, 6).map(svc => (
                            <span
                              key={svc.id}
                              className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700"
                            >
                              {svc.name}
                            </span>
                          ))
                        ) : (
                          <span>Nenhum serviço ativo usa esta etapa</span>
                        )}
                        {servicesUsingStage.length > 6 && (
                          <span className="text-zinc-400">+{servicesUsingStage.length - 6} outros</span>
                        )}
                      </div>
                    </div>

                    {/* Rastreamento + Regra Geral + Botões */}
                    <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                      {isCheckIn ? (
                        <span className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
                          <Lock size={13} /> Entrada (não comissionável)
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleStageTracking(stage.key, !stage.trackProfessional)}
                          title="Clique para ativar ou desativar o rastreamento de profissional nesta etapa"
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            stage.trackProfessional
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          {stage.trackProfessional ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          {stage.trackProfessional ? 'Rastreamento ativo' : 'Sem rastreamento'}
                        </button>
                      )}

                      {!isCheckIn && (
                        <>
                          <div className="min-w-[150px] rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-3 py-1.5 text-xs">
                            <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              Padrão da etapa
                            </span>
                            <span
                              className={`font-bold ${
                                isPositiveRule(generalRule) ? 'text-[#0d6e5a]' : 'text-zinc-700'
                              }`}
                            >
                              {generalRule
                                ? formatRuleValue(generalRule.kind, generalRule.value)
                                : stage.trackProfessional
                                ? 'Sem comissão (0%)'
                                : 'Inativo'}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              isEditingThisStage
                                ? setInlineDraft(null)
                                : startInlineEdit(
                                    `stage:${stage.key}`,
                                    stage.key,
                                    null,
                                    null,
                                    'all',
                                    generalRule,
                                    'PERCENT',
                                  )
                            }
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#0d6e5a]/30 bg-white px-3 py-2 text-xs font-semibold text-[#0d6e5a] transition hover:bg-teal-50/60"
                          >
                            <Edit3 size={13} />
                            {isEditingThisStage ? 'Fechar' : 'Editar padrão'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openNewRuleModal({ stageKey: stage.key })}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                          >
                            <Plus size={13} /> Exceção
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Painel Inline de Edição da Etapa */}
                  {isEditingThisStage && inlineDraft && (
                    <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3.5">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-zinc-700">
                            Tipo de Comissão Padrão ({stage.label})
                          </label>
                          <select
                            value={inlineDraft.kind}
                            onChange={e =>
                              setInlineDraft({
                                ...inlineDraft,
                                kind: e.target.value as 'NONE' | 'PERCENT' | 'FIXED',
                                value: e.target.value === 'NONE' ? '0' : inlineDraft.value,
                              })
                            }
                            className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800 outline-none focus:border-[#0d6e5a]"
                          >
                            <option value="NONE">Sem comissão</option>
                            <option value="PERCENT">Percentual (%)</option>
                            <option value="FIXED">Valor fixo (R$)</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-zinc-700">
                            {inlineDraft.kind === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={inlineDraft.kind === 'PERCENT' ? 100 : undefined}
                            step="0.01"
                            disabled={inlineDraft.kind === 'NONE'}
                            value={inlineDraft.value}
                            onChange={e => setInlineDraft({ ...inlineDraft, value: e.target.value })}
                            className="h-9 w-32 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100 disabled:opacity-60"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void persistRule(inlineDraft)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-[#0d6e5a] px-3.5 text-xs font-semibold text-white transition hover:bg-[#0b5c4b] disabled:opacity-50"
                        >
                          <Check size={14} /> Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineDraft(null)}
                          className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                        >
                          Cancelar
                        </button>

                        {!stage.trackProfessional && (
                          <span className="text-[11px] text-teal-800">
                            Ao salvar, o rastreamento de profissional será ativado nesta etapa.
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Exceções já cadastradas nesta etapa (Serviço / Porte / Profissional) */}
                  {exceptionRules.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2.5">
                      <span className="text-[11px] font-semibold text-zinc-500">
                        Exceções nesta etapa ({exceptionRules.length}):
                      </span>
                      {exceptionRules.map(ex => (
                        <div
                          key={ex.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs shadow-2xs"
                        >
                          <span className="font-medium text-zinc-700">
                            {serviceName(ex.serviceId)} · {SIZE_LABEL_MAP[ex.size || 'all'] || 'Todos'} ·{' '}
                            {operatorName(ex.operatorId)}
                          </span>
                          <span className="font-bold text-[#0d6e5a]">{formatRuleValue(ex.kind, ex.value)}</span>
                          <button
                            type="button"
                            title="Editar esta regra"
                            onClick={() => {
                              setViewMode('rules');
                              startInlineEdit(
                                `rule:${ex.id}`,
                                ex.stageKey,
                                ex.serviceId,
                                ex.operatorId,
                                ex.size || 'all',
                                ex,
                              );
                            }}
                            className="cursor-pointer rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-[#0d6e5a]"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            title="Remover exceção"
                            disabled={busy}
                            onClick={() => void deleteRule(ex)}
                            className="cursor-pointer rounded p-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Card especial de Status/Eventos Operacionais (Serviço Extra Adicionado + Entrega/Estorno) */}
            {(!normSearch ||
              'servico extra adicionado adicional delivered entregue estorno'.includes(normSearch)) && (
              <div className="bg-zinc-50/50 p-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        <Sparkles size={12} /> Serviço Extra Adicionado (service_added)
                      </span>
                      <span className="text-xs font-medium text-zinc-600">
                        {addonRules.length} serviço(s) com bônus fixo por inclusão na comanda
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Quando um colaborador inclui um serviço extra durante o atendimento e o status avança para{' '}
                      <strong>Entregue (delivered)</strong>, o bônus fixo configurado no serviço é creditado automaticamente.
                      Status <strong>Cancelado</strong> ou <strong>Não compareceu</strong> estornam comissões em aberto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openNewRuleModal({ stageKey: 'service_added', kind: 'FIXED' })}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
                  >
                    <Plus size={13} /> Configurar bônus de extra
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SEÇÃO 2: TODOS OS SERVIÇOS MAPEADOS & COMISSÃO POR ETAPA */}
      {!loading && (viewMode === 'all' || viewMode === 'services') && (
        <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Scissors size={18} className="text-[#0d6e5a]" />
              <div>
                <h2 className="text-base font-bold text-zinc-900">2. Serviços Mapeados & Comissões por Etapa</h2>
                <p className="text-xs text-zinc-500">
                  Veja o que cada serviço paga em cada etapa do fluxo, além das exceções por porte (Mini, P, M, G, GG),
                  profissional e inclusão como serviço extra.
                </p>
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
              <input
                type="checkbox"
                checked={showInactiveServices}
                onChange={e => setShowInactiveServices(e.target.checked)}
                className="h-3.5 w-3.5 accent-[#0d6e5a]"
              />
              Mostrar serviços inativos
            </label>
          </div>

          <div className="divide-y divide-zinc-100">
            {filteredServices.map(svc => {
              const svcStageKeys = getServiceStageKeys(svc, stages);
              const trackableServiceStages = svcStageKeys
                .map(key => stages.find(s => s.key === key) || { key, label: resolveStageLabel(key, stages), trackProfessional: false })
                .filter(s => s.key !== 'checked_in');
              const svcSpecificRules = rules.filter(
                r => r.serviceId === svc.id && r.stageKey !== 'service_added',
              );
              const addonRule = addonRules.find(r => r.serviceId === svc.id);
              const isEditingAddon = inlineDraft?.id === `svc-addon:${svc.id}`;

              return (
                <div key={svc.id} className="p-4 sm:px-5">
                  {/* Cabeçalho do Serviço */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900">{svc.name}</span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                          svc.serviceType === 'COMBO'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-teal-50 text-[#0d6e5a]'
                        }`}
                      >
                        {svc.serviceType === 'COMBO' ? 'Combo' : 'Individual'}
                      </span>
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                        {svc.category}
                      </span>
                      {!svc.active && (
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          Inativo
                        </span>
                      )}
                      <span className="text-xs font-semibold text-zinc-600">
                        {svc.priceRange?.formattedRange || formatCommissionBrl(svc.price)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {svc.serviceType === 'INDIVIDUAL' && (
                        <button
                          type="button"
                          onClick={() => openNewRuleModal({ serviceId: svc.id })}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                        >
                          <Plus size={13} /> Porte / Profissional
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Aviso de combo */}
                  {svc.serviceType === 'COMBO' && (
                    <div className="mt-2.5 rounded-xl border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-purple-900">
                      <strong>Combo:</strong> O valor total é distribuído proporcionalmente entre os serviços componentes (
                      {svc.comboItems?.map(ci => ci.componentService?.name).filter(Boolean).join(' + ') || 'itens do combo'}
                      ), aplicando a comissão de cada serviço componente em suas respectivas etapas.
                    </div>
                  )}

                  {/* Etapas do serviço com comissão efetiva e botão Editar inline */}
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {trackableServiceStages.map(st => {
                      const directServiceRule = rules.find(
                        r =>
                          r.stageKey === st.key &&
                          r.serviceId === svc.id &&
                          !r.operatorId &&
                          (!r.size || r.size === 'all'),
                      );
                      const effective = resolveEffectiveRule(rules, st.key, svc.id, null, 'all');
                      const isDirect = Boolean(directServiceRule);
                      const inlineId = `svc-stage:${svc.id}:${st.key}`;
                      const isEditingCell = inlineDraft?.id === inlineId;

                      return (
                        <div
                          key={`${svc.id}-${st.key}`}
                          className={`rounded-xl border p-3 transition ${
                            isDirect
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-zinc-200/80 bg-zinc-50/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${stagePillClass(
                                  (st as PetshopStageItem).color,
                                )}`}
                              >
                                {st.label}
                              </span>
                              <div className="mt-1.5 text-sm font-bold text-zinc-900">
                                {!st.trackProfessional ? (
                                  <span className="text-xs font-medium text-zinc-400">Etapa sem rastreamento</span>
                                ) : effective ? (
                                  formatRuleValue(effective.kind, effective.value)
                                ) : (
                                  <span className="text-xs font-medium text-zinc-500">Sem comissão (0%)</span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                {!st.trackProfessional
                                  ? 'Ative ao editar para comissionar'
                                  : isDirect
                                  ? 'Regra específica deste serviço'
                                  : effective
                                  ? 'Herdada do padrão da etapa'
                                  : 'Nenhuma regra configurada'}
                              </div>
                            </div>

                            {svc.serviceType === 'INDIVIDUAL' && (
                              <button
                                type="button"
                                title="Editar comissão deste serviço nesta etapa"
                                onClick={() =>
                                  isEditingCell
                                    ? setInlineDraft(null)
                                    : startInlineEdit(
                                        inlineId,
                                        st.key,
                                        svc.id,
                                        null,
                                        'all',
                                        directServiceRule || effective,
                                        'PERCENT',
                                      )
                                }
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#0d6e5a] transition hover:bg-teal-50"
                              >
                                <Edit3 size={11} />
                                {isEditingCell ? 'Fechar' : 'Editar'}
                              </button>
                            )}
                          </div>

                          {isEditingCell && inlineDraft && (
                            <div className="mt-2.5 space-y-2 border-t border-zinc-200/80 pt-2.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                <select
                                  value={inlineDraft.kind}
                                  onChange={e =>
                                    setInlineDraft({
                                      ...inlineDraft,
                                      kind: e.target.value as 'NONE' | 'PERCENT' | 'FIXED',
                                      value: e.target.value === 'NONE' ? '0' : inlineDraft.value,
                                    })
                                  }
                                  className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a]"
                                >
                                  <option value="NONE">Sem comissão</option>
                                  <option value="PERCENT">%</option>
                                  <option value="FIXED">R$</option>
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  max={inlineDraft.kind === 'PERCENT' ? 100 : undefined}
                                  step="0.01"
                                  disabled={inlineDraft.kind === 'NONE'}
                                  value={inlineDraft.value}
                                  onChange={e => setInlineDraft({ ...inlineDraft, value: e.target.value })}
                                  className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void persistRule(inlineDraft)}
                                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-[#0d6e5a] px-2.5 text-[11px] font-semibold text-white hover:bg-[#0b5c4b] disabled:opacity-50"
                                >
                                  <Check size={12} /> Salvar
                                </button>
                                {directServiceRule && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void deleteRule(directServiceRule)}
                                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                                    title="Remover regra própria para voltar a herdar o padrão da etapa"
                                  >
                                    Herdar padrão
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Bônus por inclusão como extra no atendimento (INDIVIDUAL) */}
                    {svc.serviceType === 'INDIVIDUAL' && (
                      <div
                        className={`rounded-xl border p-3 ${
                          addonRule ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200/80 bg-zinc-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              Extra no atendimento
                            </span>
                            <div className="mt-1.5 text-sm font-bold text-zinc-900">
                              {addonRule ? (
                                formatCommissionBrl(addonRule.value)
                              ) : (
                                <span className="text-xs font-medium text-zinc-500">Sem bônus de adição</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              Fixo ao adicionar durante o atendimento
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              isEditingAddon
                                ? setInlineDraft(null)
                                : startInlineEdit(
                                    `svc-addon:${svc.id}`,
                                    'service_added',
                                    svc.id,
                                    null,
                                    'all',
                                    addonRule || { kind: 'FIXED', value: String(svc.commissionAmount || 0) },
                                    'FIXED',
                                  )
                            }
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-50"
                          >
                            <Edit3 size={11} /> {isEditingAddon ? 'Fechar' : 'Editar'}
                          </button>
                        </div>

                        {isEditingAddon && inlineDraft && (
                          <div className="mt-2.5 space-y-2 border-t border-amber-200/60 pt-2.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={inlineDraft.kind}
                                onChange={e =>
                                  setInlineDraft({
                                    ...inlineDraft,
                                    kind: e.target.value as 'NONE' | 'FIXED',
                                    value: e.target.value === 'NONE' ? '0' : inlineDraft.value,
                                  })
                                }
                                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-800 outline-none focus:border-[#0d6e5a]"
                              >
                                <option value="FIXED">Valor fixo (R$)</option>
                                <option value="NONE">Desativar</option>
                              </select>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={inlineDraft.kind === 'NONE'}
                                value={inlineDraft.value}
                                onChange={e => setInlineDraft({ ...inlineDraft, value: e.target.value })}
                                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void persistRule(inlineDraft)}
                              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-[#0d6e5a] px-2.5 text-[11px] font-semibold text-white hover:bg-[#0b5c4b] disabled:opacity-50"
                            >
                              <Check size={12} /> Salvar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Exceções por Porte / Profissional deste Serviço */}
                  {svcSpecificRules.filter(r => r.operatorId || (r.size && r.size !== 'all')).length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-2.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                        <PawPrint size={12} /> Regras por Porte / Profissional:
                      </span>
                      {svcSpecificRules
                        .filter(r => r.operatorId || (r.size && r.size !== 'all'))
                        .map(r => (
                          <span
                            key={r.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 shadow-2xs"
                          >
                            <span className="font-medium text-zinc-700">
                              {resolveStageLabel(r.stageKey, stages)} · {SIZE_LABEL_MAP[r.size || 'all']} ·{' '}
                              {operatorName(r.operatorId)}
                            </span>
                            <strong className="text-[#0d6e5a]">{formatRuleValue(r.kind, r.value)}</strong>
                            <button
                              type="button"
                              onClick={() => {
                                setViewMode('rules');
                                startInlineEdit(
                                  `rule:${r.id}`,
                                  r.stageKey,
                                  r.serviceId,
                                  r.operatorId,
                                  r.size || 'all',
                                  r,
                                );
                              }}
                              className="cursor-pointer rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-[#0d6e5a]"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteRule(r)}
                              className="cursor-pointer rounded p-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}

            {!filteredServices.length && (
              <p className="p-6 text-center text-xs text-zinc-500">
                Nenhum serviço encontrado para os filtros aplicados.
              </p>
            )}
          </div>
        </section>
      )}

      {/* SEÇÃO 3: TABELA COMPLETA DE REGRAS ATIVAS (EDIÇÃO INLINE & REMOÇÃO) */}
      {!loading && (viewMode === 'all' || viewMode === 'rules') && (
        <section className="rounded-2xl border border-zinc-200/80 bg-white shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Settings2 size={18} className="text-[#0d6e5a]" />
              <div>
                <h2 className="text-base font-bold text-zinc-900">3. Todas as Regras Ativas Cadastradas</h2>
                <p className="text-xs text-zinc-500">
                  Edite valores diretamente na linha ou remova exceções específicas sem perder o histórico auditável.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openNewRuleModal()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b5c4b]"
            >
              <Plus size={14} /> Nova Regra
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Status / Etapa</th>
                  <th className="px-4 py-3">Serviço</th>
                  <th className="px-4 py-3">Porte do Pet</th>
                  <th className="px-4 py-3">Profissional</th>
                  <th className="px-4 py-3">Nível</th>
                  <th className="px-4 py-3">Comissão</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sortedFilteredRules.map(r => {
                  const st = stages.find(s => s.key === r.stageKey);
                  const isEditingRow = inlineDraft?.id === `rule:${r.id}`;
                  return (
                    <tr key={r.id} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                              r.stageKey === 'service_added'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : stagePillClass(st?.color)
                            }`}
                          >
                            {resolveStageLabel(r.stageKey, stages)}
                          </span>
                          {st && !st.trackProfessional && (
                            <span
                              title="Etapa atualmente sem rastreamento ativo"
                              className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                            >
                              Inativa
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-800">{serviceName(r.serviceId)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                          {SIZE_LABEL_MAP[r.size || 'all'] || 'Todos os portes'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{operatorName(r.operatorId)}</td>
                      <td className="px-4 py-3 text-zinc-500">{rulePrecedenceLabel(r)}</td>
                      <td className="px-4 py-3">
                        {isEditingRow && inlineDraft ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={inlineDraft.kind}
                              onChange={e =>
                                setInlineDraft({
                                  ...inlineDraft,
                                  kind: e.target.value as 'NONE' | 'PERCENT' | 'FIXED',
                                  value: e.target.value === 'NONE' ? '0' : inlineDraft.value,
                                })
                              }
                              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-[#0d6e5a]"
                            >
                              {r.stageKey !== 'service_added' && <option value="PERCENT">%</option>}
                              <option value="FIXED">R$</option>
                              <option value="NONE">Sem comissão</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              max={inlineDraft.kind === 'PERCENT' ? 100 : undefined}
                              step="0.01"
                              disabled={inlineDraft.kind === 'NONE'}
                              value={inlineDraft.value}
                              onChange={e => setInlineDraft({ ...inlineDraft, value: e.target.value })}
                              className="h-8 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100"
                            />
                          </div>
                        ) : (
                          <span
                            className={`font-bold ${
                              isPositiveRule(r) ? 'text-[#0d6e5a]' : 'text-zinc-500'
                            }`}
                          >
                            {formatRuleValue(r.kind, r.value)}{' '}
                            <span className="font-normal text-zinc-400">· v{r.version}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditingRow && inlineDraft ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void persistRule(inlineDraft)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#0d6e5a] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0b5c4b] disabled:opacity-50"
                            >
                              <Check size={12} /> Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineDraft(null)}
                              className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                startInlineEdit(
                                  `rule:${r.id}`,
                                  r.stageKey,
                                  r.serviceId,
                                  r.operatorId,
                                  r.size || 'all',
                                  r,
                                  r.stageKey === 'service_added' ? 'FIXED' : 'PERCENT',
                                )
                              }
                              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-[#0d6e5a] hover:underline"
                            >
                              <Edit3 size={12} /> Editar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteRule(r)}
                              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-rose-600 hover:underline disabled:opacity-50"
                            >
                              <Trash2 size={12} /> Remover
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!sortedFilteredRules.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-500">
                      Nenhuma regra ativa cadastrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL PARA CRIAR / EDITAR REGRA PERSONALIZADA */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-[#0d6e5a]" />
                <h3 className="text-sm font-bold text-zinc-900">Configurar Regra de Comissão</h3>
              </div>
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-700">Status / Etapa *</label>
                <select
                  value={modalForm.stageKey}
                  onChange={e => {
                    const nextKey = e.target.value;
                    const isAddon = nextKey === 'service_added';
                    setModalForm(prev => ({
                      ...prev,
                      stageKey: nextKey,
                      operatorId: isAddon ? '' : prev.operatorId,
                      size: isAddon ? 'all' : prev.size,
                      kind: isAddon && prev.kind === 'PERCENT' ? 'FIXED' : prev.kind,
                    }));
                  }}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#0d6e5a]"
                >
                  <option value="">Selecione a etapa</option>
                  {stages
                    .filter(s => s.key !== 'checked_in')
                    .map(s => (
                      <option key={s.key} value={s.key}>
                        {s.label} {s.trackProfessional ? '' : '(ativará rastreamento automaticamente)'}
                      </option>
                    ))}
                  <option value="service_added">Serviço Extra Adicionado no Atendimento (Bônus fixo R$)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-700">
                    Serviço {modalForm.stageKey === 'service_added' ? '*' : '(Opcional)'}
                  </label>
                  <select
                    value={modalForm.serviceId}
                    onChange={e => setModalForm({ ...modalForm, serviceId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#0d6e5a]"
                  >
                    <option value="">
                      {modalForm.stageKey === 'service_added' ? 'Selecione um serviço' : 'Todos os serviços'}
                    </option>
                    {services
                      .filter(s => s.active && (modalForm.stageKey !== 'service_added' || s.serviceType === 'INDIVIDUAL'))
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-700">Porte do Pet</label>
                  <select
                    disabled={modalForm.stageKey === 'service_added'}
                    value={modalForm.size}
                    onChange={e => setModalForm({ ...modalForm, size: e.target.value })}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100 disabled:opacity-60"
                  >
                    {PET_SIZE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-700">Profissional</label>
                  <select
                    disabled={modalForm.stageKey === 'service_added'}
                    value={modalForm.operatorId}
                    onChange={e => setModalForm({ ...modalForm, operatorId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100 disabled:opacity-60"
                  >
                    <option value="">Todos</option>
                    {operators.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-700">Tipo *</label>
                  <select
                    value={modalForm.kind}
                    onChange={e =>
                      setModalForm({
                        ...modalForm,
                        kind: e.target.value as 'NONE' | 'PERCENT' | 'FIXED',
                        value: e.target.value === 'NONE' ? '0' : modalForm.value,
                      })
                    }
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#0d6e5a]"
                  >
                    {modalForm.stageKey !== 'service_added' && <option value="PERCENT">Percentual (%)</option>}
                    <option value="FIXED">Valor fixo (R$)</option>
                    <option value="NONE">Sem comissão</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-700">
                    {modalForm.kind === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={modalForm.kind === 'PERCENT' ? 100 : undefined}
                    step="0.01"
                    disabled={modalForm.kind === 'NONE'}
                    value={modalForm.value}
                    onChange={e => setModalForm({ ...modalForm, value: e.target.value })}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#0d6e5a] disabled:bg-zinc-100"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                Se já existir uma regra ativa exatamente para esta combinação (Etapa + Serviço + Porte + Profissional),
                ela será atualizada para uma nova versão preservando o histórico anterior.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void persistRule({
                    stageKey: modalForm.stageKey,
                    serviceId: modalForm.serviceId || null,
                    operatorId: modalForm.operatorId || null,
                    size: modalForm.size || 'all',
                    kind: modalForm.kind,
                    value: modalForm.value,
                  })
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#0d6e5a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0b5c4b] disabled:opacity-50"
              >
                <Check size={14} /> Salvar Regra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Etapas da Loja reutilizado */}
      <ManageStoreStagesModal
        isOpen={stagesModalOpen}
        onClose={() => setStagesModalOpen(false)}
        onUpdated={() => {
          void loadData();
        }}
      />
    </div>
  );
}
