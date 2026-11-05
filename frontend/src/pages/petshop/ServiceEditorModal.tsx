import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import {
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
  LogIn,
  Droplets,
  CheckCircle2,
  ListChecks,
  Pencil,
  RotateCcw,
  Workflow,
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
  mini: { price: '45.00', duration: '40' },
  small: { price: '55.00', duration: '45' },
  medium: { price: '70.00', duration: '60' },
  large: { price: '85.00', duration: '75' },
  giant: { price: '110.00', duration: '90' },
};

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

  // Precificação
  const [pricingMode, setPricingMode] = useState<'BY_SIZE' | 'SINGLE'>('BY_SIZE');
  const [basePrice, setBasePrice] = useState('60');
  const [baseDurationMinutes, setBaseDurationMinutes] = useState(60);
  const [quickBaseRef, setQuickBaseRef] = useState('60');
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
          setDescription(s.description || '');
          setBasePrice(String(s.price || '60'));
          setQuickBaseRef(String(s.price || '60'));
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
                  loadedSizes[r.size] = {
                    price: String(r.price || '0'),
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
                  price: String(r.price || '0'),
                  durationMinutes: r.durationMinutes ? String(r.durationMinutes) : '',
                  label: r.label || '',
                })),
              );
            } else {
              setCoatRules([]);
            }
          } else {
            // Sem regras prévias: serviços de estética iniciam como BY_SIZE com sugestões inteligentes
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
                mini: { price: (baseNum * 0.75).toFixed(2), duration: String(Math.max(20, Math.round(baseDur * 0.7))) },
                small: { price: (baseNum * 0.9).toFixed(2), duration: String(Math.max(25, Math.round(baseDur * 0.85))) },
                medium: { price: (baseNum * 1.0).toFixed(2), duration: String(baseDur) },
                large: { price: (baseNum * 1.3).toFixed(2), duration: String(Math.round(baseDur * 1.25)) },
                giant: { price: (baseNum * 1.7).toFixed(2), duration: String(Math.round(baseDur * 1.5)) },
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
      setTargetSpecies('all');
      setColor('#0d9488');
      setDescription('');
      setPricingMode('BY_SIZE');
      setBasePrice('60');
      setQuickBaseRef('60');
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

  // Lista de serviços elegíveis para serem componentes (apenas INDIVIDUAL e que não sejam o próprio serviço)
  const eligibleServicesForCombo = useMemo(() => {
    return existingServices.filter(
      s => s.serviceType !== 'COMBO' && s.id !== serviceId && s.active,
    );
  }, [existingServices, serviceId]);

  // Cálculos em tempo real para combos
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
      finalPrice = Math.max(0, Number(basePrice) || 0);
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

  // Resumo de preços por porte para feedback visual
  const priceRangeSummary = useMemo(() => {
    if (pricingMode === 'SINGLE') {
      return {
        min: Number(basePrice) || 0,
        max: Number(basePrice) || 0,
        formatted: money(Number(basePrice) || 0),
        minDuration: baseDurationMinutes,
        maxDuration: baseDurationMinutes,
      };
    }

    const prices = Object.values(sizePrices).map(p => Number(p.price) || 0);
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

  // Atualização de um porte específico
  const handleUpdateSizePrice = (sizeKey: string, field: 'price' | 'duration', val: string) => {
    setSizePrices(prev => ({
      ...prev,
      [sizeKey]: {
        ...prev[sizeKey],
        [field]: val,
      },
    }));
  };

  // Auto-cálculo inteligente proporcional
  const handleAutoCalculateSizes = () => {
    const base = Number(quickBaseRef) || 60;
    const baseDur = Number(baseDurationMinutes) || 60;

    setSizePrices({
      mini: { price: (base * 0.75).toFixed(2), duration: String(Math.max(20, Math.round(baseDur * 0.65))) },
      small: { price: (base * 0.9).toFixed(2), duration: String(Math.max(25, Math.round(baseDur * 0.8))) },
      medium: { price: (base * 1.0).toFixed(2), duration: String(baseDur) },
      large: { price: (base * 1.3).toFixed(2), duration: String(Math.round(baseDur * 1.25)) },
      giant: { price: (base * 1.7).toFixed(2), duration: String(Math.round(baseDur * 1.5)) },
    });

    toast.success('Valores e tempos dos 5 portes sugeridos com sucesso!');
  };

  // Gerenciamento de componentes do combo
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

  // Regras avançadas de pelagem
  const handleAddCoatRule = () => {
    setCoatRules(prev => [
      ...prev,
      {
        species: targetSpecies,
        size: 'medium',
        coatType: 'long',
        price: String(Number(sizePrices.medium?.price || basePrice || 70) + 15),
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

  // Gerenciamento de Etapas Operacionais
  const handleNameChange = (newName: string) => {
    setName(newName);
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
        if (Number(basePrice) < 0 || isNaN(Number(basePrice))) {
          toast.error('Informe um preço base válido.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      let finalPrice = Number(basePrice) || 60;
      let finalDuration = Number(baseDurationMinutes) || 60;

      if (serviceType === 'COMBO') {
        finalPrice = comboPricingType !== 'FIXED_PRICE' ? comboSummary.finalPrice : Number(basePrice);
        finalDuration = autoCalculateDuration ? comboSummary.duration : Number(customComboDuration);
      } else if (pricingMode === 'BY_SIZE') {
        finalPrice = Number(sizePrices.medium?.price || sizePrices.small?.price || 60);
        finalDuration = Number(sizePrices.medium?.duration || sizePrices.small?.duration || 60);
      }

      const payload: any = {
        name: name.trim(),
        description: description.trim(),
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
            price: Math.max(0, Number(sizePrices[s.id]?.price || 0)),
            durationMinutes: Math.max(5, Number(sizePrices[s.id]?.duration || 60)),
            label: s.label,
          }));

          // Inclui também regras avançadas de pelagem se houver
          if (coatRules.length > 0) {
            for (const cr of coatRules) {
              rules.push({
                species: cr.species || targetSpecies,
                size: cr.size,
                coatType: cr.coatType,
                price: Math.max(0, Number(cr.price || 0)),
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

  return (
    <Modal
      title={serviceId ? 'Editar Serviço / Combo' : 'Novo Serviço / Combo'}
      onClose={onClose}
      maxWidth="sm:max-w-4xl"
    >
      {loadingDetails ? (
        <div className="py-20 text-center text-xs text-slate-500 animate-pulse">
          Carregando informações do serviço...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SELETOR DE FORMATO COMERCIAL */}
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Formato Comercial da Oferta
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setServiceType('INDIVIDUAL');
                  setActiveTab('pricing');
                }}
                className={`flex items-start gap-3.5 rounded-2xl p-4 text-left transition border ${
                  serviceType === 'INDIVIDUAL'
                    ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    serviceType === 'INDIVIDUAL'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Scissors size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-slate-900">Serviço Individual</strong>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Padrão
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Banho, tosa, hidratação ou unhas com preços e tempos calculados por porte do pet.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setServiceType('COMBO');
                  setActiveTab('combo');
                }}
                className={`flex items-start gap-3.5 rounded-2xl p-4 text-left transition border ${
                  serviceType === 'COMBO'
                    ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    serviceType === 'COMBO'
                      ? 'bg-purple-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Layers size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-slate-900">Combo Promocional</strong>
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                      Mais Vendas
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Pacote comercial agrupando 2 ou mais serviços individuais com desconto promocional.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* INFORMAÇÕES BÁSICAS DO SERVIÇO */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Dados Gerais do Serviço
            </span>

            <div className="grid gap-4 sm:grid-cols-12">
              <label className="sm:col-span-6">
                <span className={labelClass}>
                  {serviceType === 'COMBO' ? 'Nome do Combo *' : 'Nome do Serviço *'}
                </span>
                <input
                  required
                  className={inputClass}
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder={
                    serviceType === 'COMBO'
                      ? 'Ex.: Combo Spa Relaxante (Banho + Tosa + Hidratação)'
                      : 'Ex.: Banho Tradicional'
                  }
                />
              </label>

              <label className="sm:col-span-3">
                <span className={labelClass}>Categoria *</span>
                <select
                  value={category}
                  onChange={e => handleCategoryChange(e.target.value)}
                  className={inputClass}
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sm:col-span-3">
                <span className={labelClass}>Público-alvo *</span>
                <select
                  value={targetSpecies}
                  onChange={e => setTargetSpecies(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">Cães e Gatos</option>
                  <option value="dog">Apenas Cães</option>
                  <option value="cat">Apenas Gatos</option>
                </select>
              </label>
            </div>
          </div>

          {/* ETAPAS OPERACIONAIS DO ATENDIMENTO */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ListChecks size={18} className="text-teal-700 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Etapas do Atendimento
                  </span>
                  <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    {selectedStages.length} etapas ativas
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Selecione quais etapas se aplicam a este serviço. Você também pode renomear qualquer etapa ou adicionar uma etapa exclusiva.
                </p>
              </div>

              {/* Presets Rápidos e Botão de Nova Etapa */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 mr-0.5">Padrões:</span>
                  {STAGE_PRESETS.map(preset => {
                    const isCurrent = stagePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                          isCurrent
                            ? 'bg-teal-700 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={preset.description}
                      >
                        {isCurrent && <Check size={12} />}
                        <span>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddCustomStage(prev => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 transition cursor-pointer ml-auto sm:ml-0"
                >
                  <Plus size={13} />
                  <span>Nova Etapa</span>
                </button>
              </div>
            </div>

            {/* Formulário Inline de Nova Etapa Customizada */}
            {showAddCustomStage && (
              <form
                onSubmit={handleAddInlineCustomStage}
                className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 p-4 space-y-3 animate-in fade-in"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-teal-700" />
                    Adicionar Etapa Personalizada a este Serviço
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomStage(false)}
                    className="text-zinc-400 hover:text-zinc-600 text-xs"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Nome da Etapa *
                    </label>
                    <input
                      type="text"
                      value={newCustomStageName}
                      onChange={e => setNewCustomStageName(e.target.value)}
                      placeholder="Ex: Secador e Soprador, Ozônio, Unhas..."
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Onde deve entrar no fluxo?
                    </label>
                    <select
                      value={newCustomStagePos}
                      onChange={e => setNewCustomStagePos(e.target.value as any)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="after_bathing">Após o Banho</option>
                      <option value="after_grooming">Após a Tosa</option>
                      <option value="before_ready">Antes de Pronto / Final</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Descrição Curta (opcional)
                  </label>
                  <input
                    type="text"
                    value={newCustomStageDesc}
                    onChange={e => setNewCustomStageDesc(e.target.value)}
                    placeholder="Ex: Secagem profunda e remoção de nós"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddCustomStage(false)}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800 shadow-xs"
                  >
                    Incluir Etapa
                  </button>
                </div>
              </form>
            )}

            {/* Grid Dinâmico de Todas as Etapas da Loja e Customizadas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {storeStages.map((st, idx) => {
                const isSelected = selectedStages.includes(st.key);
                const isSystem = st.key === 'checked_in' || st.key === 'ready';
                const displayName = getStageDisplayName(st.key);
                const isEditingThis = editingStageKey === st.key;
                const isCustom = st.isCustom || st.key.startsWith('custom_');

                const getIcon = () => {
                  if (st.key === 'checked_in') return <LogIn size={15} className="text-teal-700" />;
                  if (st.key === 'bathing') return <Droplets size={15} className={isSelected ? 'text-sky-700' : 'text-slate-500'} />;
                  if (st.key === 'grooming') return <Scissors size={15} className={isSelected ? 'text-purple-700' : 'text-slate-500'} />;
                  if (st.key === 'finishing') return <Sparkles size={15} className={isSelected ? 'text-amber-700' : 'text-slate-500'} />;
                  if (st.key === 'ready') return <CheckCircle2 size={15} className="text-emerald-700" />;
                  return <Workflow size={15} className={isSelected ? 'text-indigo-700' : 'text-slate-500'} />;
                };

                // Check-in (Início)
                if (st.key === 'checked_in') {
                  return (
                    <div
                      key={st.key}
                      className="flex flex-col justify-between rounded-xl border border-teal-200 bg-teal-50/50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getIcon()}
                          {isEditingThis ? (
                            <input
                              type="text"
                              value={editingStageInput}
                              onChange={e => setEditingStageInput(e.target.value)}
                              className="w-24 rounded border border-teal-300 bg-white px-1.5 py-0.5 text-xs font-bold text-teal-950 focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span className="text-xs font-bold text-teal-950 truncate" title={displayName}>
                              1. {displayName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isEditingThis ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveRenameStage(st.key)}
                                className="text-[10px] font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 px-1 py-0.5 rounded cursor-pointer"
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStageKey(null)}
                                className="text-[10px] text-zinc-400 hover:text-zinc-600 px-0.5"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartRenameStage(st.key)}
                                className="text-zinc-400 hover:text-teal-700 transition p-0.5 cursor-pointer"
                                title="Alterar nome desta etapa"
                              >
                                <Pencil size={11} />
                              </button>
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                                Início
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-teal-800 mt-1 truncate">
                        {st.description || 'Recepção do pet na loja'}
                      </p>
                      <div className="mt-2 text-[10px] font-semibold text-teal-600 flex items-center gap-1">
                        <Check size={11} /> Sempre ativo
                      </div>
                    </div>
                  );
                }

                // Pronto (Fim)
                if (st.key === 'ready') {
                  return (
                    <div
                      key={st.key}
                      className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getIcon()}
                          {isEditingThis ? (
                            <input
                              type="text"
                              value={editingStageInput}
                              onChange={e => setEditingStageInput(e.target.value)}
                              className="w-24 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-xs font-bold text-emerald-950 focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span className="text-xs font-bold text-emerald-950 truncate" title={displayName}>
                              {displayName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isEditingThis ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveRenameStage(st.key)}
                                className="text-[10px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1 py-0.5 rounded cursor-pointer"
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStageKey(null)}
                                className="text-[10px] text-zinc-400 hover:text-zinc-600 px-0.5"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartRenameStage(st.key)}
                                className="text-zinc-400 hover:text-emerald-700 transition p-0.5 cursor-pointer"
                                title="Alterar nome desta etapa"
                              >
                                <Pencil size={11} />
                              </button>
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                Fim
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-emerald-800 mt-1 truncate">
                        {st.description || 'Avisar tutor p/ buscar'}
                      </p>
                      <div className="mt-2 text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Check size={11} /> Sempre ativo
                      </div>
                    </div>
                  );
                }

                // Etapas Intermediárias (Banho, Tosa, Finalização ou Customizadas)
                const cardBorder = isSelected
                  ? isCustom
                    ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-300'
                    : st.key === 'bathing'
                    ? 'border-sky-300 bg-sky-50/60 ring-1 ring-sky-300'
                    : st.key === 'grooming'
                    ? 'border-purple-300 bg-purple-50/60 ring-1 ring-purple-300'
                    : 'border-amber-300 bg-amber-50/60 ring-1 ring-amber-300'
                  : 'border-slate-200 bg-slate-50/50 opacity-60 hover:opacity-100';

                return (
                  <div
                    key={st.key}
                    className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${cardBorder}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {getIcon()}
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={editingStageInput}
                            onChange={e => setEditingStageInput(e.target.value)}
                            className="w-24 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-bold text-zinc-900 focus:outline-none"
                            autoFocus
                          />
                        ) : (
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-zinc-900' : 'text-slate-600'}`} title={displayName}>
                            {displayName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isEditingThis ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveRenameStage(st.key)}
                              className="text-[10px] font-bold text-teal-800 bg-teal-100 hover:bg-teal-200 px-1 py-0.5 rounded cursor-pointer"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStageKey(null)}
                              className="text-[10px] text-zinc-400 hover:text-zinc-600 px-0.5"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartRenameStage(st.key)}
                              className="text-zinc-400 hover:text-zinc-700 transition p-0.5 cursor-pointer"
                              title="Alterar nome desta etapa neste serviço"
                            >
                              <Pencil size={11} />
                            </button>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomStage(st.key)}
                                className="text-rose-400 hover:text-rose-600 transition p-0.5 cursor-pointer"
                                title="Remover esta etapa customizada deste serviço"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? isCustom
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : st.key === 'bathing'
                                    ? 'bg-sky-100 text-sky-800'
                                    : st.key === 'grooming'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {isSelected ? 'Ativo' : 'Omitido'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      {st.description || (st.key === 'bathing' ? 'Lavagem e secagem' : st.key === 'grooming' ? 'Máquina ou tesoura' : st.key === 'finishing' ? 'Perfume e adereços' : 'Etapa operacional')}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleToggleStage(st.key)}
                      className={`mt-2 text-[10px] font-semibold text-left transition cursor-pointer ${
                        isSelected
                          ? isCustom
                            ? 'text-indigo-700 hover:text-indigo-900'
                            : st.key === 'bathing'
                            ? 'text-sky-700 hover:text-sky-900'
                            : st.key === 'grooming'
                            ? 'text-purple-700 hover:text-purple-900'
                            : 'text-amber-700 hover:text-amber-900'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {isSelected ? '✓ Incluído no fluxo (clique p/ omitir)' : '+ Clique p/ incluir no fluxo'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Régua visual do fluxo resultante */}
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5">
              <span className="text-xs font-bold text-slate-600 shrink-0">
                Sequência deste Serviço na Agenda:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedStages.map((stageKey, sIdx) => {
                  const label = getStageDisplayName(stageKey);
                  return (
                    <React.Fragment key={stageKey}>
                      {sIdx > 0 && <ArrowRight size={13} className="text-slate-400" />}
                      <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs">
                        <span className="text-[10px] text-teal-700 font-extrabold">{sIdx + 1}.</span>
                        {label}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ABA / SEÇÃO DE PRECIFICAÇÃO PARA SERVIÇO INDIVIDUAL */}
          {serviceType === 'INDIVIDUAL' && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/20 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-teal-100 pb-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-950 block">
                    Modelo de Cobrança do Banho & Tosa
                  </span>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Defina se o valor é calculado automaticamente pelo porte do pet ou se tem preço fixo.
                  </p>
                </div>

                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setPricingMode('BY_SIZE')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      pricingMode === 'BY_SIZE'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PawPrint size={14} />
                    <span>Preço por Porte do Pet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode('SINGLE')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      pricingMode === 'SINGLE'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <DollarSign size={14} />
                    <span>Preço Fixo Único</span>
                  </button>
                </div>
              </div>

              {/* COBRANÇA POR PORTE (PADRÃO PROFISSIONAL) */}
              {pricingMode === 'BY_SIZE' && (
                <div className="space-y-4 pt-1">
                  {/* BARRA DE AUTO-CÁLCULO RÁPIDO */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-teal-700 shrink-0" />
                      <p className="text-xs text-teal-950 font-medium">
                        Preencha um valor base para auto-escalonar os 5 portes proporcionalmente:
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 bg-white border border-teal-300 rounded-lg px-2.5 py-1">
                        <span className="text-xs font-bold text-slate-500">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={quickBaseRef}
                          onChange={e => setQuickBaseRef(e.target.value)}
                          className="w-16 text-xs font-bold text-slate-900 outline-none"
                          placeholder="60.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoCalculateSizes}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer shadow-xs"
                      >
                        <Wand2 size={13} />
                        Auto-calcular Portes
                      </button>
                    </div>
                  </div>

                  {/* TABELA ESPAÇOSA E LIMPA DOS 5 PORTES */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          <th className="px-4 py-3">Porte & Categoria</th>
                          <th className="px-4 py-3 w-44">Preço de Venda (R$)</th>
                          <th className="px-4 py-3 w-36">Duração Estimada</th>
                          <th className="px-4 py-3 hidden md:table-cell text-slate-400">Exemplos / Raças</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {SIZES_DEFINITION.map(sizeDef => {
                          const sizeKey = sizeDef.id;
                          const val = sizePrices[sizeKey] || { price: '0', duration: '60' };

                          return (
                            <tr key={sizeKey} className="hover:bg-slate-50/50 transition-colors">
                              {/* COLUNA 1: IDENTIFICAÇÃO DO PORTE */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`inline-flex h-7 w-10 items-center justify-center rounded-md border text-[11px] font-bold ${sizeDef.badgeColor}`}
                                  >
                                    {sizeDef.short}
                                  </span>
                                  <div>
                                    <strong className="block font-bold text-slate-900">
                                      {sizeDef.label}
                                    </strong>
                                    <span className="text-[11px] text-slate-500 md:hidden block">
                                      {sizeDef.weightHint}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* COLUNA 2: PREÇO */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
                                  <span className="text-xs font-bold text-slate-500 mr-1.5 select-none">
                                    R$
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={val.price}
                                    onChange={e => handleUpdateSizePrice(sizeKey, 'price', e.target.value)}
                                    className="w-full text-xs font-bold tabular-nums text-slate-900 outline-none"
                                    placeholder="0,00"
                                  />
                                </div>
                              </td>

                              {/* COLUNA 3: DURAÇÃO */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
                                  <Clock size={14} className="text-slate-400 mr-1.5 shrink-0" />
                                  <input
                                    type="number"
                                    min={5}
                                    max={720}
                                    value={val.duration}
                                    onChange={e => handleUpdateSizePrice(sizeKey, 'duration', e.target.value)}
                                    className="w-full text-xs font-bold tabular-nums text-slate-900 outline-none"
                                    placeholder="60"
                                  />
                                  <span className="text-[11px] text-slate-500 ml-1 select-none">min</span>
                                </div>
                              </td>

                              {/* COLUNA 4: DICA DE RAÇA E PESO */}
                              <td className="px-4 py-3.5 hidden md:table-cell text-[11px] text-slate-500 leading-tight">
                                {sizeDef.weightHint}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* FAIXA DE RESUMO DA OFERTA */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-teal-50 border border-teal-200/70 p-3.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Tag size={15} className="text-teal-700 shrink-0" />
                      <span className="text-slate-700">
                        Faixa de preço no catálogo:{' '}
                        <strong className="text-teal-950 font-bold text-sm">
                          {priceRangeSummary.formatted}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-slate-600 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-slate-400" />
                        <span>
                          Duração:{' '}
                          <strong className="text-slate-800">
                            {priceRangeSummary.minDuration} a {priceRangeSummary.maxDuration} min
                          </strong>
                        </span>
                      </span>
                      <span className="rounded-full bg-teal-200/60 text-teal-900 font-semibold px-2 py-0.5 text-[10px]">
                        5 portes configurados
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* COBRANÇA POR PREÇO ÚNICO */}
              {pricingMode === 'SINGLE' && (
                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <label>
                    <span className={labelClass}>Preço Fixo do Serviço (R$) *</span>
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
                      <span className="text-xs font-bold text-slate-500 mr-2">R$</span>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min={0}
                        value={basePrice}
                        onChange={e => setBasePrice(e.target.value)}
                        className="w-full text-sm font-bold text-slate-900 outline-none"
                        placeholder="60.00"
                      />
                    </div>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Valor único cobrado para qualquer animal independente do porte.
                    </span>
                  </label>

                  <label>
                    <span className={labelClass}>Duração Estimada (minutos) *</span>
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-teal-600 focus-within:ring-1 focus-within:ring-teal-600">
                      <Clock size={15} className="text-slate-400 mr-2" />
                      <input
                        required
                        type="number"
                        min={5}
                        max={720}
                        value={baseDurationMinutes}
                        onChange={e => setBaseDurationMinutes(Number(e.target.value))}
                        className="w-full text-sm font-bold text-slate-900 outline-none"
                        placeholder="60"
                      />
                      <span className="text-xs text-slate-500 ml-2">minutos</span>
                    </div>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      Tempo padrão de bloqueio na agenda de atendimento.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ABA / SEÇÃO DE COMPOSIÇÃO DE COMBO */}
          {serviceType === 'COMBO' && (
            <div className="rounded-2xl border border-purple-200 bg-purple-50/20 p-5 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-950 block border-b border-purple-100 pb-2">
                Composição dos Serviços Inclusos no Combo
              </span>

              {/* SELETOR DE COMPONENTES */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-white p-3.5 rounded-xl border border-purple-200/80">
                <div className="flex-1">
                  <span className={labelClass}>Selecione um serviço individual para incluir:</span>
                  <select
                    value={selectedComponentToAdd}
                    onChange={e => setSelectedComponentToAdd(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Escolha um serviço do catálogo --</option>
                    {eligibleServicesForCombo.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({money(Number(s.price || 0))})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAddComponent}
                  disabled={!selectedComponentToAdd}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50 transition cursor-pointer shadow-xs"
                >
                  <Plus size={16} />
                  Incluir no Combo
                </button>
              </div>

              {/* LISTA DE ITENS INCLUÍDOS */}
              <div className="space-y-2">
                {comboComponents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                    Nenhum serviço adicionado ainda. Escolha os serviços acima para compor este combo promocional.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-600">
                          <th className="px-4 py-2.5">Serviço Componente</th>
                          <th className="px-4 py-2.5 w-32 text-center">Quantidade</th>
                          <th className="px-4 py-2.5 w-32 text-right">Subtotal Avulso</th>
                          <th className="px-4 py-2.5 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comboComponents.map(ci => {
                          const item = existingServices.find(s => s.id === ci.componentServiceId);
                          const subtotal = Number(item?.price || 0) * ci.quantity;

                          return (
                            <tr key={ci.componentServiceId}>
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                {item?.name || 'Serviço'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="inline-flex items-center gap-2 border border-slate-300 rounded-lg px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateComponentQty(ci.componentServiceId, -1)}
                                    className="text-slate-500 hover:text-slate-900 font-bold px-1"
                                  >
                                    -
                                  </button>
                                  <span className="font-bold text-slate-800 w-4 text-center">
                                    {ci.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateComponentQty(ci.componentServiceId, 1)}
                                    className="text-slate-500 hover:text-slate-900 font-bold px-1"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">
                                {money(subtotal)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveComponent(ci.componentServiceId)}
                                  className="text-slate-400 hover:text-rose-600 transition"
                                  title="Remover do combo"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* REGRAS DE PREÇO DO COMBO */}
              {comboComponents.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-purple-100">
                  <div>
                    <span className={labelClass}>Estratégia de Desconto do Combo</span>
                    <select
                      value={comboPricingType}
                      onChange={e => setComboPricingType(e.target.value as any)}
                      className={inputClass}
                    >
                      <option value="PERCENT_DISCOUNT">Desconto Percentual (%) sobre os serviços</option>
                      <option value="FIXED_DISCOUNT">Desconto Fixo em Reais (R$)</option>
                      <option value="FIXED_PRICE">Preço Fechado Promocional (R$)</option>
                    </select>
                  </div>

                  <div>
                    <span className={labelClass}>
                      {comboPricingType === 'PERCENT_DISCOUNT'
                        ? 'Percentual de Desconto (%) *'
                        : comboPricingType === 'FIXED_DISCOUNT'
                        ? 'Valor do Desconto (R$) *'
                        : 'Valor Final do Combo (R$) *'}
                    </span>
                    <input
                      type="number"
                      step={comboPricingType === 'PERCENT_DISCOUNT' ? '1' : '0.01'}
                      min={0}
                      value={
                        comboPricingType === 'FIXED_PRICE'
                          ? basePrice
                          : comboDiscountValue
                      }
                      onChange={e => {
                        if (comboPricingType === 'FIXED_PRICE') {
                          setBasePrice(e.target.value);
                        } else {
                          setComboDiscountValue(e.target.value);
                        }
                      }}
                      className={inputClass}
                      placeholder={comboPricingType === 'PERCENT_DISCOUNT' ? '15' : '20.00'}
                    />
                  </div>
                </div>
              )}

              {/* CARD DE RESUMO FINANCEIRO DO COMBO */}
              {comboComponents.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-white p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Soma dos serviços avulsos:</span>
                    <span className="font-semibold text-slate-700 line-through tabular-nums">
                      {money(comboSummary.rawTotal)}
                    </span>
                  </div>

                  {comboSummary.discount > 0 && (
                    <div className="flex items-center justify-between text-xs text-emerald-700">
                      <span className="font-medium">Economia gerada para o cliente:</span>
                      <span className="font-bold tabular-nums">
                        - {money(comboSummary.discount)}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Preço Final do Combo
                      </span>
                      <strong className="text-xl font-bold text-purple-900 tabular-nums">
                        {money(comboSummary.finalPrice)}
                      </strong>
                    </div>

                    <div className="text-right text-xs text-slate-500">
                      <span>Duração estimada total:</span>
                      <strong className="block text-slate-900 font-bold">
                        {comboSummary.duration} minutos
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONFIGURAÇÕES OPERACIONAIS (STATUS, COR E DESCRIÇÃO) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Configurações Operacionais & Visualização
            </span>

            <div className="grid gap-4 sm:grid-cols-12">
              <label className="sm:col-span-4">
                <span className={labelClass}>Cor na Agenda</span>
                <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3">
                  <input
                    type="color"
                    className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                  />
                  <span className="text-xs font-mono uppercase text-slate-600 font-semibold">
                    {color}
                  </span>
                </div>
              </label>

              <div className="sm:col-span-8 flex items-center">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-700"
                  />
                  <span>Serviço Ativo (disponível para agendamentos e recepção)</span>
                </label>
              </div>

              <label className="sm:col-span-12">
                <span className={labelClass}>Descrição e Orientações Operacionais (Opcional)</span>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Orientações aos profissionais do banho & tosa ou detalhes visíveis no comprovante do tutor."
                />
              </label>
            </div>
          </div>

          {/* RODAPÉ DO MODAL (AÇÕES) */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className={secondaryButton}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={primaryButton}
            >
              <Check size={16} />
              <span>
                {saving
                  ? 'Salvando...'
                  : serviceId
                  ? 'Salvar Alterações'
                  : serviceType === 'COMBO'
                  ? 'Criar Combo Promocional'
                  : 'Cadastrar Serviço'}
              </span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
