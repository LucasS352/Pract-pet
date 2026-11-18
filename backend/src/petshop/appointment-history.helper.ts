import { DEFAULT_STAGE_DEFINITIONS, PetshopPricingService } from './petshop-pricing.service';

export const STAGE_LABELS_PT: Record<string, string> = {
  requested: 'Solicitado',
  scheduled: 'Agendado',
  checked_in: 'Check-in',
  bathing: 'Banho',
  grooming: 'Tosa',
  finishing: 'Finalização',
  ready: 'Pronto',
  delivered: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

const IN_CARE_OR_DONE_STATUSES = new Set([
  'checked_in',
  'bathing',
  'grooming',
  'finishing',
  'ready',
  'delivered',
]);

export function stageKeyOf(stage: any): string {
  return typeof stage === 'string' ? stage : String(stage?.key || '');
}

export function stageLabelOf(stage: any, resolvedStages: any[] = []): string {
  if (typeof stage === 'object' && stage !== null && stage.label) {
    return String(stage.label);
  }
  const key = stageKeyOf(stage);
  const matched = resolvedStages.find(s => stageKeyOf(s) === key);
  if (matched && typeof matched === 'object' && matched.label) {
    return String(matched.label);
  }
  const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
  if (def?.label) return def.label;
  return STAGE_LABELS_PT[key] || (key.startsWith('custom_') ? key.replace(/^custom_/, '') : key);
}

export function resolveChosenServicesStages(services: any[], pricing?: PetshopPricingService): any[] {
  if (!Array.isArray(services) || services.length === 0) {
    return ['checked_in', 'bathing', 'finishing', 'ready'];
  }
  if (!pricing) {
    const customLists = services
      .map(s => (Array.isArray(s?.customStages) && s.customStages.length > 0 ? s.customStages : null))
      .filter((l): l is any[] => Boolean(l));
    if (customLists.length > 0) {
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const list of customLists) {
        for (const item of list) {
          const k = stageKeyOf(item);
          if (k && !seen.has(k)) {
            seen.add(k);
            merged.push(item);
          }
        }
      }
      if (merged.length > 0) return merged;
    }
    const hasTosa = services.some(s => String(s?.name || s?.nameSnapshot || '').toLowerCase().includes('tosa'));
    return hasTosa
      ? ['checked_in', 'bathing', 'grooming', 'finishing', 'ready']
      : ['checked_in', 'bathing', 'finishing', 'ready'];
  }
  const stagesLists: any[][] = [];
  for (const service of services) {
    const custom = service?.customStages;
    if (Array.isArray(custom) && custom.length > 0) {
      try {
        stagesLists.push(pricing.validateStages(custom));
        continue;
      } catch {}
    }
    stagesLists.push(pricing.suggestStages(service?.name || service?.nameSnapshot, service?.category));
  }
  return pricing.consolidateStages(stagesLists);
}

export function buildPastSessionStageHistory(params: {
  resolvedStages: any[];
  startsAt: Date;
  endsAt: Date;
  stageOperators?: Record<string, string> | null;
  operatorMap: Map<string, { id: string; name: string }>;
  fallbackOperatorId?: string | null;
  actor?: { userId?: string | null; operatorId?: string | null; name?: string | null } | null;
  notes?: string | null;
}) {
  const { resolvedStages, startsAt, endsAt, stageOperators, operatorMap, fallbackOperatorId, actor, notes } = params;
  const stageKeys = (resolvedStages.length ? resolvedStages : ['checked_in', 'bathing', 'finishing', 'ready'])
    .map(stageKeyOf)
    .filter(Boolean);

  const actorUserId = actor?.operatorId || actor?.userId || null;
  const actorName = actor?.name || null;

  const hasStageOpsObject = Boolean(stageOperators && typeof stageOperators === 'object');
  const fallbackOp = fallbackOperatorId ? operatorMap.get(fallbackOperatorId) || null : null;

  const primaryOpFromMap = (() => {
    if (hasStageOpsObject) {
      for (const preferredKey of ['bathing', 'grooming', 'finishing']) {
        const opId = stageOperators?.[preferredKey];
        if (opId && opId !== 'none' && operatorMap.has(String(opId))) {
          return operatorMap.get(String(opId))!;
        }
      }
      for (const opId of Object.values(stageOperators || {})) {
        if (opId && opId !== 'none' && operatorMap.has(String(opId))) {
          return operatorMap.get(String(opId))!;
        }
      }
    }
    return fallbackOp;
  })();

  const totalMs = Math.max(60_000, endsAt.getTime() - startsAt.getTime());
  const divisor = Math.max(1, stageKeys.length - 1);

  const entries: Array<Record<string, any>> = stageKeys.map((key, idx) => {
    const at = new Date(startsAt.getTime() + Math.round((totalMs * idx) / divisor));
    let op: { id: string; name: string } | null = null;

    if (key !== 'checked_in' && key !== 'ready') {
      const assignedId = hasStageOpsObject ? stageOperators?.[key] : undefined;
      if (assignedId && assignedId !== 'none') {
        op = operatorMap.get(String(assignedId)) || null;
      } else if (!hasStageOpsObject && fallbackOp) {
        op = fallbackOp;
      }
    } else if (primaryOpFromMap && !actorName) {
      op = primaryOpFromMap;
    }

    return {
      status: key,
      label: stageLabelOf(key, resolvedStages),
      at: at.toISOString(),
      photoUrl: null,
      notes: null,
      userId: op?.id || actorUserId,
      userName: op?.name || actorName,
      skipped: false,
    };
  });

  entries.push({
    status: 'delivered',
    label: 'Concluído',
    at: endsAt.toISOString(),
    photoUrl: null,
    notes: notes || null,
    userId: actorUserId || primaryOpFromMap?.id || null,
    userName: actorName || primaryOpFromMap?.name || null,
    skipped: false,
  });

  return entries;
}

export function resolvePrimaryStageOperatorId(
  explicitProfessionalId?: string | null,
  stageOperators?: Record<string, string> | null,
): string | null {
  if (explicitProfessionalId && explicitProfessionalId !== 'none') {
    return String(explicitProfessionalId);
  }
  if (!stageOperators || typeof stageOperators !== 'object') return null;
  for (const preferredKey of ['bathing', 'grooming', 'finishing']) {
    const opId = stageOperators[preferredKey];
    if (opId && opId !== 'none') return String(opId);
  }
  for (const opId of Object.values(stageOperators)) {
    if (opId && opId !== 'none') return String(opId);
  }
  return null;
}

export function enrichAppointmentHistory<T extends Record<string, any>>(
  apt: T,
  pricing?: PetshopPricingService,
): T {
  if (!apt || typeof apt !== 'object') return apt;

  const hasInternalRelations = 'commissions' in apt || 'packageLedgerEvents' in apt;
  const commissions: any[] = Array.isArray(apt.commissions) ? apt.commissions : [];
  const ledgerEvents: any[] = Array.isArray(apt.packageLedgerEvents) ? apt.packageLedgerEvents : [];
  const existingHistory: any[] = Array.isArray(apt.stageHistory) ? apt.stageHistory : [];

  const isInCareOrDone = IN_CARE_OR_DONE_STATUSES.has(String(apt.status || ''));
  const hasStageExecutionsInHistory = existingHistory.some(
    h => h && !h.skipped && ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'].includes(String(h.status || '')),
  );
  const needsHistoryReconstruction =
    isInCareOrDone &&
    (existingHistory.length === 0 ||
      (apt.status === 'delivered' && !hasStageExecutionsInHistory && commissions.length > 0));
  const needsProfessionalFallback = !apt.professional && commissions.length > 0 && Boolean(commissions[0]?.operator);

  if (!needsHistoryReconstruction && !needsProfessionalFallback) {
    if (!hasInternalRelations) return apt;
    const { commissions: _c, packageLedgerEvents: _l, ...clean } = apt;
    return clean as T;
  }

  let nextHistory = existingHistory;
  if (needsHistoryReconstruction) {
    const resolvedStages = pricing?.resolveAppointmentStages
      ? pricing.resolveAppointmentStages(apt)
      : resolveChosenServicesStages(
          (Array.isArray(apt.services) ? apt.services : []).map(s => s?.service || { name: s?.nameSnapshot }),
        );
    const stageKeys = (Array.isArray(resolvedStages) && resolvedStages.length ? resolvedStages : ['checked_in', 'bathing', 'finishing', 'ready'])
      .map(stageKeyOf)
      .filter(Boolean);

    const commissionByStage = new Map<string, { operatorId?: string | null; operatorName?: string | null; at?: Date }>();
    for (const c of commissions) {
      if (c?.stageKey && !commissionByStage.has(String(c.stageKey))) {
        commissionByStage.set(String(c.stageKey), {
          operatorId: c.operator?.id || c.operatorId || null,
          operatorName: c.operator?.name || null,
          at: c.executedAt ? new Date(c.executedAt) : undefined,
        });
      }
    }

    const consumeLedger = [...ledgerEvents].reverse().find(e => e?.eventType === 'CONSUME');
    const fallbackOperatorId = apt.professional?.id || apt.professionalId || commissions[0]?.operator?.id || consumeLedger?.operatorId || null;
    const fallbackOperatorName = apt.professional?.name || commissions[0]?.operator?.name || consumeLedger?.operatorName || null;

    const startsAt = apt.checkedInAt ? new Date(apt.checkedInAt) : apt.startsAt ? new Date(apt.startsAt) : new Date();
    const endsAt = apt.completedAt
      ? new Date(apt.completedAt)
      : apt.readyAt
        ? new Date(apt.readyAt)
        : apt.endsAt
          ? new Date(apt.endsAt)
          : new Date(startsAt.getTime() + 60 * 60_000);
    const totalMs = Math.max(60_000, endsAt.getTime() - startsAt.getTime());
    const currentIdx = stageKeys.indexOf(String(apt.status));
    const maxStageIdx = apt.status === 'delivered' ? stageKeys.length - 1 : currentIdx;

    const reconstructed: any[] = [];
    const divisor = Math.max(1, stageKeys.length - 1);

    stageKeys.forEach((key, idx) => {
      if (maxStageIdx !== -1 && idx > maxStageIdx) return;
      const comm = commissionByStage.get(key);
      let at = new Date(startsAt.getTime() + Math.round((totalMs * idx) / divisor));
      if (key === 'checked_in' && apt.checkedInAt) at = new Date(apt.checkedInAt);
      if (key === 'ready' && apt.readyAt) at = new Date(apt.readyAt);
      if (comm?.at && !Number.isNaN(comm.at.getTime()) && key !== 'checked_in' && key !== 'ready') {
        // Preserva o horário calculado quando executedAt for exatamente startsAt (comissão retroativa em lote)
        if (comm.at.getTime() !== startsAt.getTime()) at = comm.at;
      }

      const useOpName = comm?.operatorName || (apt.status === 'delivered' ? fallbackOperatorName : null);
      const useOpId = comm?.operatorId || (apt.status === 'delivered' ? fallbackOperatorId : null);

      reconstructed.push({
        status: key,
        label: stageLabelOf(key, resolvedStages),
        at: at.toISOString(),
        photoUrl: null,
        notes: null,
        userId: useOpId,
        userName: useOpName,
        skipped: false,
      });
    });

    // Também inclui comissões de etapas extras (ex.: grooming registrado quando customStages não listava grooming)
    for (const [stgKey, comm] of commissionByStage.entries()) {
      if (!stageKeys.includes(stgKey) && stgKey !== 'service_added') {
        reconstructed.push({
          status: stgKey,
          label: stageLabelOf(stgKey, resolvedStages),
          at: (comm.at || startsAt).toISOString(),
          photoUrl: null,
          notes: null,
          userId: comm.operatorId || null,
          userName: comm.operatorName || null,
          skipped: false,
        });
      }
    }

    if (apt.status === 'delivered') {
      const existingDelivered = existingHistory.find(h => h?.status === 'delivered');
      reconstructed.push(
        existingDelivered || {
          status: 'delivered',
          label: 'Concluído',
          at: endsAt.toISOString(),
          photoUrl: apt.stagePhotoUrl || null,
          notes: apt.stageNotes || (consumeLedger ? 'Sessão concluída do pacote' : null),
          userId: consumeLedger?.operatorId || fallbackOperatorId,
          userName: consumeLedger?.operatorName || fallbackOperatorName,
          skipped: false,
        },
      );
    }

    // Preserva entradas não-duplicadas anteriores (ex: service_added, reagendamento, prepayment)
    const nonStageEntries = existingHistory.filter(
      h => h && (h.kind === 'service_added' || h.kind === 'prepayment' || h.kind === 'additional_charge' || h.kind === 'additional_charge_reversed' || h.rescheduledFrom || h.status === 'scheduled'),
    );
    nextHistory = [...nonStageEntries, ...reconstructed];
  }

  const nextProfessional = apt.professional || (needsProfessionalFallback
    ? { id: commissions[0].operator.id, name: commissions[0].operator.name }
    : apt.professional);

  const { commissions: _c, packageLedgerEvents: _l, ...clean } = apt;
  return {
    ...clean,
    professional: nextProfessional,
    professionalId: clean.professionalId || nextProfessional?.id || null,
    stageHistory: nextHistory,
  } as unknown as T;
}
