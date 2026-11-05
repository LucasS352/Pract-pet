import { Test, TestingModule } from '@nestjs/testing';
import { PetshopPricingService } from './petshop-pricing.service';
import { BadRequestException } from '@nestjs/common';

describe('PetshopPricingService - Serviços & Combos', () => {
  let pricing: PetshopPricingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PetshopPricingService],
    }).compile();

    pricing = module.get<PetshopPricingService>(PetshopPricingService);
  });

  describe('1. Normalização de Características', () => {
    it('deve normalizar cães e gatos com portes e pelagens padrão', () => {
      const dog = pricing.normalizeCharacteristics({
        species: 'canino',
        size: 'Grande',
        coatType: 'Longo',
      });
      expect(dog).toEqual({ species: 'dog', size: 'large', coatType: 'long' });

      const cat = pricing.normalizeCharacteristics({
        species: 'Gato',
        size: 'Mini',
        coatType: 'Curto',
      });
      expect(cat).toEqual({ species: 'cat', size: 'mini', coatType: 'short' });
    });
  });

  describe('2. Precificação Inteligente de Serviços Individuais', () => {
    const banhoService = {
      id: 'svc-banho',
      name: 'Banho',
      serviceType: 'INDIVIDUAL',
      price: 50.0,
      durationMinutes: 45,
      pricingRules: [
        {
          id: 'r1',
          species: 'dog',
          size: 'small',
          coatType: 'short',
          price: 55.0,
          durationMinutes: 40,
        },
        {
          id: 'r2',
          species: 'dog',
          size: 'small',
          coatType: 'long',
          price: 65.0,
          durationMinutes: 50,
        },
        {
          id: 'r3',
          species: 'dog',
          size: 'large',
          coatType: 'all',
          price: 85.0,
          durationMinutes: 70,
        },
        {
          id: 'r4',
          species: 'all',
          size: 'all',
          coatType: 'double',
          price: 75.0,
          durationMinutes: 60,
        },
      ],
    };

    it('Cenário 1: deve aplicar variação exata de porte e pelagem', () => {
      const res = pricing.resolvePriceAndDuration(banhoService, {
        species: 'dog',
        size: 'small',
        coatType: 'long',
      });
      expect(res.price).toBe(65.0);
      expect(res.durationMinutes).toBe(50);
      expect(res.ruleHierarchy).toBe('exact_size_coat');
    });

    it('Cenário 2: deve aplicar variação por porte quando a pelagem específica não existir', () => {
      const res = pricing.resolvePriceAndDuration(banhoService, {
        species: 'dog',
        size: 'large',
        coatType: 'short',
      });
      expect(res.price).toBe(85.0);
      expect(res.durationMinutes).toBe(70);
      expect(res.ruleHierarchy).toBe('size_only');
    });

    it('Cenário 3: deve aplicar variação por pelagem quando o porte não for específico', () => {
      const res = pricing.resolvePriceAndDuration(banhoService, {
        species: 'dog',
        size: 'medium',
        coatType: 'double',
      });
      expect(res.price).toBe(75.0);
      expect(res.durationMinutes).toBe(60);
      expect(res.ruleHierarchy).toBe('coat_only');
    });

    it('Cenário 4: deve fazer fallback seguro para o preço-base quando nenhuma regra coincidir', () => {
      const res = pricing.resolvePriceAndDuration(banhoService, {
        species: 'dog',
        size: 'medium',
        coatType: 'short',
      });
      expect(res.price).toBe(50.0);
      expect(res.durationMinutes).toBe(45);
      expect(res.ruleHierarchy).toBe('base_service');
    });
  });

  describe('3. Motor de Combos de Serviços', () => {
    const banho = {
      id: 'svc-1',
      name: 'Banho',
      serviceType: 'INDIVIDUAL',
      price: 50.0,
      durationMinutes: 40,
      pricingRules: [
        { id: 'b1', species: 'dog', size: 'small', coatType: 'all', price: 50.0, durationMinutes: 40 },
        { id: 'b2', species: 'dog', size: 'large', coatType: 'all', price: 80.0, durationMinutes: 60 },
      ],
    };

    const tosaHigienica = {
      id: 'svc-2',
      name: 'Tosa Higiênica',
      serviceType: 'INDIVIDUAL',
      price: 35.0,
      durationMinutes: 25,
      pricingRules: [
        { id: 't1', species: 'dog', size: 'small', coatType: 'all', price: 35.0, durationMinutes: 25 },
        { id: 't2', species: 'dog', size: 'large', coatType: 'all', price: 45.0, durationMinutes: 35 },
      ],
    };

    const hidratacao = {
      id: 'svc-3',
      name: 'Hidratação Profunda',
      serviceType: 'INDIVIDUAL',
      price: 40.0,
      durationMinutes: 20,
    };

    const compMap = new Map<string, any>([
      ['svc-1', banho],
      ['svc-2', tosaHigienica],
      ['svc-3', hidratacao],
    ]);

    it('Cenário 5: Combo com 2 serviços e desconto percentual', () => {
      const comboPercent = {
        id: 'combo-1',
        name: 'Combo Banho + Tosa Higiênica',
        serviceType: 'COMBO',
        comboPricingType: 'PERCENT_DISCOUNT',
        comboDiscountValue: 15, // 15% de desconto
        durationMinutes: 0, // Duração calculada automaticamente
        comboItems: [
          { componentService: banho, quantity: 1 },
          { componentService: tosaHigienica, quantity: 1 },
        ],
      };

      // Para cão pequeno: Banho (50) + Tosa (35) = 85. Com 15% de desc (12.75) = 72.25
      const resSmall = pricing.resolvePriceAndDuration(comboPercent, { size: 'small' }, compMap);
      expect(resSmall.baseSum).toBe(85.0);
      expect(resSmall.discountAmount).toBe(12.75);
      expect(resSmall.price).toBe(72.25);
      expect(resSmall.durationMinutes).toBe(65); // 40 + 25 min

      // Para cão grande: Banho (80) + Tosa (45) = 125. Com 15% de desc (18.75) = 106.25
      const resLarge = pricing.resolvePriceAndDuration(comboPercent, { size: 'large' }, compMap);
      expect(resLarge.baseSum).toBe(125.0);
      expect(resLarge.discountAmount).toBe(18.75);
      expect(resLarge.price).toBe(106.25);
      expect(resLarge.durationMinutes).toBe(95); // 60 + 35 min
    });

    it('Cenário 6: Combo com 3 serviços e desconto em valor fixo', () => {
      const comboFixedDiscount = {
        id: 'combo-2',
        name: 'Combo Completo Spa',
        serviceType: 'COMBO',
        comboPricingType: 'FIXED_DISCOUNT',
        comboDiscountValue: 20.0, // R$ 20,00 de desconto
        durationMinutes: 0,
        comboItems: [
          { componentService: banho, quantity: 1 },
          { componentService: tosaHigienica, quantity: 1 },
          { componentService: hidratacao, quantity: 1 },
        ],
      };

      // Pequeno: 50 + 35 + 40 = 125. Menos R$ 20 = R$ 105.
      const res = pricing.resolvePriceAndDuration(comboFixedDiscount, { size: 'small' }, compMap);
      expect(res.baseSum).toBe(125.0);
      expect(res.discountAmount).toBe(20.0);
      expect(res.price).toBe(105.0);
      expect(res.durationMinutes).toBe(85); // 40 + 25 + 20
      expect(res.components?.length).toBe(3);
    });

    it('Cenário 7: Combo com preço comercial fixo', () => {
      const comboFixedPrice = {
        id: 'combo-3',
        name: 'Combo Promocional',
        serviceType: 'COMBO',
        comboPricingType: 'FIXED_PRICE',
        price: 99.9,
        durationMinutes: 70, // Duração personalizada expressa
        comboItems: [
          { componentService: banho, quantity: 1 },
          { componentService: hidratacao, quantity: 1 },
        ],
      };

      const res = pricing.resolvePriceAndDuration(comboFixedPrice, { size: 'large' }, compMap);
      expect(res.price).toBe(99.9);
      expect(res.durationMinutes).toBe(70); // Sobrescrita respeitada
      expect(res.baseSum).toBe(120.0); // 80 + 40
      expect(res.discountAmount).toBe(20.1);
    });

    it('Cenário 8: Combo com regra de preço própria por porte', () => {
      const comboWithCustomRules = {
        id: 'combo-4',
        name: 'Combo Matriz Própria',
        serviceType: 'COMBO',
        comboItems: [
          { componentService: banho, quantity: 1 },
          { componentService: tosaHigienica, quantity: 1 },
        ],
        pricingRules: [
          { size: 'mini', coatType: 'all', price: 69.9, durationMinutes: 50 },
          { size: 'small', coatType: 'all', price: 79.9, durationMinutes: 60 },
          { size: 'giant', coatType: 'all', price: 179.9, durationMinutes: 110 },
        ],
      };

      const resMini = pricing.resolvePriceAndDuration(comboWithCustomRules, { size: 'mini' }, compMap);
      expect(resMini.price).toBe(69.9);
      expect(resMini.durationMinutes).toBe(50);
      expect(resMini.ruleHierarchy).toBe('combo_rule');

      const resGiant = pricing.resolvePriceAndDuration(comboWithCustomRules, { size: 'giant' }, compMap);
      expect(resGiant.price).toBe(179.9);
      expect(resGiant.durationMinutes).toBe(110);
    });

    it('Cenário 9: Impede validação de combo recursivo (combo dentro de outro combo)', () => {
      const parentCombo = {
        id: 'c-sub',
        name: 'Sub Combo',
        serviceType: 'COMBO',
      };
      const badCompMap = new Map<string, any>([
        ['c-sub', parentCombo],
        ['svc-1', banho],
      ]);

      expect(() => {
        pricing.validateComboComposition(
          [{ componentServiceId: 'c-sub', quantity: 1 }, { componentServiceId: 'svc-1', quantity: 1 }],
          badCompMap,
        );
      }).toThrow(BadRequestException);
    });

    it('Cenário 10: Impede validação de combo sem serviços', () => {
      expect(() => {
        pricing.validateComboComposition([], compMap);
      }).toThrow(BadRequestException);
    });
  });

  describe('4. Cálculo de Faixa de Preços (Price Range)', () => {
    it('deve calcular corretamente a faixa "A partir de" quando existem variações', () => {
      const svcWithRules = {
        price: 50.0,
        durationMinutes: 45,
        pricingRules: [
          { size: 'small', price: 55.0, durationMinutes: 45 },
          { size: 'large', price: 95.0, durationMinutes: 75 },
        ],
      };

      const range = pricing.calculatePriceRange(svcWithRules);
      expect(range.minPrice).toBe(50.0);
      expect(range.maxPrice).toBe(95.0);
      expect(range.hasVariants).toBe(true);
      expect(range.formattedRange).toBe('A partir de R$ 50,00');
    });

    it('deve formatar valor exato quando não há variações', () => {
      const fixedSvc = {
        price: 40.0,
        durationMinutes: 30,
        pricingRules: [],
      };

      const range = pricing.calculatePriceRange(fixedSvc);
      expect(range.minPrice).toBe(40.0);
      expect(range.maxPrice).toBe(40.0);
      expect(range.hasVariants).toBe(false);
      expect(range.formattedRange).toBe('R$ 40,00');
    });
  });

  describe('5. Fluxo Operacional & Etapas Dinâmicas do Atendimento', () => {
    it('deve validar com sucesso fluxos configurados corretamente', () => {
      const valid1 = pricing.validateStages(['checked_in', 'bathing', 'finishing', 'ready']);
      expect(valid1).toEqual(['checked_in', 'bathing', 'finishing', 'ready']);

      const valid2 = pricing.validateStages(['checked_in', 'grooming', 'finishing', 'ready']);
      expect(valid2).toEqual(['checked_in', 'grooming', 'finishing', 'ready']);

      const valid3 = pricing.validateStages(['checked_in', 'finishing', 'ready']);
      expect(valid3).toEqual(['checked_in', 'finishing', 'ready']);
    });

    it('deve rejeitar configurações inconsistentes ou sem etapas obrigatórias', () => {
      // Sem check-in
      expect(() => pricing.validateStages(['bathing', 'finishing', 'ready'])).toThrow(BadRequestException);
      // Sem pronto
      expect(() => pricing.validateStages(['checked_in', 'bathing', 'finishing'])).toThrow(BadRequestException);
      // Sem etapa intermediária
      expect(() => pricing.validateStages(['checked_in', 'ready'])).toThrow(BadRequestException);
      // Chave inexistente
      expect(() => pricing.validateStages(['checked_in', 'massagem_invalida', 'ready'])).toThrow(BadRequestException);
      // Etapa duplicada
      expect(() => pricing.validateStages(['checked_in', 'bathing', 'bathing', 'ready'])).toThrow(BadRequestException);
    });

    it('deve sugerir etapas padrão inteligentemente de acordo com nome e categoria', () => {
      expect(pricing.suggestStages('Banho Tradicional', 'Higiene e Estética')).toEqual([
        'checked_in',
        'bathing',
        'finishing',
        'ready',
      ]);
      expect(pricing.suggestStages('Tosa na Tesoura', 'Tosa & Estética')).toEqual([
        'checked_in',
        'grooming',
        'finishing',
        'ready',
      ]);
      expect(pricing.suggestStages('Banho e Tosa Completa', 'Estética')).toEqual([
        'checked_in',
        'bathing',
        'grooming',
        'finishing',
        'ready',
      ]);
      expect(pricing.suggestStages('Corte de Unhas e Limpeza de Ouvidos', 'Cuidados')).toEqual([
        'checked_in',
        'finishing',
        'ready',
      ]);
    });

    it('deve consolidar etapas de múltiplos serviços em um combo sem repetições e na ordem correta', () => {
      // Banho + Tosa
      const stages1 = ['checked_in', 'bathing', 'finishing', 'ready'] as any;
      const stages2 = ['checked_in', 'grooming', 'finishing', 'ready'] as any;
      const consolidated = pricing.consolidateStages([stages1, stages2]);
      expect(consolidated).toEqual(['checked_in', 'bathing', 'grooming', 'finishing', 'ready']);

      // Banho + Unhas (sem tosa)
      const stagesUnhas = ['checked_in', 'finishing', 'ready'] as any;
      const consolidatedSemTosa = pricing.consolidateStages([stages1, stagesUnhas]);
      expect(consolidatedSemTosa).toEqual(['checked_in', 'bathing', 'finishing', 'ready']);
    });

    it('deve identificar com exatidão etapas puladas ao avançar no fluxo', () => {
      const pipeline = ['checked_in', 'bathing', 'finishing', 'ready'] as any;

      // Avanço de checked_in direto para finishing pula 'bathing'
      const skipped1 = pricing.getSkippedStages('checked_in', 'finishing', pipeline);
      expect(skipped1).toEqual(['bathing']);

      // Avanço de checked_in direto para ready pula 'bathing' e 'finishing'
      const skipped2 = pricing.getSkippedStages('checked_in', 'ready', pipeline);
      expect(skipped2).toEqual(['bathing', 'finishing']);

      // Avanço de checked_in para bathing (próxima imediata): nenhuma etapa pulada
      const skipped3 = pricing.getSkippedStages('checked_in', 'bathing', pipeline);
      expect(skipped3).toEqual([]);

      // Retroceder status não marca como pulado
      const skippedBack = pricing.getSkippedStages('finishing', 'bathing', pipeline);
      expect(skippedBack).toEqual([]);
    });

    it('deve preservar a imutabilidade do snapshot em agendamentos existentes', () => {
      const existingAppointmentWithSnapshot = {
        id: 'app-old-1',
        customStages: ['checked_in', 'bathing', 'ready'],
        services: [
          { service: { customStages: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'] } },
        ],
      };

      // Respeita o snapshot do atendimento mesmo que o serviço no catálogo tenha mudado
      const resolved = pricing.resolveAppointmentStages(existingAppointmentWithSnapshot);
      expect(resolved).toEqual(['checked_in', 'bathing', 'ready']);
    });
  });

  describe('6. Personalização de Nomes e Etapas Customizadas Criadas pelo Administrador', () => {
    it('deve aceitar etapas customizadas com chave iniciada em custom_ ou isCustom: true', () => {
      const customFlow = [
        'checked_in',
        'bathing',
        'custom_secador',
        'finishing',
        'ready',
      ];
      const validated = pricing.validateStages(customFlow);
      expect(validated).toEqual(['checked_in', 'bathing', 'custom_secador', 'finishing', 'ready']);
    });

    it('deve aceitar e preservar definições enriquecidas com nomes personalizados', () => {
      const enrichedFlow = [
        { key: 'checked_in', label: 'Recepção do Pet' },
        { key: 'bathing', label: 'Lavatório e Spa' },
        { key: 'custom_secador', label: 'Secador & Soprador Turbo', isCustom: true },
        { key: 'finishing', label: 'Penteado e Perfume' },
        { key: 'ready', label: 'Liberado para o Tutor' },
      ];

      const validated = pricing.validateStages(enrichedFlow);
      expect(validated).toHaveLength(5);
      expect(validated[0].label).toBe('Recepção do Pet');
      expect(validated[1].label).toBe('Lavatório e Spa');
      expect(validated[2].label).toBe('Secador & Soprador Turbo');
      expect(validated[2].isCustom).toBe(true);
      expect(validated[4].label).toBe('Liberado para o Tutor');
    });

    it('deve identificar etapas customizadas puladas com preservação de rótulos', () => {
      const enrichedFlow = [
        { key: 'checked_in', label: 'Recepção' },
        { key: 'bathing', label: 'Lavatório' },
        { key: 'custom_secador', label: 'Secador Turbo', isCustom: true },
        { key: 'ready', label: 'Pronto' },
      ];

      // Avançar de checked_in direto para ready pula 'bathing' e 'custom_secador'
      const skipped = pricing.getSkippedStages('checked_in', 'ready', enrichedFlow);
      expect(skipped).toHaveLength(2);
      expect(skipped[0].key).toBe('bathing');
      expect(skipped[1].key).toBe('custom_secador');
      expect(skipped[1].label).toBe('Secador Turbo');
    });

    it('deve normalizar catálogo de etapas com padrões do sistema', () => {
      const normalized = pricing.normalizeStages([]);
      expect(normalized).toHaveLength(5);
      expect(normalized.map(s => s.key)).toEqual([
        'checked_in',
        'bathing',
        'grooming',
        'finishing',
        'ready',
      ]);
      expect(normalized[0].isSystem).toBe(true);
      expect(normalized[4].isSystem).toBe(true);
    });
  });
});
