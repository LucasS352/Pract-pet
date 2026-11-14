import { getStageLabel, type PetshopStageItem } from './types';

export type CommissionRule = {
  id: string;
  stageKey: string;
  serviceId: string | null;
  operatorId: string | null;
  size?: string;
  kind: string;
  value: string;
  version: number;
};

export const PET_SIZE_OPTIONS: Array<{ value: string; label: string; short: string }> = [
  { value: 'all', label: 'Todos os portes', short: 'Todos' },
  { value: 'mini', label: 'Mini', short: 'Mini' },
  { value: 'small', label: 'Pequeno (P)', short: 'P' },
  { value: 'medium', label: 'Médio (M)', short: 'M' },
  { value: 'large', label: 'Grande (G)', short: 'G' },
  { value: 'giant', label: 'Gigante (GG)', short: 'GG' },
];

export const SIZE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PET_SIZE_OPTIONS.map(opt => [opt.value, opt.label]),
);

export const formatCommissionBrl = (value: string | number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const formatRuleValue = (kind?: string | null, value?: string | number | null) => {
  if (kind === 'PERCENT') return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
  if (kind === 'FIXED') return formatCommissionBrl(value);
  return 'Sem comissão';
};

export const isPositiveRule = (rule?: Pick<CommissionRule, 'kind' | 'value'> | null) =>
  Boolean(rule && rule.kind !== 'NONE' && Number(rule.value || 0) > 0);

export const resolveStageLabel = (stageKey: string, stages: PetshopStageItem[]) => {
  if (stageKey === 'service_added') return 'Serviço Extra Adicionado';
  return stages.find(s => s.key === stageKey)?.label || getStageLabel(stageKey, stages);
};

export const ruleScopeScore = (rule: Pick<CommissionRule, 'operatorId' | 'serviceId' | 'size'>) =>
  Number(Boolean(rule.operatorId)) * 4 +
  Number(Boolean(rule.serviceId)) * 2 +
  Number(Boolean(rule.size && rule.size !== 'all')) * 1;

export const rulePrecedenceLabel = (rule: Pick<CommissionRule, 'stageKey' | 'operatorId' | 'serviceId' | 'size'>) => {
  if (rule.stageKey === 'service_added') return 'Bônus de Inclusão';
  const parts: string[] = [];
  if (rule.operatorId) parts.push('Profissional');
  if (rule.serviceId) parts.push('Serviço');
  if (rule.size && rule.size !== 'all') parts.push('Porte');
  return parts.length ? parts.join(' + ') : 'Padrão da Etapa';
};

/** Resolve a regra mais específica usando exatamente a mesma precedência do backend. */
export const resolveEffectiveRule = (
  rules: CommissionRule[],
  stageKey: string,
  serviceId?: string | null,
  operatorId?: string | null,
  petSize?: string | null,
): CommissionRule | undefined => {
  const normSize = petSize ? String(petSize).trim().toLowerCase() : 'all';
  return rules
    .filter(r => {
      if (r.stageKey !== stageKey) return false;
      const rSize = (r.size || 'all').toLowerCase();
      return (
        (!r.serviceId || r.serviceId === serviceId) &&
        (!r.operatorId || r.operatorId === operatorId) &&
        (rSize === 'all' || rSize === normSize)
      );
    })
    .sort((a, b) => ruleScopeScore(b) - ruleScopeScore(a))[0];
};
