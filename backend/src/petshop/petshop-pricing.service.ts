import { Injectable, BadRequestException } from '@nestjs/common';

export interface PetCharacteristics {
  species?: string | null;
  size?: string | null;
  coatType?: string | null;
}

export interface PricingResolutionResult {
  price: number;
  durationMinutes: number;
  matchedRule: any | null;
  ruleHierarchy: 'exact_size_coat' | 'size_only' | 'coat_only' | 'base_service' | 'combo_calculated' | 'combo_rule';
  components?: Array<{
    serviceId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    durationMinutes: number;
  }>;
  baseSum?: number;
  discountAmount?: number;
}

export interface PriceRangeResult {
  minPrice: number;
  maxPrice: number;
  minDuration: number;
  maxDuration: number;
  hasVariants: boolean;
  formattedRange: string;
}

export type PetshopStageKey = string;

export interface PetshopStageItem {
  key: string;
  label: string;
  description?: string;
  isCustom?: boolean;
  isSystem?: boolean;
  color?: string;
  icon?: string;
  order?: number;
  enabled?: boolean;
  trackProfessional?: boolean;
}

export const DEFAULT_STAGE_DEFINITIONS: PetshopStageItem[] = [
  { key: 'checked_in', label: 'Check-in', description: 'Recepção e entrada do pet no estabelecimento', isSystem: true, isCustom: false, color: 'teal', icon: 'login', order: 0 },
  { key: 'bathing', label: 'Banho', description: 'Banho, hidratação e lavagem', isSystem: false, isCustom: false, color: 'sky', icon: 'droplets', order: 1 },
  { key: 'grooming', label: 'Tosa', description: 'Tosa na tesoura, máquina ou tosa higiênica', isSystem: false, isCustom: false, color: 'purple', icon: 'scissors', order: 2 },
  { key: 'finishing', label: 'Finalização', description: 'Secagem, escovação, penteado, perfume e adereços', isSystem: false, isCustom: false, color: 'amber', icon: 'sparkles', order: 3 },
  { key: 'ready', label: 'Pronto', description: 'Pet finalizado aguardando retirada pelo tutor', isSystem: true, isCustom: false, color: 'emerald', icon: 'check', order: 4 },
];

export const ALL_PETSHOP_STAGES: Array<{ key: PetshopStageKey; label: string; description: string }> = [
  { key: 'checked_in', label: 'Check-in', description: 'Recepção e entrada do pet no estabelecimento' },
  { key: 'bathing', label: 'Banho', description: 'Banho, hidratação e lavagem' },
  { key: 'grooming', label: 'Tosa', description: 'Tosa na tesoura, máquina ou tosa higiênica' },
  { key: 'finishing', label: 'Finalização', description: 'Secagem, escovação, penteado, perfume e adereços' },
  { key: 'ready', label: 'Pronto', description: 'Pet finalizado aguardando retirada pelo tutor' },
];

export const BUILTIN_STAGE_KEYS = new Set<string>([
  'checked_in',
  'bathing',
  'grooming',
  'finishing',
  'ready',
]);

export const VALID_STAGE_KEYS = BUILTIN_STAGE_KEYS;

export const DEFAULT_PIPELINE_ORDER: PetshopStageKey[] = [
  'checked_in',
  'bathing',
  'grooming',
  'finishing',
  'ready',
];

const VALID_SIZES = ['mini', 'small', 'medium', 'large', 'giant'];
const VALID_COAT_TYPES = ['short', 'medium', 'long', 'double'];

@Injectable()
export class PetshopPricingService {
  /**
   * Normaliza os atributos do pet para chaves padrão em minúsculo
   */
  normalizeCharacteristics(char?: PetCharacteristics): { species: string; size: string; coatType: string } {
    const rawSpecies = String(char?.species || '').toLowerCase().trim();
    const species = rawSpecies === 'cat' || rawSpecies.includes('gato') || rawSpecies.includes('felin')
      ? 'cat'
      : 'dog';

    const rawSize = String(char?.size || '').toLowerCase().trim();
    let size = 'small';
    if (rawSize.includes('mini')) size = 'mini';
    else if (rawSize.includes('pequeno') || rawSize === 'small' || rawSize === 'p') size = 'small';
    else if (rawSize.includes('médio') || rawSize.includes('medio') || rawSize === 'medium' || rawSize === 'm') size = 'medium';
    else if (rawSize.includes('grande') || rawSize === 'large' || rawSize === 'g') size = 'large';
    else if (rawSize.includes('gigante') || rawSize === 'giant' || rawSize === 'gg') size = 'giant';

    const rawCoat = String(char?.coatType || '').toLowerCase().trim();
    let coatType = 'short';
    if (rawCoat.includes('curt') || rawCoat === 'short') coatType = 'short';
    else if (rawCoat.includes('méd') || rawCoat.includes('med') || rawCoat === 'medium') coatType = 'medium';
    else if (rawCoat.includes('long') || rawCoat === 'long') coatType = 'long';
    else if (rawCoat.includes('dupl') || rawCoat.includes('subpelo') || rawCoat === 'double') coatType = 'double';

    return { species, size, coatType };
  }

  /**
   * Resolve o preço e a duração determinística de um serviço ou combo para um animal específico
   */
  resolvePriceAndDuration(
    service: any,
    char?: PetCharacteristics,
    componentsMap?: Map<string, any>,
  ): PricingResolutionResult {
    const { species, size, coatType } = this.normalizeCharacteristics(char);
    const rules = Array.isArray(service.pricingRules) ? service.pricingRules : [];

    // Se o serviço for um COMBO
    if (service.serviceType === 'COMBO') {
      // 1. Verifica se o combo possui uma regra de precificação explícita cadastrada
      const matchedRule = this.findMatchingPricingRule(rules, species, size, coatType);

      // Resolve os componentes internos para manter transparência e duração
      const componentDetails = this.resolveComboComponents(service, { species, size, coatType }, componentsMap);
      const componentsDurationSum = componentDetails.reduce((acc, c) => acc + c.durationMinutes, 0);
      const componentsPriceSum = componentDetails.reduce((acc, c) => acc + c.totalPrice, 0);

      if (matchedRule) {
        const finalPrice = Number(matchedRule.price);
        const duration = Number(matchedRule.durationMinutes) > 0
          ? Number(matchedRule.durationMinutes)
          : Number(service.durationMinutes) > 0
          ? Number(service.durationMinutes)
          : Math.max(15, componentsDurationSum);

        return {
          price: Math.max(0, finalPrice),
          durationMinutes: duration,
          matchedRule,
          ruleHierarchy: 'combo_rule',
          components: componentDetails,
          baseSum: componentsPriceSum,
          discountAmount: Math.max(0, componentsPriceSum - finalPrice),
        };
      }

      // 2. Sem regra explícita no combo: calcula pela soma dos componentes e regra de desconto
      const pricingType = service.comboPricingType || 'FIXED_PRICE';
      const discountValue = Number(service.comboDiscountValue || 0);
      let calculatedPrice = componentsPriceSum;
      let calculatedDiscount = 0;

      if (pricingType === 'PERCENT_DISCOUNT') {
        const pct = Math.min(100, Math.max(0, discountValue));
        calculatedDiscount = Number(((componentsPriceSum * pct) / 100).toFixed(2));
        calculatedPrice = Math.max(0, componentsPriceSum - calculatedDiscount);
      } else if (pricingType === 'FIXED_DISCOUNT') {
        calculatedDiscount = Math.min(componentsPriceSum, Math.max(0, discountValue));
        calculatedPrice = Math.max(0, componentsPriceSum - calculatedDiscount);
      } else if (pricingType === 'FIXED_PRICE') {
        if (Number(service.price) > 0) {
          calculatedPrice = Number(service.price);
          calculatedDiscount = Math.max(0, componentsPriceSum - calculatedPrice);
        } else {
          calculatedPrice = componentsPriceSum;
          calculatedDiscount = 0;
        }
      }

      // Duração do combo: se foi definida duração personalizada > 0, usa ela; senão usa a soma dos componentes
      const finalDuration = Number(service.durationMinutes) > 0 && service.durationMinutes !== 60
        ? Number(service.durationMinutes)
        : Math.max(15, componentsDurationSum);

      return {
        price: Number(calculatedPrice.toFixed(2)),
        durationMinutes: finalDuration,
        matchedRule: null,
        ruleHierarchy: 'combo_calculated',
        components: componentDetails,
        baseSum: Number(componentsPriceSum.toFixed(2)),
        discountAmount: Number(calculatedDiscount.toFixed(2)),
      };
    }

    // Serviço INDIVIDUAL: aplicação rigorosa da hierarquia determinística
    // 1. Variação específica de porte e pelagem
    const matchSpecies = (r: any) => !r.species || r.species === 'all' || r.species === species;

    const exactRule = rules.find(
      r => matchSpecies(r) && r.size === size && r.coatType === coatType,
    );
    if (exactRule) {
      return {
        price: Number(exactRule.price),
        durationMinutes: Number(exactRule.durationMinutes) > 0
          ? Number(exactRule.durationMinutes)
          : Number(service.durationMinutes || 60),
        matchedRule: exactRule,
        ruleHierarchy: 'exact_size_coat',
      };
    }

    // 2. Variação por porte (com pelagem 'all' ou indefinida)
    const sizeRule = rules.find(
      r => matchSpecies(r) && r.size === size && (!r.coatType || r.coatType === 'all'),
    );
    if (sizeRule) {
      return {
        price: Number(sizeRule.price),
        durationMinutes: Number(sizeRule.durationMinutes) > 0
          ? Number(sizeRule.durationMinutes)
          : Number(service.durationMinutes || 60),
        matchedRule: sizeRule,
        ruleHierarchy: 'size_only',
      };
    }

    // 3. Variação por pelagem (com porte 'all' ou indefinido)
    const coatRule = rules.find(
      r => matchSpecies(r) && (!r.size || r.size === 'all') && r.coatType === coatType,
    );
    if (coatRule) {
      return {
        price: Number(coatRule.price),
        durationMinutes: Number(coatRule.durationMinutes) > 0
          ? Number(coatRule.durationMinutes)
          : Number(service.durationMinutes || 60),
        matchedRule: coatRule,
        ruleHierarchy: 'coat_only',
      };
    }

    // 4. Preço-base válido
    return {
      price: Number(service.price || 0),
      durationMinutes: Number(service.durationMinutes || 60),
      matchedRule: null,
      ruleHierarchy: 'base_service',
    };
  }

  /**
   * Busca a melhor regra de precificação de acordo com a hierarquia
   */
  private findMatchingPricingRule(rules: any[], species: string, size: string, coatType: string) {
    if (!rules || !rules.length) return null;
    const matchSpecies = (r: any) => !r.species || r.species === 'all' || r.species === species;

    // 1. Exato
    const r1 = rules.find(
      r => matchSpecies(r) && r.size === size && r.coatType === coatType,
    );
    if (r1) return r1;

    // 2. Porte
    const r2 = rules.find(
      r => matchSpecies(r) && r.size === size && (!r.coatType || r.coatType === 'all'),
    );
    if (r2) return r2;

    // 3. Pelagem
    const r3 = rules.find(
      r => matchSpecies(r) && (!r.size || r.size === 'all') && r.coatType === coatType,
    );
    if (r3) return r3;

    return null;
  }

  /**
   * Resolve a lista de serviços componentes de um combo
   */
  private resolveComboComponents(
    combo: any,
    char: { species: string; size: string; coatType: string },
    componentsMap?: Map<string, any>,
  ) {
    const items = Array.isArray(combo.comboItems) ? combo.comboItems : [];
    const result: Array<{
      serviceId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      durationMinutes: number;
    }> = [];

    for (const item of items) {
      const rawComp = item.componentService || (componentsMap ? componentsMap.get(item.componentServiceId) : null);
      const qty = Math.max(1, Number(item.quantity || 1));
      if (!rawComp) {
        result.push({
          serviceId: item.componentServiceId,
          name: 'Serviço Componente',
          quantity: qty,
          unitPrice: 0,
          totalPrice: 0,
          durationMinutes: 30 * qty,
        });
        continue;
      }

      // Resolve o preço do componente individual considerando o mesmo pet
      const resolved = this.resolvePriceAndDuration(rawComp, char, componentsMap);
      result.push({
        serviceId: rawComp.id,
        name: rawComp.name,
        quantity: qty,
        unitPrice: resolved.price,
        totalPrice: Number((resolved.price * qty).toFixed(2)),
        durationMinutes: resolved.durationMinutes * qty,
      });
    }

    return result;
  }

  /**
   * Calcula a faixa de preços e durações de um serviço para exibição resumida na listagem
   */
  calculatePriceRange(service: any, componentsMap?: Map<string, any>): PriceRangeResult {
    const rules = Array.isArray(service.pricingRules) ? service.pricingRules : [];
    const prices: number[] = [Number(service.price || 0)];
    const durations: number[] = [Number(service.durationMinutes || 60)];

    // Se possui regras explícitas cadastradas
    if (rules.length > 0) {
      for (const r of rules) {
        prices.push(Number(r.price));
        if (Number(r.durationMinutes) > 0) {
          durations.push(Number(r.durationMinutes));
        }
      }
    } else if (service.serviceType === 'COMBO') {
      // Simula para cada um dos 5 portes padrão para estimar a faixa do combo
      for (const sz of VALID_SIZES) {
        const sim = this.resolvePriceAndDuration(service, { size: sz, coatType: 'short' }, componentsMap);
        prices.push(sim.price);
        durations.push(sim.durationMinutes);
      }
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const hasVariants = minPrice !== maxPrice || rules.length > 0;

    let formattedRange = `R$ ${minPrice.toFixed(2).replace('.', ',')}`;
    if (minPrice !== maxPrice) {
      formattedRange = `A partir de R$ ${minPrice.toFixed(2).replace('.', ',')}`;
    }

    return {
      minPrice,
      maxPrice,
      minDuration,
      maxDuration,
      hasVariants,
      formattedRange,
    };
  }

  /**
   * Valida integridade do combo (impede combos vazios, componentes inexistentes ou combos recursivos)
   */
  validateComboComposition(items: any[], componentsMap: Map<string, any>) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Um combo deve conter pelo menos um serviço individual.');
    }

    const seenIds = new Set<string>();
    for (const item of items) {
      const compId = String(item.componentServiceId || item.serviceId || '').trim();
      if (!compId) {
        throw new BadRequestException('Identificador de serviço inválido no combo.');
      }
      if (seenIds.has(compId)) {
        throw new BadRequestException('Serviço duplicado na composição do combo.');
      }
      seenIds.add(compId);

      const component = componentsMap.get(compId);
      if (!component) {
        throw new BadRequestException(`Serviço componente ID "${compId}" não foi encontrado.`);
      }
      if (component.serviceType === 'COMBO') {
        throw new BadRequestException(
          `O serviço "${component.name}" já é um combo. Não é permitido criar combos dentro de outros combos.`,
        );
      }

      const qty = Number(item.quantity || 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        throw new BadRequestException('A quantidade de cada serviço no combo deve ser entre 1 e 20.');
      }
    }
  }

  /**
   * Retorna a lista padrão de definições de etapas do sistema
   */
  getDefaultStageDefinitions(): PetshopStageItem[] {
    return DEFAULT_STAGE_DEFINITIONS.map(d => ({ ...d }));
  }

  /**
   * Converte qualquer array de etapas (chaves em string ou objetos) em uma lista normalizada de PetshopStageItem
   */
  normalizeStages(stages: any[]): PetshopStageItem[] {
    if (!Array.isArray(stages) || stages.length === 0) {
      return this.getDefaultStageDefinitions();
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
        key = String(raw || '').trim().toLowerCase();
        const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
        label = def?.label || (key.startsWith('custom_') ? key.replace(/^custom_/, '') : key);
        description = def?.description || '';
        isCustom = !BUILTIN_STAGE_KEYS.has(key);
        color = def?.color;
      } else if (typeof raw === 'object' && raw !== null) {
        key = String(raw.key || '').trim().toLowerCase();
        label = String(raw.label || '').trim();
        description = String(raw.description || '').trim();
        isCustom = Boolean(raw.isCustom) || !BUILTIN_STAGE_KEYS.has(key);
        color = raw.color;
        trackProfessional = Boolean(raw.trackProfessional);
        if (!label) {
          const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
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
        isCustom: isCustom || !BUILTIN_STAGE_KEYS.has(key),
        isSystem,
        color: color || (key === 'checked_in' ? 'teal' : key === 'ready' ? 'emerald' : 'indigo'),
        order: idx,
        trackProfessional,
      });
    }

    return result;
  }

  /**
   * Valida array de etapas operacionais configuradas para um serviço ou combo.
   * Regras obrigatórias:
   * 1. Array não vazio contendo chaves válidas (nativas ou custom_*).
   * 2. Deve conter 'checked_in' (início) e 'ready' (conclusão).
   * 3. Deve conter ao menos uma etapa intermediária ('bathing', 'grooming', 'finishing' ou etapa customizada).
   * 4. Não permite chaves duplicadas.
   */
  validateStages(stages: any[]): any[] {
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new BadRequestException('As etapas do atendimento devem ser informadas como um array.');
    }

    const hasObjects = stages.some(s => typeof s === 'object' && s !== null);
    const seen = new Set<string>();
    const normalizedList: PetshopStageItem[] = [];
    const keysList: string[] = [];

    for (let idx = 0; idx < stages.length; idx++) {
      const raw = stages[idx];
      let key = '';
      let label = '';
      let description = '';
      let isCustom = false;
      let color: string | undefined = undefined;
      let trackProfessional = false;

      if (typeof raw === 'string') {
        key = String(raw || '').trim().toLowerCase();
        const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
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
          const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
          label = def?.label || (key.startsWith('custom_') ? key.replace(/^custom_/, '') : key);
        }
      }

      // Validação de formato da chave:
      // Se não for uma das chaves nativas, deve ser uma chave customizada válida (iniciada com custom_ ou com isCustom: true)
      if (!BUILTIN_STAGE_KEYS.has(key)) {
        if (!isCustom) {
          throw new BadRequestException(`Etapa operacional inválida: "${typeof raw === 'object' ? JSON.stringify(raw) : raw}".`);
        }
        if (!/^[a-z0-9_-]{2,60}$/.test(key)) {
          throw new BadRequestException(`Chave da etapa operacional inválida: "${key}".`);
        }
      }

      if (seen.has(key)) {
        throw new BadRequestException(`Etapa operacional duplicada: "${key}".`);
      }
      seen.add(key);

      const isSystem = key === 'checked_in' || key === 'ready';
      normalizedList.push({
        key,
        label: label.slice(0, 60),
        description: description ? description.slice(0, 200) : undefined,
        isCustom: isCustom || !BUILTIN_STAGE_KEYS.has(key),
        isSystem,
        color: color || (key === 'checked_in' ? 'teal' : key === 'ready' ? 'emerald' : 'indigo'),
        order: idx,
        trackProfessional,
      });
      keysList.push(key);
    }

    if (keysList[0] !== 'checked_in') {
      throw new BadRequestException('O fluxo de atendimento deve obrigatoriamente iniciar com "Check-in" (checked_in).');
    }
    if (keysList[keysList.length - 1] !== 'ready') {
      throw new BadRequestException('O fluxo de atendimento deve obrigatoriamente finalizar com "Pronto" (ready).');
    }

    // Deve conter ao menos uma etapa intermediária
    if (keysList.length < 3) {
      throw new BadRequestException('O fluxo de atendimento deve conter ao menos uma etapa intermediária.');
    }

    return hasObjects ? normalizedList : keysList;
  }

  /**
   * Sugere etapas padrão de acordo com o nome e a categoria do serviço.
   */
  suggestStages(name?: string, category?: string): PetshopStageKey[] {
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

  /**
   * Consolida as etapas de múltiplos serviços (ex: combo ou múltiplos itens no agendamento)
   * sem repetir etapas compartilhadas e mantendo a ordenação operacional lógica.
   */
  consolidateStages(servicesStages: any[][]): any[] {
    const stageMap = new Map<string, PetshopStageItem>();
    let hasObjects = false;

    for (const list of servicesStages) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === 'object' && item !== null) {
          hasObjects = true;
          const key = String(item.key || '').trim().toLowerCase();
          if (key && !stageMap.has(key)) {
            stageMap.set(key, {
              key,
              label: item.label || key,
              description: item.description,
              isCustom: item.isCustom,
              color: item.color,
            });
          }
        } else if (typeof item === 'string') {
          const key = item.trim().toLowerCase();
          if (key && !stageMap.has(key)) {
            const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === key);
            stageMap.set(key, {
              key,
              label: def?.label || key,
              description: def?.description,
              isCustom: !BUILTIN_STAGE_KEYS.has(key),
              color: def?.color,
            });
          }
        }
      }
    }

    // Garante checked_in e ready
    if (!stageMap.has('checked_in')) {
      const def = DEFAULT_STAGE_DEFINITIONS[0];
      stageMap.set('checked_in', { ...def });
    }
    if (!stageMap.has('ready')) {
      const def = DEFAULT_STAGE_DEFINITIONS[4];
      stageMap.set('ready', { ...def });
    }

    // Se não tiver intermediária, adiciona finishing
    const intermediateKeys = Array.from(stageMap.keys()).filter(k => k !== 'checked_in' && k !== 'ready');
    if (intermediateKeys.length === 0) {
      const def = DEFAULT_STAGE_DEFINITIONS[3]; // finishing
      stageMap.set('finishing', { ...def });
    }

    // Ordenação do pipeline:
    const sortedKeys: string[] = ['checked_in'];
    const standardIntermediateOrder = ['bathing', 'grooming', 'finishing'];
    for (const std of standardIntermediateOrder) {
      if (stageMap.has(std)) sortedKeys.push(std);
    }
    for (const key of stageMap.keys()) {
      if (!sortedKeys.includes(key) && key !== 'ready') {
        sortedKeys.push(key);
      }
    }
    sortedKeys.push('ready');

    if (hasObjects) {
      return sortedKeys.map(k => stageMap.get(k)!);
    }
    return sortedKeys;
  }

  /**
   * Resolve as etapas de um agendamento específico.
   * Se já possui snapshot em customStages, respeita o snapshot (imutabilidade para atendimentos passados/em andamento).
   * Senão, consolida a partir dos serviços contratados.
   */
  resolveAppointmentStages(appointment: any): any[] {
    if (!appointment) return [...DEFAULT_PIPELINE_ORDER];

    // 1. Snapshot salvo diretamente no agendamento
    if (Array.isArray(appointment.customStages) && appointment.customStages.length > 0) {
      try {
        return this.validateStages(appointment.customStages);
      } catch {
        // se inválido por algum motivo, recalcula
      }
    }

    // 2. Extrai das relações de serviços do agendamento
    const services = Array.isArray(appointment.services) ? appointment.services : [];
    if (services.length > 0) {
      const stagesLists: any[][] = [];
      for (const item of services) {
        if (item.service?.customStages && Array.isArray(item.service.customStages) && item.service.customStages.length > 0) {
          try {
            stagesLists.push(this.validateStages(item.service.customStages));
            continue;
          } catch {
            // fallback para sugestão
          }
        }
        const svcName = item.service?.name || item.nameSnapshot || '';
        const svcCat = item.service?.category || '';
        stagesLists.push(this.suggestStages(svcName, svcCat));
      }

      if (stagesLists.length > 0) {
        return this.consolidateStages(stagesLists);
      }
    }

    return [...DEFAULT_PIPELINE_ORDER];
  }

  /**
   * Identifica quais etapas foram puladas entre o status atual e o novo status alvo
   */
  getSkippedStages(currentStatus: string, nextStatus: string, stages: any[]): any[] {
    const keys = stages.map(s => (typeof s === 'string' ? s : s.key));
    const currIdx = keys.indexOf(currentStatus);
    const nextIdx = keys.indexOf(nextStatus);

    if (currIdx !== -1 && nextIdx !== -1 && nextIdx > currIdx + 1) {
      return stages.slice(currIdx + 1, nextIdx);
    }
    return [];
  }
}
