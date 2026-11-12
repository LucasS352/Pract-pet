export type Pet = {
  id: string;
  customerId: string;
  name: string;
  species: string;
  breed?: string | null;
  sex?: string | null;
  size?: string | null;
  coatType?: string | null;
  weight?: string | number | null;
  birthDate?: string | null;
  color?: string | null;
  neutered?: boolean | null;
  microchip?: string | null;
  allergies?: string | null;
  behavior?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  active?: boolean;
  customer: Tutor;
  vaccinations?: Vaccination[];
  appointments?: Appointment[];
  petPackages?: CustomerPetPackage[];
  _count?: { appointments: number };
};

export type Tutor = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  cpfCnpj?: string | null;
  address?: string | null;
  reference?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  whatsappOptIn?: boolean;
  pets?: Pet[];
  petPackages?: CustomerPetPackage[];
};

export function parseDetailedAddress(raw?: string | null) {
  if (!raw) return { street: '', number: '', neighborhood: '', city: '' };
  const parts = raw.split(' - ');
  const main = parts[0] || '';
  let neighborhood = '';
  let city = '';
  if (parts.length >= 3) {
    neighborhood = parts[1].trim();
    city = parts.slice(2).join(' - ').trim();
  } else if (parts.length === 2) {
    const subParts = parts[1].split(',');
    if (subParts.length >= 2) {
      neighborhood = subParts[0].trim();
      city = subParts.slice(1).join(',').trim();
    } else {
      neighborhood = parts[1].trim();
    }
  }
  const commaIdx = main.lastIndexOf(',');
  if (commaIdx !== -1) {
    return {
      street: main.substring(0, commaIdx).trim(),
      number: main.substring(commaIdx + 1).trim(),
      neighborhood,
      city,
    };
  }
  return { street: main.trim(), number: '', neighborhood, city };
}

export function composeDetailedAddress(street?: string | null, number?: string | null, neighborhood?: string | null, city?: string | null) {
  const cleanStreet = (street || '').trim();
  const cleanNumber = (number || '').trim();
  const cleanNeigh = (neighborhood || '').trim();
  const cleanCity = (city || '').trim();
  const streetWithNumber = [cleanStreet, cleanNumber].filter(Boolean).join(', ');
  const base = [streetWithNumber, cleanNeigh].filter(Boolean).join(' - ');
  if (cleanCity) {
    return base ? `${base} - ${cleanCity}` : cleanCity;
  }
  return base;
}

export type Vaccination = {
  id: string;
  petId?: string;
  vaccineName: string;
  status: string;
  appliedAt?: string | null;
  nextDueAt?: string | null;
  batchNumber?: string | null;
  manufacturer?: string | null;
  clinic?: string | null;
  professional?: string | null;
  notes?: string | null;
  proofUrl?: string | null;
};

export type PetServicePricingRule = {
  id?: string;
  serviceId?: string;
  species: string; // all, dog, cat
  size: string; // all, mini, small, medium, large, giant
  coatType: string; // all, short, medium, long, double
  price: number | string;
  durationMinutes?: number | null;
  label?: string | null;
};

export type PetServiceComboItem = {
  id?: string;
  comboServiceId?: string;
  componentServiceId: string;
  componentService?: PetService;
  quantity: number;
  order?: number;
};

export type PetService = {
  id: string;
  name: string;
  description?: string | null;
  serviceType: 'INDIVIDUAL' | 'COMBO';
  category: string;
  targetSpecies: string;
  durationMinutes: number;
  price: string | number;
  color: string;
  active: boolean;
  trackAddedBy?: boolean;
  commissionOnAdd?: boolean;
  commissionAmount?: number;
  legacyCommissionPercent?: number;
  comboPricingType?: 'FIXED_PRICE' | 'PERCENT_DISCOUNT' | 'FIXED_DISCOUNT' | null;
  comboDiscountValue?: string | number | null;
  customStages?: (string | PetshopStageItem)[] | null;
  pricingRules?: PetServicePricingRule[];
  comboItems?: PetServiceComboItem[];
  priceRange?: {
    minPrice: number;
    maxPrice: number;
    minDuration: number;
    maxDuration: number;
    hasVariants: boolean;
    formattedRange: string;
  };
  _count?: { appointmentItems?: number; includedInCombos?: number };
};

export type PetshopStageKey = string;

export interface PetshopStageItem {
  key: string;
  label: string;
  description?: string;
  isCustom?: boolean;
  isSystem?: boolean;
  order?: number;
  color?: string;
  icon?: string;
  enabled?: boolean;
  trackProfessional?: boolean;
}

export interface StageDefinition {
  key: string;
  label: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  isCustom?: boolean;
  isSystem?: boolean;
  color?: string;
}

export const ALL_PETSHOP_STAGES: StageDefinition[] = [
  { key: 'checked_in', label: 'Check-in', description: 'Recepção e entrada do pet no estabelecimento', badgeBg: 'bg-teal-50', badgeText: 'text-teal-700', isSystem: true, color: 'teal' },
  { key: 'bathing', label: 'Banho', description: 'Banho, hidratação e lavagem', badgeBg: 'bg-sky-50', badgeText: 'text-sky-700', isSystem: false, color: 'sky' },
  { key: 'grooming', label: 'Tosa', description: 'Tosa na máquina, tesoura ou higiênica', badgeBg: 'bg-purple-50', badgeText: 'text-purple-700', isSystem: false, color: 'purple' },
  { key: 'finishing', label: 'Finalização', description: 'Secagem, escovação, penteado, perfume e adereços', badgeBg: 'bg-amber-50', badgeText: 'text-amber-700', isSystem: false, color: 'amber' },
  { key: 'ready', label: 'Pronto', description: 'Pet finalizado aguardando retirada pelo tutor', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700', isSystem: true, color: 'emerald' },
];

export const DEFAULT_PIPELINE_ORDER: string[] = [
  'checked_in',
  'bathing',
  'grooming',
  'finishing',
  'ready',
];

export interface StagePreset {
  id: string;
  name: string;
  description: string;
  stages: string[];
}

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: 'banho_apenas',
    name: 'Somente Banho',
    description: 'Sem tosa: Check-in → Banho → Finalização → Pronto (4 etapas)',
    stages: ['checked_in', 'bathing', 'finishing', 'ready'],
  },
  {
    id: 'banho_tosa',
    name: 'Banho + Tosa',
    description: 'Fluxo completo tradicional de estética (5 etapas)',
    stages: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'],
  },
  {
    id: 'tosa_apenas',
    name: 'Somente Tosa',
    description: 'Sem banho: Check-in → Tosa → Finalização → Pronto (4 etapas)',
    stages: ['checked_in', 'grooming', 'finishing', 'ready'],
  },
  {
    id: 'rapido_higienizacao',
    name: 'Higienização Express / Unhas / Ouvidos',
    description: 'Atendimento rápido: Check-in → Finalização → Pronto (3 etapas)',
    stages: ['checked_in', 'finishing', 'ready'],
  },
];

export function normalizeStages(stages?: any[]): PetshopStageItem[] {
  if (!Array.isArray(stages) || stages.length === 0) {
    return ALL_PETSHOP_STAGES.map((s, idx) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      isSystem: s.isSystem,
      isCustom: false,
      color: s.color,
      order: idx,
    }));
  }

  const result: PetshopStageItem[] = [];
  const seen = new Set<string>();

  for (let idx = 0; idx < stages.length; idx++) {
    const raw = stages[idx];
    let key = '';
    let label = '';
    let description = '';
    let isCustom = false;
    let color: string | undefined = undefined;
    let trackProfessional = false;

    if (typeof raw === 'string') {
      key = raw.trim().toLowerCase();
      const def = ALL_PETSHOP_STAGES.find(d => d.key === key);
      label = def?.label || (key.startsWith('custom_') ? key.replace(/^custom_/, '') : key);
      description = def?.description || '';
      isCustom = key.startsWith('custom_');
      color = def?.color;
    } else if (typeof raw === 'object' && raw !== null) {
      key = String(raw.key || '').trim().toLowerCase();
      label = String(raw.label || '').trim();
      description = String(raw.description || '').trim();
      isCustom = Boolean(raw.isCustom) || key.startsWith('custom_');
      color = raw.color;
      trackProfessional = Boolean(raw.trackProfessional);
      if (!label) {
        const def = ALL_PETSHOP_STAGES.find(d => d.key === key);
        label = def?.label || (key.startsWith('custom_') ? key.replace(/^custom_/, '') : key);
      }
    }

    if (!key || seen.has(key)) continue;
    seen.add(key);

    const isSystem = key === 'checked_in' || key === 'ready';
    result.push({
      key,
      label: label.slice(0, 60),
      description: description ? description.slice(0, 200) : undefined,
      isCustom,
      isSystem,
      color: color || (key === 'checked_in' ? 'teal' : key === 'ready' ? 'emerald' : 'indigo'),
      order: idx,
      trackProfessional,
    });
  }

  return result;
}

export function getStageLabel(key: string, customList?: (string | PetshopStageItem)[] | null): string {
  if (Array.isArray(customList)) {
    for (const item of customList) {
      if (typeof item === 'object' && item !== null && item.key === key && item.label) {
        return item.label;
      }
    }
  }
  const match = ALL_PETSHOP_STAGES.find(s => s.key === key);
  if (match) return match.label;
  if (key.startsWith('custom_')) return key.replace(/^custom_/, '').replace(/[_-]/g, ' ');
  return key;
}

export function suggestStagesForService(name?: string, category?: string): string[] {
  const norm = `${name || ''} ${category || ''}`.toLowerCase();
  const hasBanho = norm.includes('banho') || norm.includes('hidrata') || norm.includes('spa') || norm.includes('ozon');
  const hasTosa = norm.includes('tosa');

  if (hasBanho && hasTosa) {
    return ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'];
  }
  if (hasTosa && !hasBanho) {
    return ['checked_in', 'grooming', 'finishing', 'ready'];
  }
  if (hasBanho && !hasTosa) {
    return ['checked_in', 'bathing', 'finishing', 'ready'];
  }
  if (
    norm.includes('unha') ||
    norm.includes('ouvido') ||
    norm.includes('dente') ||
    norm.includes('escova') ||
    norm.includes('pentead') ||
    norm.includes('higi') ||
    norm.includes('rapido') ||
    norm.includes('rápido') ||
    norm.includes('express') ||
    norm.includes('limpeza')
  ) {
    return ['checked_in', 'finishing', 'ready'];
  }
  return ['checked_in', 'bathing', 'finishing', 'ready'];
}

export function consolidateStages(stagesLists: any[][]): string[] {
  const allNeeded = new Set<string>();
  for (const list of stagesLists) {
    if (Array.isArray(list)) {
      for (const s of list) {
        const k = typeof s === 'string' ? s : s?.key;
        if (k) allNeeded.add(k);
      }
    }
  }
  allNeeded.add('checked_in');
  allNeeded.add('ready');
  if (!allNeeded.has('bathing') && !allNeeded.has('grooming') && !allNeeded.has('finishing')) {
    allNeeded.add('finishing');
  }
  const defaultOrder: string[] = ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'];
  const ordered = defaultOrder.filter(s => allNeeded.has(s));
  for (const k of allNeeded) {
    if (!ordered.includes(k) && k !== 'ready') ordered.splice(ordered.length - 1, 0, k);
  }
  return ordered;
}

export function resolveAppointmentStages(apt?: Appointment | null): string[] {
  if (!apt) return ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'];

  if (Array.isArray(apt.customStages) && apt.customStages.length > 0) {
    return apt.customStages.map((s: any) => (typeof s === 'string' ? s : s.key));
  }
  if (Array.isArray((apt as any).resolvedStages) && (apt as any).resolvedStages.length > 0) {
    return (apt as any).resolvedStages.map((s: any) => (typeof s === 'string' ? s : s.key));
  }

  const services = Array.isArray(apt.services) ? apt.services : [];
  if (services.length > 0) {
    const lists: any[][] = [];
    for (const svcItem of services) {
      const svcObj = (svcItem as any).service;
      if (svcObj?.customStages && Array.isArray(svcObj.customStages) && svcObj.customStages.length > 0) {
        lists.push(svcObj.customStages);
      } else {
        const sName = svcObj?.name || svcItem.nameSnapshot || '';
        const sCat = svcObj?.category || '';
        lists.push(suggestStagesForService(sName, sCat));
      }
    }
    return consolidateStages(lists);
  }

  return ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'];
}

export function resolveAppointmentSteps(apt?: Appointment | null): Array<{ key: string; label: string; isCustom?: boolean }> {
  if (!apt) {
    return ALL_PETSHOP_STAGES.map(s => ({ key: s.key, label: s.label, isCustom: false }));
  }

  if (Array.isArray(apt.customStages) && apt.customStages.length > 0) {
    return apt.customStages.map((s: any) => {
      if (typeof s === 'object' && s !== null) {
        return {
          key: s.key,
          label: s.label || getStageLabel(s.key),
          isCustom: s.isCustom,
        };
      }
      return {
        key: String(s),
        label: getStageLabel(String(s)),
      };
    });
  }

  const stageKeys = resolveAppointmentStages(apt);
  return stageKeys.map(k => ({
    key: k,
    label: getStageLabel(k),
  }));
}

export type StageHistoryEntry = {
  status: string;
  kind?: 'service_added' | string;
  appointmentServiceId?: string;
  label?: string | null;
  at: string;
  photoUrl?: string | null;
  notes?: string | null;
  userId?: string | null;
  userName?: string | null;
  skipped?: boolean;
  reason?: string | null;
};

export type AppointmentServiceItem = {
  id: string;
  serviceId?: string;
  nameSnapshot: string;
  priceSnapshot: string | number;
  durationMinutes: number;
  isCombo?: boolean;
  comboParentId?: string | null;
  comboParent?: AppointmentServiceItem | null;
  comboComponents?: AppointmentServiceItem[];
  customerPackageId?: string | null;
  customerPackageItemId?: string | null;
  coverageStatus?: 'none' | 'reserved' | 'consumed' | 'released' | 'refunded' | string;
  coveredAmount?: string | number;
  customerPackage?: {
    id: string;
    planNameSnapshot: string;
    expiresAt: string;
    status: string;
  } | null;
  customerPackageItem?: {
    id: string;
    totalQuantity: number;
    usedQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  } | null;
};

export type PetTransportInfo = {
  enabled: boolean;
  mode: 'round_trip' | 'pickup_only' | 'dropoff_only' | string;
  fee: number;
  coveredByPackage?: boolean;
  street?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes?: string | null;
  checkInNotes?: string | null;
  transport?: PetTransportInfo | null;
  checkedInAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  stagePhotoUrl?: string | null;
  stageNotes?: string | null;
  stageHistory?: StageHistoryEntry[] | null;
  customStages?: (string | PetshopStageItem)[] | null;
  resolvedStages?: string[] | null;
  pet: Pet;
  customer: Tutor;
  professionalId?: string | null;
  professional?: { id: string; name: string } | null;
  services: AppointmentServiceItem[];
};

export type PetPackagePricingRule = {
  id?: string;
  species: string; // all, dog, cat
  size: string;    // all, small, medium, large, giant
  coatType: string; // all, short, medium, long, double
  price: string | number;
  label?: string | null;
};

export type PetPackagePlan = {
  id: string;
  name: string;
  description?: string | null;
  basePrice: string | number;
  validityDays: number;
  allowSharedPets: boolean;
  active: boolean;
  items: Array<{
    id: string;
    serviceId: string;
    quantity: number;
    service: PetService;
  }>;
  pricingRules: PetPackagePricingRule[];
  _count?: { contracts: number };
};

export type CustomerPetPackageItem = {
  id: string;
  customerPackageId: string;
  serviceId: string;
  serviceNameSnapshot: string;
  unitValueSnapshot: string | number;
  totalQuantity: number;
  reservedQuantity: number;
  usedQuantity: number;
  availableQuantity: number;
  service?: PetService;
};

export type CustomerPetPackageLedger = {
  id: string;
  eventType: 'CONTRACT_CREATED' | 'RESERVE' | 'CONSUME' | 'RELEASE_RESERVATION' | 'REFUND' | 'CANCEL' | string;
  quantityDelta: number;
  balanceAfter: number;
  usedAfter: number;
  reservedAfter: number;
  operatorName?: string | null;
  reason?: string | null;
  createdAt: string;
  appointmentId?: string | null;
  pet?: { id: string; name: string } | null;
};

export type CustomerPetPackage = {
  id: string;
  customerId: string;
  packagePlanId?: string | null;
  petId?: string | null;
  isShared: boolean;
  planNameSnapshot: string;
  speciesSnapshot?: string | null;
  sizeSnapshot?: string | null;
  coatTypeSnapshot?: string | null;
  basePriceSnapshot: string | number;
  discountAmount: string | number;
  finalPrice: string | number;
  validityDays: number;
  startDate: string;
  expiresAt: string;
  status: 'active' | 'completed' | 'expired' | 'cancelled' | string;
  paymentStatus: 'paid' | 'pending' | 'cancelled' | string;
  paymentMethod?: string | null;
  comandaId?: string | null;
  saleId?: string | null;
  notes?: string | null;
  transport?: PetTransportInfo | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string; address?: string | null; reference?: string | null };
  pet?: {
    id: string;
    name: string;
    species?: string;
    breed?: string | null;
    size?: string | null;
    coatType?: string | null;
    photoUrl?: string | null;
  } | null;
  items: CustomerPetPackageItem[];
  ledgerEvents?: CustomerPetPackageLedger[];
};

export type WhatsappSessionStatus = {
  tenantId: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
  qrCodeDataUrl: string | null;
  qrGeneratedAt: string | null;
  connectedPhone: string | null;
  connectedName: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastError: string | null;
};

export type PetshopNotificationRule = {
  id: string;
  name: string;
  triggerType:
    | 'APPOINTMENT_CONFIRMED'
    | 'BEFORE_APPOINTMENT'
    | 'PET_READY'
    | 'PACKAGE_LAST_SESSION'
    | 'PACKAGE_EXPIRING'
    | 'INACTIVE_CUSTOMER';
  triggerMinutesBefore?: number | null;
  messageTemplate: string;
  includePhoto: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PetshopNotificationJob = {
  id: string;
  triggerType: string;
  recipientPhone: string;
  recipientName: string;
  petName?: string | null;
  messageContent: string;
  mediaUrl?: string | null;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED_STALE';
  attempts: number;
  maxAttempts: number;
  scheduledFor: string;
  sentAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  rule?: { id: string; name: string } | null;
};

export const coatLabels: Record<string, string> = {
  all: 'Todas as pelagens',
  short: 'Pelo Curto',
  medium: 'Pelo Médio',
  long: 'Pelo Longo',
  double: 'Pelagem Dupla / Densa',
};

export const money = (value: string | number) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
