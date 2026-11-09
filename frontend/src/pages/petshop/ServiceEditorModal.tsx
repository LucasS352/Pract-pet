import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  Bath,
  Stethoscope,
  Scissors,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Clock,
  Tag,
  PawPrint,
  Check,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  TrendingDown,
  Percent,
  DollarSign,
  Wand2,
  X,
  Droplets,
  CheckCircle2,
  ListChecks,
  Pencil,
  RotateCcw,
  Workflow,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { PetService, PetshopStageKey, StagePreset, PetshopStageItem } from './types';
import { money, STAGE_PRESETS, suggestStagesForService, normalizeStages, getStageLabel, ALL_PETSHOP_STAGES } from './types';
import { inputClass, labelClass, primaryButton, secondaryButton, Modal } from './ui';

interface ServiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: string | null;
  existingServices: PetService[];
  onSaved: () => void;
}

const CATEGORY_OPTIONS = [
  'Higiene e Estética',
  'Tosa & Estética',
  'Tratamentos & Spa',
  'Consultas & Saúde',
  'Outros',
];

export const SIZES_DEFINITION = [
  {
    id: 'mini',
    short: 'MINI',
    label: 'Porte Mini',
    weightHint: 'Até 5 kg (ex: Pinscher, Yorkshire, Chihuahua)',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'small',
    short: 'P',
    label: 'Porte Pequeno',
    weightHint: '5 a 10 kg (ex: Shih Tzu, Poodle, Maltês, Spitz)',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  {
    id: 'medium',
    short: 'M',
    label: 'Porte Médio',
    weightHint: '10 a 20 kg (ex: Beagle, Cocker, Bulldog Francês)',
    badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    id: 'large',
    short: 'G',
    label: 'Porte Grande',
    weightHint: '20 a 35 kg (ex: Golden Retriever, Labrador, Boxer)',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'giant',
    short: 'GG',
    label: 'Porte Gigante',
    weightHint: 'Mais de 35 kg (ex: Bernese, Rottweiler, Terra Nova)',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
  },
];

const COATS = [
  { id: 'all', label: 'Todas as pelagens' },
  { id: 'short', label: 'Pelo Curto' },
  { id: 'medium', label: 'Pelo Médio' },
  { id: 'long', label: 'Pelo Longo' },
  { id: 'double', label: 'Dupla / Subpelo' },
];

interface SizePriceEntry {
  price: string;
  duration: string;
}

const DEFAULT_SIZE_PRICES: Record<string, SizePriceEntry> = {
  mini: { price: '45,00', duration: '40' },
  small: { price: '55,00', duration: '45' },
  medium: { price: '70,00', duration: '60' },
  large: { price: '85,00', duration: '75' },
  giant: { price: '110,00', duration: '90' },
};

export const THEMATIC_SERVICE_ICONS = [
  { id: 'bath', label: 'Banho', icon: Bath },
  { id: 'scissors', label: 'Tosa', icon: Scissors },
  { id: 'nail', label: 'Corte de Unha', icon: PawPrint },
  { id: 'flea', label: 'Antipulga', icon: Droplets },
  { id: 'spa', label: 'Hidratação & Spa', icon: Sparkles },
  { id: 'health', label: 'Saúde / Vacina', icon: Stethoscope },
];

export function inferIconFromName(name: string, category?: string): string {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (n.includes('tosa') || n.includes('trim') || n.includes('máquina')) return 'scissors';
  if (n.includes('unha') || n.includes('pata') || n.includes('patas')) return 'nail';
  if (n.includes('pulga') || n.includes('carrapato') || n.includes('medicament') || n.includes('dermat') || n.includes('antipulga')) return 'flea';
  if (n.includes('hidrata') || n.includes('spa') || n.includes('cauteriz') || n.includes('ozônio') || n.includes('estética') || c.includes('spa')) return 'spa';
  if (n.includes('vacina') || n.includes('consulta') || n.includes('veterin') || n.includes('exame') || n.includes('saúde') || c.includes('saúde')) return 'health';
  if (n.includes('banho') || n.includes('ducha') || n.includes('higien') || c.includes('higiene')) return 'bath';
  return 'bath';
}

export function parseCurrencyInput(val: string | number): number {
  if (val === undefined || val === null || val === '') return 0;
  const clean = String(val).replace(/\s/g, '').replace('R$', '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function ServiceEditorModal({
  isOpen,
  onClose,
  serviceId,
  existingServices,
  onSaved,
}: ServiceEditorModalProps) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'pricing' | 'combo' | 'coats'>('pricing');
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  // Informações Básicas
  const [serviceType, setServiceType] = useState<'INDIVIDUAL' | 'COMBO'>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Higiene e Estética');
  const [targetSpecies, setTargetSpecies] = useState('all');
  const [color, setColor] = useState('#0d9488');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [selectedIcon, setSelectedIcon] = useState<string>('bath');
  const [iconTouched, setIconTouched] = useState<boolean>(false);

  // Precificação
  const [pricingMode, setPricingMode] = useState<'BY_SIZE' | 'SINGLE'>('BY_SIZE');
  const [basePrice, setBasePrice] = useState('60,00');
  const [baseDurationMinutes, setBaseDurationMinutes] = useState(60);
  const [quickBaseRef, setQuickBaseRef] = useState('60,00');
  const [sizePrices, setSizePrices] = useState<Record<string, SizePriceEntry>>(DEFAULT_SIZE_PRICES);

  // Regras Avançadas de Pelagem (opcional)
  const [coatRules, setCoatRules] = useState<
    Array<{
      species: string;
      size: string;
      coatType: string;
      price: string;
      durationMinutes: string;
      label?: string;
    }>
  >([]);

  // Configuração de Combo
  const [comboPricingType, setComboPricingType] = useState<
    'FIXED_PRICE' | 'PERCENT_DISCOUNT' | 'FIXED_DISCOUNT'
  >('PERCENT_DISCOUNT');
  const [comboDiscountValue, setComboDiscountValue] = useState('15');
  const [autoCalculateDuration, setAutoCalculateDuration] = useState(true);
  const [customComboDuration, setCustomComboDuration] = useState(60);
  const [comboComponents, setComboComponents] = useState<
    Array<{ componentServiceId: string; quantity: number }>
  >([]);
  const [selectedComponentToAdd, setSelectedComponentToAdd] = useState('');

  // Etapas Operacionais do Atendimento
  const [storeStages, setStoreStages] = useState<PetshopStageItem[]>(() => normalizeStages([]));
  const [selectedStages, setSelectedStages] = useState<string[]>([
    'checked_in',
    'bathing',
    'finishing',
    'ready',
  ]);
  const [stageCustomLabels, setStageCustomLabels] = useState<Record<string, string>>({});
  const [stagePresetId, setStagePresetId] = useState<string>('banho_apenas');
  const [customStagesModified, setCustomStagesModified] = useState(false);

  // Edição inline de rótulo da etapa
  const [editingStageKey, setEditingStageKey] = useState<string | null>(null);
  const [editingStageInput, setEditingStageInput] = useState('');

  // Adição inline de nova etapa customizada
  const [showAddCustomStage, setShowAddCustomStage] = useState(false);
  const [newCustomStageName, setNewCustomStageName] = useState('');
  const [newCustomStageDesc, setNewCustomStageDesc] = useState('');
  const [newCustomStagePos, setNewCustomStagePos] = useState<'after_bathing' | 'after_grooming' | 'before_ready'>('after_bathing');

  // Carrega etapas da loja
  useEffect(() => {
    if (!isOpen) return;
    api.get<PetshopStageItem[]>('/petshop/stages')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setStoreStages(normalizeStages(res.data));
        } else {
          setStoreStages(normalizeStages([]));
        }
      })
      .catch(() => setStoreStages(normalizeStages([])));
  }, [isOpen]);

  // Carrega dados se for edição
  useEffect(() => {
    if (!isOpen) return;

    if (serviceId) {
      setLoadingDetails(true);
      api
        .get<PetService>(`/petshop/services/${serviceId}`)
        .then(res => {
          const s = res.data;
          setServiceType(s.serviceType || 'INDIVIDUAL');
          setName(s.name);
          setCategory(s.category || 'Higiene e Estética');
          setTargetSpecies(s.targetSpecies || 'all');
          setColor(s.color || '#0d9488');
          
          let rawDesc = s.description || '';
          const iconMatch = rawDesc.match(/\[icon:([a-z_]+)\]/i);
          if (iconMatch) {
            setSelectedIcon(iconMatch[1]);
            setIconTouched(true);
            rawDesc = rawDesc.replace(iconMatch[0], '').trim();
          } else {
            setSelectedIcon(inferIconFromName(s.name, s.category));
          }
          setDescription(rawDesc);

          const bpNum = Number(s.price || 60);
          setBasePrice(bpNum.toFixed(2).replace('.', ','));
          setQuickBaseRef(bpNum.toFixed(2).replace('.', ','));
          setBaseDurationMinutes(Number(s.durationMinutes || 60));
          setActive(s.active !== false);

          if (s.customStages && Array.isArray(s.customStages) && s.customStages.length > 0) {
            const loadedKeys: string[] = [];
            const loadedLabels: Record<string, string> = {};
            const extraStages: PetshopStageItem[] = [];

            for (const item of s.customStages) {
              if (typeof item === 'object' && item !== null) {
                const k = String((item as any).key || '');
                if (k) {
                  loadedKeys.push(k);
                  if ((item as any).label) loadedLabels[k] = (item as any).label;
                  if ((item as any).isCustom || k.startsWith('custom_')) {
                    extraStages.push({
                      key: k,
                      label: (item as any).label || k,
                      description: (item as any).description,
                      isCustom: true,
                      isSystem: false,
                      color: 'indigo',
                    });
                  }
                }
              } else if (typeof item === 'string') {
                loadedKeys.push(item);
              }
            }

            setSelectedStages(loadedKeys);
            setStageCustomLabels(loadedLabels);
            if (extraStages.length > 0) {
              setStoreStages(prev => {
                const existingKeys = new Set(prev.map(p => p.key));
                const added = extraStages.filter(e => !existingKeys.has(e.key));
                if (added.length === 0) return prev;
                const readyIdx = prev.findIndex(p => p.key === 'ready');
                const next = [...prev];
                const insertAt = readyIdx !== -1 ? readyIdx : next.length;
                next.splice(insertAt, 0, ...added);
                return next;
              });
            }

            const matched = STAGE_PRESETS.find(
              p => p.stages.length === loadedKeys.length && p.stages.every((k, i) => k === loadedKeys[i]),
            );
            setStagePresetId(matched ? matched.id : 'custom');
            setCustomStagesModified(true);
          } else {
            const suggested = suggestStagesForService(s.name, s.category);
            setSelectedStages(suggested);
            const matched = STAGE_PRESETS.find(
              p => p.stages.length === suggested.length && p.stages.every((k, i) => k === suggested[i]),
            );
            setStagePresetId(matched ? matched.id : 'custom');
            setCustomStagesModified(false);
          }

          if (s.serviceType === 'COMBO') {
            setComboPricingType(s.comboPricingType || 'FIXED_PRICE');
            setComboDiscountValue(s.comboDiscountValue ? String(s.comboDiscountValue) : '0');
            setAutoCalculateDuration(!s.durationMinutes || s.durationMinutes === 60);
            setCustomComboDuration(s.durationMinutes || 60);

            if (Array.isArray(s.comboItems) && s.comboItems.length > 0) {
              setComboComponents(
                s.comboItems.map(ci => ({
                  componentServiceId: ci.componentServiceId,
                  quantity: ci.quantity || 1,
                })),
              );
            } else {
              setComboComponents([]);
            }
          }

          if (Array.isArray(s.pricingRules) && s.pricingRules.length > 0) {
            const sizeOnlyRules = s.pricingRules.filter(
              r => r.size && r.size !== 'all' && (!r.coatType || r.coatType === 'all'),
            );
            const advancedCoatRules = s.pricingRules.filter(r => r.coatType && r.coatType !== 'all');

            if (sizeOnlyRules.length > 0) {
              setPricingMode('BY_SIZE');
              const loadedSizes: Record<string, SizePriceEntry> = { ...DEFAULT_SIZE_PRICES };
              for (const r of sizeOnlyRules) {
                if (loadedSizes[r.size]) {
                  const pNum = Number(r.price || 0);
                  loadedSizes[r.size] = {
                    price: pNum.toFixed(2).replace('.', ','),
                    duration: String(r.durationMinutes || s.durationMinutes || '60'),
                  };
                }
              }
              setSizePrices(loadedSizes);
            } else {
              setPricingMode('SINGLE');
            }

            if (advancedCoatRules.length > 0) {
              setCoatRules(
                advancedCoatRules.map(r => ({
                  species: r.species || 'all',
                  size: r.size || 'all',
                  coatType: r.coatType || 'all',
                  price: String(r.price || '0').replace('.', ','),
                  durationMinutes: r.durationMinutes ? String(r.durationMinutes) : '',
                  label: r.label || '',
                })),
              );
            } else {
              setCoatRules([]);
            }
          } else {
            const isEstetica =
              (s.category || '').toLowerCase().includes('higiene') ||
              (s.category || '').toLowerCase().includes('estética') ||
              (s.name || '').toLowerCase().includes('banho') ||
              (s.name || '').toLowerCase().includes('tosa');

            if (isEstetica) {
              setPricingMode('BY_SIZE');
              const baseNum = Number(s.price || 60);
              const baseDur = Number(s.durationMinutes || 60);
              setSizePrices({
                mini: { price: (baseNum * 0.75).toFixed(2).replace('.', ','), duration: String(Math.max(20, Math.round(baseDur * 0.65))) },
                small: { price: (baseNum * 0.9).toFixed(2).replace('.', ','), duration: String(Math.max(25, Math.round(baseDur * 0.75))) },
                medium: { price: (baseNum * 1.0).toFixed(2).replace('.', ','), duration: String(baseDur) },
                large: { price: (baseNum * 1.3).toFixed(2).replace('.', ','), duration: String(Math.round(baseDur * 1.25)) },
                giant: { price: (baseNum * 1.7).toFixed(2).replace('.', ','), duration: String(Math.round(baseDur * 1.5)) },
              });
            } else {
              setPricingMode('SINGLE');
            }
            setCoatRules([]);
          }
        })
        .catch(() => {
          toast.error('Erro ao carregar detalhes do serviço.');
        })
        .finally(() => setLoadingDetails(false));
    } else {
      // Criação de novo serviço
      setServiceType('INDIVIDUAL');
      setName('');
      setCategory('Higiene e Estética');
      setSelectedIcon('bath');
      setIconTouched(false);
      setTargetSpecies('all');
      setColor('#0d9488');
      setDescription('');
      setPricingMode('BY_SIZE');
      setBasePrice('60,00');
      setQuickBaseRef('60,00');
      setBaseDurationMinutes(60);
      setSizePrices(DEFAULT_SIZE_PRICES);
      setActive(true);
      setComboPricingType('PERCENT_DISCOUNT');
      setComboDiscountValue('15');
      setAutoCalculateDuration(true);
      setCustomComboDuration(60);
      setComboComponents([]);
      setCoatRules([]);
      setSelectedStages(['checked_in', 'bathing', 'finishing', 'ready']);
      setStagePresetId('banho_apenas');
      setCustomStagesModified(false);
      setActiveTab('pricing');
    }
  }, [isOpen, serviceId]);

  const eligibleServicesForCombo = useMemo(() => {
    return existingServices.filter(
      s => s.serviceType !== 'COMBO' && s.id !== serviceId && s.active,
    );
  }, [existingServices, serviceId]);

  const comboSummary = useMemo(() => {
    let rawTotal = 0;
    let totalDuration = 0;

    for (const comp of comboComponents) {
      const found = existingServices.find(s => s.id === comp.componentServiceId);
      if (found) {
        rawTotal += Number(found.price || 0) * comp.quantity;
        totalDuration += Number(found.durationMinutes || 30) * comp.quantity;
      }
    }

    let finalPrice = rawTotal;
    let discount = 0;

    if (comboPricingType === 'PERCENT_DISCOUNT') {
      const pct = Math.min(100, Math.max(0, Number(comboDiscountValue) || 0));
      discount = (rawTotal * pct) / 100;
      finalPrice = Math.max(0, rawTotal - discount);
    } else if (comboPricingType === 'FIXED_DISCOUNT') {
      discount = Math.min(rawTotal, Math.max(0, Number(comboDiscountValue) || 0));
      finalPrice = Math.max(0, rawTotal - discount);
    } else if (comboPricingType === 'FIXED_PRICE') {
      finalPrice = Math.max(0, parseCurrencyInput(basePrice));
      discount = Math.max(0, rawTotal - finalPrice);
    }

    const duration = autoCalculateDuration ? totalDuration : customComboDuration;

    return {
      rawTotal,
      discount,
      finalPrice,
      duration,
    };
  }, [
    comboComponents,
    existingServices,
    comboPricingType,
    comboDiscountValue,
    basePrice,
    autoCalculateDuration,
    customComboDuration,
  ]);

  const priceRangeSummary = useMemo(() => {
    if (pricingMode === 'SINGLE') {
      const num = parseCurrencyInput(basePrice);
      return {
        min: num,
        max: num,
        formatted: money(num),
        minDuration: baseDurationMinutes,
        maxDuration: baseDurationMinutes,
      };
    }

    const prices = Object.values(sizePrices).map(p => parseCurrencyInput(p.price));
    const durations = Object.values(sizePrices).map(p => Number(p.duration) || 60);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const minDur = Math.min(...durations);
    const maxDur = Math.max(...durations);

    return {
      min,
      max,
      formatted: min === max ? money(min) : `${money(min)} a ${money(max)}`,
      minDuration: minDur,
      maxDuration: maxDur,
    };
  }, [pricingMode, basePrice, sizePrices, baseDurationMinutes]);

  const handleUpdateSizePrice = (sizeKey: string, field: 'price' | 'duration', val: string) => {
    setSizePrices(prev => ({
      ...prev,
      [sizeKey]: {
        ...prev[sizeKey],
        [field]: val,
      },
    }));
  };

  const handleAutoCalculateSizes = () => {
    const base = parseCurrencyInput(quickBaseRef) || 60;
    const baseDur = Number(baseDurationMinutes) || 60;

    setSizePrices({
      mini: { price: (base * 0.75).toFixed(2).replace('.', ','), duration: String(Math.max(20, Math.round(baseDur * 0.65))) },
      small: { price: (base * 0.9).toFixed(2).replace('.', ','), duration: String(Math.max(25, Math.round(baseDur * 0.75))) },
      medium: { price: (base * 1.0).toFixed(2).replace('.', ','), duration: String(baseDur) },
      large: { price: (base * 1.3).toFixed(2).replace('.', ','), duration: String(Math.round(baseDur * 1.25)) },
      giant: { price: (base * 1.7).toFixed(2).replace('.', ','), duration: String(Math.round(baseDur * 1.5)) },
    });

    toast.success('Valores e tempos dos 5 portes sugeridos com sucesso!');
  };

  const handleAddComponent = () => {
    if (!selectedComponentToAdd) return;
    const exists = comboComponents.some(c => c.componentServiceId === selectedComponentToAdd);
    if (exists) {
      toast.info('Este serviço já está incluído no combo.');
      return;
    }

    setComboComponents(prev => [
      ...prev,
      { componentServiceId: selectedComponentToAdd, quantity: 1 },
    ]);
    setSelectedComponentToAdd('');
  };

  const handleUpdateComponentQty = (serviceIdToUpdate: string, delta: number) => {
    setComboComponents(prev =>
      prev
        .map(c => {
          if (c.componentServiceId === serviceIdToUpdate) {
            const nextQty = c.quantity + delta;
            return nextQty > 0 ? { ...c, quantity: nextQty } : null;
          }
          return c;
        })
        .filter(Boolean) as Array<{ componentServiceId: string; quantity: number }>,
    );
  };

  const handleRemoveComponent = (serviceIdToRemove: string) => {
    setComboComponents(prev => prev.filter(c => c.componentServiceId !== serviceIdToRemove));
  };

  const handleAddCoatRule = () => {
    setCoatRules(prev => [
      ...prev,
      {
        species: targetSpecies,
        size: 'medium',
        coatType: 'long',
        price: (parseCurrencyInput(sizePrices.medium?.price || basePrice || 70) + 15).toFixed(2).replace('.', ','),
        durationMinutes: String(Number(sizePrices.medium?.duration || baseDurationMinutes || 60) + 15),
        label: 'Médio / Pelo Longo',
      },
    ]);
  };

  const handleRemoveCoatRule = (idx: number) => {
    setCoatRules(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCoatRuleChange = (idx: number, field: string, val: any) => {
    setCoatRules(prev =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
    );
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    if (!iconTouched) {
      setSelectedIcon(inferIconFromName(newName, category));
    }
    if (!customStagesModified) {
      const suggested = suggestStagesForService(newName, category);
      setSelectedStages(suggested);
      const matched = STAGE_PRESETS.find(
        p => p.stages.length === suggested.length && p.stages.every((k, i) => k === suggested[i]),
      );
      setStagePresetId(matched ? matched.id : 'custom');
    }
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    if (!iconTouched) {
      setSelectedIcon(inferIconFromName(name, newCat));
    }
    if (!customStagesModified) {
      const suggested = suggestStagesForService(name, newCat);
      setSelectedStages(suggested);
      const matched = STAGE_PRESETS.find(
        p => p.stages.length === suggested.length && p.stages.every((k, i) => k === suggested[i]),
      );
      setStagePresetId(matched ? matched.id : 'custom');
    }
  };

  const handleSelectPreset = (preset: StagePreset) => {
    setSelectedStages(preset.stages);
    setStagePresetId(preset.id);
    setCustomStagesModified(true);
  };

  const getStageDisplayName = (key: string) => {
    if (stageCustomLabels[key]) return stageCustomLabels[key];
    const match = storeStages.find(s => s.key === key);
    if (match?.label) return match.label;
    return getStageLabel(key);
  };

  const handleStartRenameStage = (key: string) => {
    setEditingStageKey(key);
    setEditingStageInput(getStageDisplayName(key));
  };

  const handleSaveRenameStage = (key: string) => {
    const clean = editingStageInput.trim();
    if (!clean) {
      toast.error('O nome da etapa não pode ser vazio.');
      return;
    }
    setStageCustomLabels(prev => ({ ...prev, [key]: clean }));
    setEditingStageKey(null);
    setCustomStagesModified(true);
    toast.success(`Nome da etapa alterado para "${clean}" neste serviço.`);
  };

  const handleResetStageName = (key: string) => {
    setStageCustomLabels(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setEditingStageKey(null);
    setCustomStagesModified(true);
    toast.info('Nome da etapa restaurado para o padrão da loja.');
  };

  const handleAddInlineCustomStage = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCustomStageName.trim();
    if (!clean) {
      toast.error('Informe o nome da etapa.');
      return;
    }
    const slug = clean
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 20);

    const key = `custom_${slug || 'etapa'}_${Date.now().toString(36).slice(-4)}`;
    const newStageItem: PetshopStageItem = {
      key,
      label: clean,
      description: newCustomStageDesc.trim() || undefined,
      isCustom: true,
      isSystem: false,
      color: 'indigo',
    };

    setStoreStages(prev => {
      const updated = [...prev];
      const readyIdx = updated.findIndex(s => s.key === 'ready');
      const bathingIdx = updated.findIndex(s => s.key === 'bathing');
      const groomingIdx = updated.findIndex(s => s.key === 'grooming');

      let insertIdx = readyIdx !== -1 ? readyIdx : updated.length;
      if (newCustomStagePos === 'after_bathing' && bathingIdx !== -1) insertIdx = bathingIdx + 1;
      else if (newCustomStagePos === 'after_grooming' && groomingIdx !== -1) insertIdx = groomingIdx + 1;

      updated.splice(insertIdx, 0, newStageItem);
      return updated;
    });

    setSelectedStages(prev => {
      const updated = [...prev];
      const readyIdx = updated.indexOf('ready');
      const bathingIdx = updated.indexOf('bathing');
      const groomingIdx = updated.indexOf('grooming');

      let insertIdx = readyIdx !== -1 ? readyIdx : updated.length;
      if (newCustomStagePos === 'after_bathing' && bathingIdx !== -1) insertIdx = bathingIdx + 1;
      else if (newCustomStagePos === 'after_grooming' && groomingIdx !== -1) insertIdx = groomingIdx + 1;

      updated.splice(insertIdx, 0, key);
      return updated;
    });

    setStageCustomLabels(prev => ({ ...prev, [key]: clean }));
    setNewCustomStageName('');
    setNewCustomStageDesc('');
    setShowAddCustomStage(false);
    setCustomStagesModified(true);
    setStagePresetId('custom');
    toast.success(`Etapa "${clean}" adicionada a este serviço!`);
  };

  const handleRemoveCustomStage = (key: string) => {
    setStoreStages(prev => prev.filter(s => s.key !== key));
    setSelectedStages(prev => prev.filter(k => k !== key));
    setStageCustomLabels(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setCustomStagesModified(true);
    setStagePresetId('custom');
    toast.info('Etapa personalizada removida deste serviço.');
  };

  const handleToggleStage = (key: string) => {
    setCustomStagesModified(true);
    setStagePresetId('custom');

    setSelectedStages(prev => {
      let next: string[];
      if (prev.includes(key)) {
        const intermediates = prev.filter(k => k !== 'checked_in' && k !== 'ready');
        if (intermediates.length <= 1) {
          toast.info('O atendimento deve conter pelo menos uma etapa intermediária.');
          return prev;
        }
        next = prev.filter(k => k !== key);
      } else {
        const currentOrder = storeStages.map(s => s.key);
        const combined = new Set([...prev, key]);
        next = currentOrder.filter(k => combined.has(k));
        if (!next.includes(key)) {
          const readyIdx = next.indexOf('ready');
          if (readyIdx !== -1) next.splice(readyIdx, 0, key);
          else next.push(key);
        }
      }
      return next;
    });
  };

  // Submissão do Formulário
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome do serviço.');
      return;
    }

    if (serviceType === 'COMBO') {
      if (comboComponents.length === 0) {
        toast.error('Um combo deve conter pelo menos um serviço componente.');
        setActiveTab('combo');
        return;
      }
    } else {
      if (pricingMode === 'SINGLE') {
        if (parseCurrencyInput(basePrice) < 0) {
          toast.error('Informe um preço base válido.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      let finalPrice = parseCurrencyInput(basePrice) || 60;
      let finalDuration = Number(baseDurationMinutes) || 60;

      if (serviceType === 'COMBO') {
        finalPrice = comboPricingType !== 'FIXED_PRICE' ? comboSummary.finalPrice : parseCurrencyInput(basePrice);
        finalDuration = autoCalculateDuration ? comboSummary.duration : Number(customComboDuration);
      } else if (pricingMode === 'BY_SIZE') {
        finalPrice = parseCurrencyInput(sizePrices.medium?.price || sizePrices.small?.price || 60);
        finalDuration = Number(sizePrices.medium?.duration || sizePrices.small?.duration || 60);
      }

      let cleanDesc = description.replace(/\[icon:[a-z_]+\]/gi, '').trim();
      const descWithIcon = cleanDesc ? `${cleanDesc}\n\n[icon:${selectedIcon}]` : `[icon:${selectedIcon}]`;

      const payload: any = {
        name: name.trim(),
        description: descWithIcon,
        serviceType,
        category,
        targetSpecies,
        color,
        active,
        durationMinutes: finalDuration,
        price: finalPrice,
        customStages: selectedStages.map(k => {
          const label = stageCustomLabels[k] || storeStages.find(s => s.key === k)?.label || getStageLabel(k);
          const stObj = storeStages.find(s => s.key === k);
          return {
            key: k,
            label,
            description: stObj?.description,
            isCustom: stObj?.isCustom || k.startsWith('custom_'),
          };
        }),
      };

      if (serviceType === 'COMBO') {
        payload.comboPricingType = comboPricingType;
        payload.comboDiscountValue = Number(comboDiscountValue) || 0;
        payload.comboItems = comboComponents.map((ci, idx) => ({
          componentServiceId: ci.componentServiceId,
          quantity: ci.quantity,
          order: idx,
        }));
      }

      // Regras de precificação por porte e pelagem
      if (serviceType === 'INDIVIDUAL') {
        if (pricingMode === 'BY_SIZE') {
          const rules = SIZES_DEFINITION.map(s => ({
            species: targetSpecies,
            size: s.id,
            coatType: 'all',
            price: Math.max(0, parseCurrencyInput(sizePrices[s.id]?.price || 0)),
            durationMinutes: Math.max(5, Number(sizePrices[s.id]?.duration || 60)),
            label: s.label,
          }));

          if (coatRules.length > 0) {
            for (const cr of coatRules) {
              rules.push({
                species: cr.species || targetSpecies,
                size: cr.size,
                coatType: cr.coatType,
                price: Math.max(0, parseCurrencyInput(cr.price || 0)),
                durationMinutes: cr.durationMinutes ? Math.max(5, Number(cr.durationMinutes)) : finalDuration,
                label: cr.label || (undefined as any),
              });
            }
          }

          payload.pricingRules = rules;
        } else {
          payload.pricingRules = [];
        }
      }

      if (serviceId) {
        await api.patch(`/petshop/services/${serviceId}`, payload);
        toast.success('Serviço atualizado com sucesso!');
      } else {
        await api.post('/petshop/services', payload);
        toast.success(
          serviceType === 'COMBO'
            ? 'Combo promocional criado com sucesso!'
            : 'Serviço cadastrado com sucesso!',
        );
      }

      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar serviço.');
    } finally {
      setSaving(false);
    }
  };

  const ActiveIconComponent = THEMATIC_SERVICE_ICONS.find(i => i.id === selectedIcon)?.icon || Bath;

  return (
    <Modal
      title={serviceId ? 'Editar Serviço / Combo' : 'Novo Serviço / Combo'}
      subtitle="Configure a cobrança, valores e duração do serviço."
      onClose={onClose}
      showBack={true}
      maxWidth="sm:max-w-3xl"
      headerRight={
        <button
          type="button"
          onClick={() => toast.info('Defina o modelo de cobrança, valores por porte e tempos de atendimento do serviço.')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition cursor-pointer shadow-2xs"
          title="Ajuda sobre o cadastro de serviços"
        >
          <HelpCircle size={18} />
        </button>
      }
    >
      {loadingDetails ? (
        <div className="py-20 text-center text-xs text-slate-500 animate-pulse">
          Carregando informações do serviço...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. TOPO: ÍCONE SELECIONADO + NOME DO SERVIÇO */}
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-[#0d6e5a] border border-emerald-200/80 shadow-2xs">
              <ActiveIconComponent size={24} strokeWidth={2.2} />
            </div>

            <div className="flex-1 min-w-0">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {serviceType === 'COMBO' ? 'Nome do combo *' : 'Nome do serviço *'}
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Ex: Banho Completo, Tosa Higiênica..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-[#0d6e5a] focus:ring-1 focus:ring-[#0d6e5a] outline-none"
              />
            </div>
          </div>

          {/* 2. OS 6 ÍCONES TEMÁTICOS SELETOR */}
          <div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {THEMATIC_SERVICE_ICONS.map(item => {
                const IconComponent = item.icon;
                const isSelected = selectedIcon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedIcon(item.id);
                      setIconTouched(true);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition cursor-pointer border ${
                      isSelected
                        ? 'border-[#0d6e5a] bg-teal-50/90 text-[#0d6e5a] shadow-xs ring-1 ring-[#0d6e5a]/30'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <IconComponent size={15} className={isSelected ? 'text-[#0d6e5a]' : 'text-slate-400'} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. CATEGORIA & DURAÇÃO PADRÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Tag size={13} className="text-slate-400" />
                <span>Categoria *</span>
              </label>
              <select
                value={category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:border-[#0d6e5a] focus:ring-1 focus:ring-[#0d6e5a] outline-none cursor-pointer"
              >
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock size={13} className="text-slate-400" />
                <span>Duração padrão</span>
              </label>
              <select
                value={baseDurationMinutes}
                onChange={e => {
                  const val = Number(e.target.value);
                  setBaseDurationMinutes(val);
                  setSizePrices(prev => ({
                    mini: { ...prev.mini, duration: String(Math.max(20, Math.round(val * 0.65))) },
                    small: { ...prev.small, duration: String(Math.max(25, Math.round(val * 0.75))) },
                    medium: { ...prev.medium, duration: String(val) },
                    large: { ...prev.large, duration: String(Math.round(val * 1.25)) },
                    giant: { ...prev.giant, duration: String(Math.round(val * 1.5)) },
                  }));
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:border-[#0d6e5a] focus:ring-1 focus:ring-[#0d6e5a] outline-none cursor-pointer"
              >
                <option value={30}>30 min</option>
                <option value={40}>40 min</option>
                <option value={45}>45 min</option>
                <option value={50}>50 min</option>
                <option value={60}>60 min (1 hora)</option>
                <option value={75}>75 min (1h15)</option>
                <option value={90}>90 min (1h30)</option>
                <option value={120}>120 min (2 horas)</option>
              </select>
            </div>
          </div>

          {/* 4. MODELO DE COBRANÇA */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              Modelo de cobrança {name ? `do ${name}` : 'do serviço'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPricingMode('BY_SIZE')}
                className={`flex items-start gap-3 rounded-xl p-3 text-left transition border cursor-pointer ${
                  pricingMode === 'BY_SIZE'
                    ? 'border-[#0d6e5a] bg-teal-50/70 ring-1 ring-[#0d6e5a]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    pricingMode === 'BY_SIZE'
                      ? 'border-[#0d6e5a] bg-[#0d6e5a]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {pricingMode === 'BY_SIZE' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-xs font-bold text-slate-900">Preço por Porte do Pet</strong>
                    <span className="rounded-full bg-teal-100 text-teal-800 px-1.5 py-0.2 text-[10px] font-bold">
                      Recomendado
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                    Cobrança varia de acordo com o tamanho do cão ou gato
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPricingMode('SINGLE')}
                className={`flex items-start gap-3 rounded-xl p-3 text-left transition border cursor-pointer ${
                  pricingMode === 'SINGLE'
                    ? 'border-[#0d6e5a] bg-teal-50/70 ring-1 ring-[#0d6e5a]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    pricingMode === 'SINGLE'
                      ? 'border-[#0d6e5a] bg-[#0d6e5a]'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {pricingMode === 'SINGLE' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="text-xs font-bold text-slate-900 block">Preço Fixo Único</strong>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                    Mesmo valor para qualquer porte ou raça
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 5. CONFIGURAÇÃO POR PORTE (QUANDO BY_SIZE) */}
          {pricingMode === 'BY_SIZE' && (
            <div className="space-y-3">
              {/* BARRA DE AUTO-CÁLCULO */}
              <div className="rounded-xl border border-teal-200/80 bg-teal-50/60 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-[#0d6e5a] shrink-0" />
                  <p className="text-xs text-teal-950 font-medium">
                    Preencha um valor base para auto-escalonar os 5 portes proporcionalmente:
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center rounded-xl border border-teal-300 bg-white px-2.5 py-1.5 shadow-2xs">
                    <span className="text-xs font-bold text-slate-500 mr-1 select-none">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quickBaseRef}
                      onChange={e => setQuickBaseRef(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-16 text-xs font-bold text-slate-900 outline-none tabular-nums"
                      placeholder="60,00"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoCalculateSizes}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
                  >
                    <Wand2 size={13} />
                    <span>Auto-calcular Portes</span>
                  </button>
                </div>
              </div>

              {/* TABELA DE PORTES */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                <table className="w-full min-w-[380px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 sm:px-4 py-2.5">PORTE</th>
                      <th className="px-3 sm:px-4 py-2.5">PESO DO PET</th>
                      <th className="px-3 sm:px-4 py-2.5 w-32 sm:w-36">PREÇO DE VENDA</th>
                      <th className="px-3 sm:px-4 py-2.5 w-28 sm:w-32">DURAÇÃO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {SIZES_DEFINITION.map(sizeDef => {
                      const sizeKey = sizeDef.id;
                      const val = sizePrices[sizeKey] || { price: '0', duration: '60' };

                      return (
                        <tr key={sizeKey} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 sm:px-4 py-2.5 align-middle">
                            <span
                              className={`inline-flex items-center justify-center rounded-lg border px-2 py-0.5 text-xs font-bold ${sizeDef.badgeColor}`}
                            >
                              {sizeDef.short}
                            </span>
                          </td>

                          <td className="px-3 sm:px-4 py-2.5 align-middle">
                            <div className="min-w-0">
                              <strong className="block text-xs font-bold text-slate-900 leading-tight">
                                {sizeDef.label}
                              </strong>
                              <span className="text-[11px] text-slate-500 block leading-tight">
                                {sizeDef.weightHint.split('(')[0].trim()}
                              </span>
                            </div>
                          </td>

                          <td className="px-3 sm:px-4 py-2.5 align-middle">
                            <div className="flex items-center rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-[#0d6e5a] focus-within:ring-1 focus-within:ring-[#0d6e5a] shadow-2xs">
                              <span className="text-xs font-bold text-slate-500 mr-1 select-none">
                                R$
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={val.price}
                                onChange={e =>
                                  handleUpdateSizePrice(
                                    sizeKey,
                                    'price',
                                    e.target.value.replace(/[^0-9.,]/g, ''),
                                  )
                                }
                                onBlur={() => {
                                  const clean = parseCurrencyInput(val.price);
                                  handleUpdateSizePrice(
                                    sizeKey,
                                    'price',
                                    clean.toFixed(2).replace('.', ','),
                                  );
                                }}
                                className="w-full text-xs sm:text-sm font-bold tabular-nums text-slate-900 outline-none bg-transparent"
                                placeholder="0,00"
                              />
                            </div>
                          </td>

                          <td className="px-3 sm:px-4 py-2.5 align-middle">
                            <div className="flex items-center rounded-xl border border-slate-300 bg-white px-2 py-1.5 focus-within:border-[#0d6e5a] focus-within:ring-1 focus-within:ring-[#0d6e5a] shadow-2xs">
                              <Clock size={13} className="text-slate-400 mr-1 shrink-0" />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={val.duration}
                                onChange={e =>
                                  handleUpdateSizePrice(
                                    sizeKey,
                                    'duration',
                                    e.target.value.replace(/[^0-9]/g, ''),
                                  )
                                }
                                className="w-full text-xs sm:text-sm font-bold tabular-nums text-slate-900 outline-none bg-transparent text-center"
                                placeholder="60"
                              />
                              <span className="text-[11px] text-slate-500 ml-1 select-none">min</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* FAIXA DE RESUMO */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-teal-50/70 border border-teal-200/60 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-[#0d6e5a] shrink-0" />
                  <span className="text-slate-700">
                    Faixa de preço no catálogo:{' '}
                    <strong className="text-teal-950 font-bold text-sm">
                      {priceRangeSummary.formatted}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-slate-600 text-xs">
                  <span className="flex items-center gap-1">
                    <Clock size={13} className="text-slate-400" />
                    <span>
                      Duração:{' '}
                      <strong className="text-slate-800">
                        {priceRangeSummary.minDuration} a {priceRangeSummary.maxDuration} min
                      </strong>
                    </span>
                  </span>
                  <span className="rounded-full bg-teal-200/70 text-teal-900 font-bold px-2 py-0.5 text-[10px]">
                    5 portes configurados
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 6. COBRANÇA POR PREÇO ÚNICO (QUANDO SINGLE) */}
          {pricingMode === 'SINGLE' && (
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-slate-200 bg-white p-3.5">
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Preço Fixo do Serviço (R$) *
                </span>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-[#0d6e5a] focus-within:ring-1 focus-within:ring-[#0d6e5a]">
                  <span className="text-xs font-bold text-slate-500 mr-1.5 select-none">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={basePrice}
                    onChange={e => setBasePrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                    onBlur={() => {
                      const clean = parseCurrencyInput(basePrice);
                      setBasePrice(clean.toFixed(2).replace('.', ','));
                    }}
                    className="w-full text-sm font-bold text-slate-900 outline-none tabular-nums"
                    placeholder="60,00"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Duração Estimada *
                </span>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-[#0d6e5a] focus-within:ring-1 focus-within:ring-[#0d6e5a]">
                  <Clock size={15} className="text-slate-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={baseDurationMinutes}
                    onChange={e =>
                      setBaseDurationMinutes(Number(e.target.value.replace(/[^0-9]/g, '')) || 60)
                    }
                    className="w-full text-sm font-bold text-slate-900 outline-none tabular-nums"
                    placeholder="60"
                  />
                  <span className="text-xs text-slate-500 ml-2">minutos</span>
                </div>
              </div>
            </div>
          )}

          {/* 7. CONFIGURAÇÕES AVANÇADAS (SANFONA / DETAILS) */}
          <details className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <summary className="flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-50 select-none">
              <div className="flex items-center gap-2">
                <Workflow size={15} className="text-[#0d6e5a]" />
                <span>Opções Avançadas (Etapas na Agenda, Cor, Observações)</span>
              </div>
              <ChevronDown size={14} className="text-slate-400 transition-transform group-open:rotate-180" />
            </summary>

            <div className="p-4 border-t border-slate-100 space-y-4">
              {/* FORMATO COMERCIAL */}
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Formato Comercial
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setServiceType('INDIVIDUAL')}
                    className={`p-3 rounded-xl border text-left cursor-pointer ${
                      serviceType === 'INDIVIDUAL'
                        ? 'border-[#0d6e5a] bg-teal-50/50 font-bold text-[#0d6e5a]'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Serviço Individual Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType('COMBO')}
                    className={`p-3 rounded-xl border text-left cursor-pointer ${
                      serviceType === 'COMBO'
                        ? 'border-purple-600 bg-purple-50/50 font-bold text-purple-700'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    Combo Promocional (Pacote)
                  </button>
                </div>
              </div>

              {/* ETAPAS DO ATENDIMENTO NA AGENDA */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">
                      Etapas do Atendimento na Agenda
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Marque as etapas que se aplicam a este serviço.
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {STAGE_PRESETS.map(preset => {
                      const isCurrent = stagePresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                            isCurrent
                              ? 'bg-teal-700 text-white shadow-2xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid das etapas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {storeStages.map(st => {
                    const isSelected = selectedStages.includes(st.key);
                    const isSystem = st.key === 'checked_in' || st.key === 'ready';
                    const displayName = getStageDisplayName(st.key);

                    return (
                      <div
                        key={st.key}
                        onClick={() => !isSystem && handleToggleStage(st.key)}
                        className={`p-2.5 rounded-xl border transition ${
                          isSystem ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'border-teal-500 bg-teal-50/60 text-teal-900'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold truncate">{displayName}</span>
                          {isSelected && <Check size={13} className="text-teal-700 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* COR NA AGENDA & OBSERVAÇÕES */}
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <span className="block text-xs font-bold text-slate-700 mb-1">Cor na Agenda</span>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
                    <input
                      type="color"
                      className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                    />
                    <span className="text-xs font-mono uppercase text-slate-600 font-semibold">
                      {color}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-8 flex items-center pt-5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={e => setActive(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#0d6e5a]"
                    />
                    <span>Serviço ativo para agendamentos</span>
                  </label>
                </div>

                <div className="sm:col-span-12">
                  <span className="block text-xs font-bold text-slate-700 mb-1">
                    Orientações operacionais / Descrição (opcional)
                  </span>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Instruções aos profissionais do banho & tosa..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#0d6e5a] focus:ring-1 focus:ring-[#0d6e5a] outline-none"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* 8. BOTÕES INFERIORES */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 sm:px-5 sm:py-3.5 backdrop-blur">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0d6e5a] hover:bg-[#0a5747] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  <span>Salvar serviço</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
