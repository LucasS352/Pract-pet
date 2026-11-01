import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

const DEMO_TENANT_ID = 'demo-tenant-001';
const DEMO_OPERATOR_ID = 'demo-op-1';
const DEMO_OPERATOR_ID_2 = 'demo-op-2';
const DEMO_DB_URL = () =>
  process.env.DATABASE_URL_TENANT ||
  'mysql://root:7bar%402025@mysql:3306/demo_adega';

// ─── Dados fixos da demo ──────────────────────────────────────────────────────
// Produtos reais do banco demo com seus preços
const DEMO_PRODUCTS = [
  { name: 'HEINEKEN  LONG NECK', price: 8.0 },
  { name: 'HEINEKEN LATA', price: 6.5 },
  { name: 'BRAHMA 300ML (LITRINHO)', price: 3.0 },
  { name: 'BRAHMA 350ML LATA', price: 4.0 },
  { name: 'SKOL 350ML LATA', price: 3.5 },
  { name: 'BUDWEISER 1 350 ML LATA', price: 5.0 },
  { name: 'BUDWEISER 300ML (LITRINHO)', price: 3.6 },
  { name: 'IMPERIO 350ML', price: 3.5 },
  { name: 'BOA 0350ML LATA', price: 4.0 },
  { name: 'BAVARIA 350ML', price: 3.2 },
  { name: 'BURGESA 350 ML', price: 3.25 },
  { name: 'GELO 5KG', price: 7.0 },
  { name: 'COCA-COLA 350 ML', price: 5.0 },
];

// Métodos de pagamento (método, tPag, label)
const PAYMENT_METHODS = [
  { method: 'pix', tPag: '17', label: 'Pix', weight: 40 },
  { method: 'dinheiro', tPag: '01', label: 'Dinheiro', weight: 30 },
  { method: 'credito', tPag: '03', label: 'Crédito', weight: 20 },
  { method: 'debito', tPag: '04', label: 'Débito', weight: 10 },
];

// Perfil de vendas por hora do dia (peso relativo de vendas)
const HOURLY_PROFILE: Record<number, number> = {
  8: 2, 9: 3, 10: 4, 11: 5, 12: 8,
  13: 7, 14: 6, 15: 6, 16: 8, 17: 10,
  18: 15, 19: 18, 20: 20, 21: 18, 22: 12,
  23: 8, 0: 4, 1: 2,
};

// Fator de dia da semana (sexta/sábado têm mais vendas)
const DAY_OF_WEEK_FACTOR: Record<number, number> = {
  0: 1.1, // Domingo
  1: 0.7, // Segunda
  2: 0.7, // Terça
  3: 0.8, // Quarta
  4: 0.9, // Quinta
  5: 1.4, // Sexta
  6: 1.5, // Sábado
};

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function buildSaleDate(dayOffset: number, hour?: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(hour ?? randomBetween(9, 22), randomBetween(0, 59), randomBetween(0, 59), 0);
  return d;
}

function salesCountForDay(date: Date, basePerDay: number): number {
  const dow = date.getDay();
  const factor = DAY_OF_WEEK_FACTOR[dow] ?? 1.0;
  // ±20% random variation
  const variation = 0.8 + Math.random() * 0.4;
  return Math.round(basePerDay * factor * variation);
}

function pickHourForDay(date: Date): number {
  const entries = Object.entries(HOURLY_PROFILE).map(([h, w]) => ({
    hour: Number(h),
    weight: w,
  }));
  return weightedRandom(entries).hour;
}

@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly heartPrisma: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
  ) {}

  /** Roda na inicialização do módulo */
  async onModuleInit() {
    if (process.env.APP_MODE !== 'demo') return;
    this.logger.log('[DemoSeed] Inicializando Seeder Demo...');
    this.seedDemoSalesIfNeeded().catch(e => {
      this.logger.error(`[DemoSeed] Erro na execução inicial do seeder: ${e.message}`);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LEAD REGISTRATION
  // ────────────────────────────────────────────────────────────────────────────
  async registerLead(name: string, whatsapp: string) {
    try {
      await this.heartPrisma.tenant.upsert({
        where: { id: DEMO_TENANT_ID },
        update: {},
        create: {
          id: DEMO_TENANT_ID,
          databaseName: 'demo_adega',
          databaseUrl: DEMO_DB_URL(),
          name: 'Adega Modelo',
          nomeFantasia: 'Adega Modelo',
          razaoSocial: 'Adega Modelo Demonstração LTDA',
          status: 'active',
          modulos: {
            nfce: true,
            estoque: true,
            dashboardMobile: true,
            comandas: true,
          },
        },
      });
    } catch (e: any) {
      this.logger.warn(`Erro ao garantir tenant demo no heart: ${e.message}`);
    }

    return this.heartPrisma.lead.create({
      data: { name, whatsapp, status: 'EM_DEMO', source: 'demo' },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CAIXA ABERTO
  // ────────────────────────────────────────────────────────────────────────────
  async ensureDemoOperatorAndRegister() {
    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(
        DEMO_TENANT_ID,
        DEMO_DB_URL(),
      );

      let operator = await tenantPrisma.operator.findFirst({
        where: { id: DEMO_OPERATOR_ID },
      });

      if (!operator) {
        operator = await tenantPrisma.operator.findFirst({
          where: { active: true },
        });
      }

      if (!operator) {
        this.logger.warn('Nenhum operador encontrado no banco demo');
        return { operator: null, cashRegister: null };
      }

      let cashRegister = await tenantPrisma.cashRegister.findFirst({
        where: { operatorId: operator.id, status: 'open' },
      });

      if (!cashRegister) {
        try {
          cashRegister = await tenantPrisma.cashRegister.create({
            data: { operatorId: operator.id, openingValue: 100.0, status: 'open' },
          });
          this.logger.log(
            `Caixa demo aberto automaticamente para operador ${operator.name}`,
          );
        } catch (e: any) {
          this.logger.warn(`Erro ao abrir caixa demo: ${e.message}`);
        }
      }

      return {
        operator: {
          id: operator.id,
          name: operator.name,
          role: (operator as any).jobTitle || 'Caixa',
          isManager: (operator as any).isManager || false,
        },
        cashRegister: cashRegister
          ? { id: cashRegister.id, status: cashRegister.status }
          : null,
      };
    } catch (e: any) {
      this.logger.error(`Erro ao configurar operador/caixa demo: ${e.message}`);
      return { operator: null, cashRegister: null };
    }
  }

  getDemoStatus(jwtPayload: any) {
    return {
      isDemoMode: true,
      message: 'Sessão de demonstração ativa.',
      user: jwtPayload,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRON: toda meia-noite gera vendas do dia que passou e abre novo caixa
  // ────────────────────────────────────────────────────────────────────────────
  @Cron('1 0 * * *') // 00:01 todo dia
  async handleDailyDemoSeed() {
    if (process.env.APP_MODE !== 'demo') return;
    this.logger.log('[DemoSeed] Cron diário → gerando vendas do dia anterior...');
    await this.seedDayOfSales(1); // gera "ontem"
    await this.ensureOpenCashRegisterForToday();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SEEDER PRINCIPAL — gera N dias de histórico se banco estiver vazio
  // ────────────────────────────────────────────────────────────────────────────
  async seedDemoSalesIfNeeded() {
    if (process.env.APP_MODE !== 'demo') return;

    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(
        DEMO_TENANT_ID,
        DEMO_DB_URL(),
      );

      // Quantas vendas existem nos últimos 30 dias?
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const existingCount = await tenantPrisma.sale.count({
        where: { createdAt: { gte: cutoff } },
      });

      this.logger.log(`[DemoSeed] Vendas nos últimos 30 dias: ${existingCount}`);

      if (existingCount < 50) {
        this.logger.log('[DemoSeed] Banco vazio → gerando histórico completo de 30 dias...');
        // Gera do dia 30 até ontem (hoje já tem caixa aberto = dia atual)
        for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
          await this.seedDayOfSales(dayOffset);
        }
        this.logger.log('[DemoSeed] Histórico de 30 dias gerado com sucesso!');
      } else {
        this.logger.log('[DemoSeed] Dados suficientes. Verificando caixa de hoje...');
      }

      // Garante caixa aberto para o dia atual
      await this.ensureOpenCashRegisterForToday();
    } catch (e: any) {
      this.logger.error(`[DemoSeed] Erro ao verificar/seedar: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Gera as vendas de um dia específico (dayOffset=0 → hoje, 1 → ontem, etc.)
  // ────────────────────────────────────────────────────────────────────────────
  private async seedDayOfSales(dayOffset: number) {
    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(
        DEMO_TENANT_ID,
        DEMO_DB_URL(),
      );

      // Buscar produtos reais do banco
      const products = await tenantPrisma.product.findMany({
        select: { id: true, name: true, priceSell: true, priceCost: true },
        take: 30,
      });

      if (products.length === 0) {
        this.logger.warn('[DemoSeed] Nenhum produto encontrado, pulando seed.');
        return;
      }

      // Buscar ou criar cash_register fechado para este dia
      const dayDate = new Date();
      dayDate.setDate(dayDate.getDate() - dayOffset);

      const dayStart = new Date(dayDate);
      dayStart.setHours(8, 0, 0, 0);
      const dayEnd = new Date(dayDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Verificar se já existe caixa para este dia
      let cashRegister = await tenantPrisma.cashRegister.findFirst({
        where: {
          openingTime: { gte: dayStart, lte: dayEnd },
          operatorId: DEMO_OPERATOR_ID,
        },
      });

      if (!cashRegister) {
        const openingTime = new Date(dayDate);
        openingTime.setHours(8, randomBetween(0, 30), 0, 0);
        const closingTime = new Date(dayDate);
        closingTime.setHours(22, randomBetween(30, 59), 0, 0);

        cashRegister = await tenantPrisma.cashRegister.create({
          data: {
            id: uuidv4(),
            operatorId: DEMO_OPERATOR_ID,
            openingTime,
            closingTime,
            openingValue: 100.0,
            closingValue: randomBetween(150, 400),
            status: 'closed',
          },
        });

        // Suprimento inicial
        await tenantPrisma.cashMovement.create({
          data: {
            id: uuidv4(),
            cashRegisterId: cashRegister.id,
            type: 'IN',
            value: 100.0,
            reason: 'Abertura de caixa',
            createdAt: openingTime,
          },
        });
      }

      // Determinar número de vendas para este dia
      const targetSales = salesCountForDay(dayDate, 45); // ~45 vendas/dia base
      this.logger.log(
        `[DemoSeed] Dia ${dayDate.toLocaleDateString('pt-BR')}: gerando ${targetSales} vendas...`,
      );

      // Verificar vendas já existentes neste dia
      const existingSalesCount = await tenantPrisma.sale.count({
        where: {
          cashRegisterId: cashRegister.id,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });

      const salesToCreate = targetSales - existingSalesCount;
      if (salesToCreate <= 0) {
        this.logger.log(`[DemoSeed] Dia já tem ${existingSalesCount} vendas, pulando.`);
        return;
      }

      // Gerar as vendas
      for (let i = 0; i < salesToCreate; i++) {
        const hour = pickHourForDay(dayDate);
        const saleTime = buildSaleDate(dayOffset, hour);

        // 1–4 itens por venda
        const itemCount = randomBetween(1, 4);
        const shuffled = [...products].sort(() => Math.random() - 0.5);
        const selectedProducts = shuffled.slice(0, itemCount);

        const saleItems = selectedProducts.map((p) => {
          const qty = randomBetween(1, p.name.includes('GELO') ? 3 : 6);
          const price = Number(p.priceSell);
          const cost = Number(p.priceCost ?? 0);
          const subtotal = Math.round(price * qty * 100) / 100;
          return {
            id: uuidv4(),
            productId: p.id,
            productName: p.name,
            unit: 'UN',
            quantity: qty,
            priceUnit: price,
            priceCost: cost,
            discount: 0,
            subtotal,
          };
        });

        const total =
          Math.round(saleItems.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

        // Escolher método de pagamento
        const paymentMethod = weightedRandom(PAYMENT_METHODS);
        const troco =
          paymentMethod.method === 'dinheiro'
            ? Math.round(Math.max(0, Math.ceil(total / 5) * 5 - total) * 100) / 100
            : 0;

        // Operador alterna entre Carlos e Ana
        const operatorId = i % 3 === 0 ? DEMO_OPERATOR_ID_2 : DEMO_OPERATOR_ID;
        const saleId = uuidv4();

        await tenantPrisma.sale.create({
          data: {
            id: saleId,
            operatorId,
            cashRegisterId: cashRegister.id,
            subtotal: total,
            discount: 0,
            addition: 0,
            total,
            status: 'completed',
            source: 'pdv',
            emitirNfce: false,
            createdAt: saleTime,
            updatedAt: saleTime,
            items: {
              create: saleItems,
            },
            payments: {
              create: [
                {
                  id: uuidv4(),
                  method: paymentMethod.method,
                  tPag: paymentMethod.tPag,
                  label: paymentMethod.label,
                  value: total + troco,
                  troco,
                },
              ],
            },
          },
        });
      }

      this.logger.log(
        `[DemoSeed] ✅ ${salesToCreate} vendas criadas para ${dayDate.toLocaleDateString('pt-BR')}`,
      );
    } catch (e: any) {
      this.logger.error(`[DemoSeed] Erro ao gerar vendas do dia ${dayOffset}: ${e.message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Garante que hoje tenha um caixa aberto com algumas vendas recentes
  // ────────────────────────────────────────────────────────────────────────────
  private async ensureOpenCashRegisterForToday() {
    try {
      const tenantPrisma = await this.tenantManager.getTenantClient(
        DEMO_TENANT_ID,
        DEMO_DB_URL(),
      );

      // Verificar se já tem caixa aberto hoje
      let cashRegister = await tenantPrisma.cashRegister.findFirst({
        where: { operatorId: DEMO_OPERATOR_ID, status: 'open' },
      });

      if (!cashRegister) {
        const openingTime = new Date();
        openingTime.setHours(8, 0, 0, 0);

        cashRegister = await tenantPrisma.cashRegister.create({
          data: {
            id: uuidv4(),
            operatorId: DEMO_OPERATOR_ID,
            openingTime,
            openingValue: 100.0,
            status: 'open',
          },
        });

        // Suprimento de abertura
        await tenantPrisma.cashMovement.create({
          data: {
            id: uuidv4(),
            cashRegisterId: cashRegister.id,
            type: 'IN',
            value: 100.0,
            reason: 'Abertura de caixa',
            createdAt: openingTime,
          },
        });

        this.logger.log('[DemoSeed] Caixa aberto para hoje ✅');
      }

      // Gerar algumas vendas de hoje até o horário atual
      const products = await tenantPrisma.product.findMany({
        select: { id: true, name: true, priceSell: true, priceCost: true },
        take: 20,
      });

      if (products.length === 0) return;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const existingSalesToday = await tenantPrisma.sale.count({
        where: {
          cashRegisterId: cashRegister.id,
          createdAt: { gte: todayStart },
        },
      });

      const currentHour = new Date().getHours();
      // Vendas esperadas até agora (baseado no perfil horário)
      let expectedSoFar = 0;
      for (let h = 8; h <= currentHour; h++) {
        expectedSoFar += Math.round((HOURLY_PROFILE[h] ?? 0) * 0.5);
      }
      expectedSoFar = Math.max(expectedSoFar, 3);

      const salesToCreate = Math.max(0, expectedSoFar - existingSalesToday);

      for (let i = 0; i < salesToCreate; i++) {
        // Distribuir no tempo de hoje
        const hoursAgo = Math.random() * Math.min(currentHour - 8, 12);
        const saleTime = new Date();
        saleTime.setTime(saleTime.getTime() - hoursAgo * 3600 * 1000);
        if (saleTime.getHours() < 8) saleTime.setHours(8, randomBetween(0, 59));

        const itemCount = randomBetween(1, 3);
        const selectedProducts = [...products]
          .sort(() => Math.random() - 0.5)
          .slice(0, itemCount);

        const saleItems = selectedProducts.map((p) => {
          const qty = randomBetween(1, 4);
          const price = Number(p.priceSell);
          const cost = Number(p.priceCost ?? 0);
          const subtotal = Math.round(price * qty * 100) / 100;
          return {
            id: uuidv4(),
            productId: p.id,
            productName: p.name,
            unit: 'UN',
            quantity: qty,
            priceUnit: price,
            priceCost: cost,
            discount: 0,
            subtotal,
          };
        });

        const total =
          Math.round(saleItems.reduce((s, item) => s + item.subtotal, 0) * 100) / 100;
        const paymentMethod = weightedRandom(PAYMENT_METHODS);
        const troco =
          paymentMethod.method === 'dinheiro'
            ? Math.round(Math.max(0, Math.ceil(total / 5) * 5 - total) * 100) / 100
            : 0;

        const saleId = uuidv4();
        await tenantPrisma.sale.create({
          data: {
            id: saleId,
            operatorId: i % 3 === 0 ? DEMO_OPERATOR_ID_2 : DEMO_OPERATOR_ID,
            cashRegisterId: cashRegister.id,
            subtotal: total,
            discount: 0,
            addition: 0,
            total,
            status: 'completed',
            source: 'pdv',
            emitirNfce: false,
            createdAt: saleTime,
            updatedAt: saleTime,
            items: { create: saleItems },
            payments: {
              create: [
                {
                  id: uuidv4(),
                  method: paymentMethod.method,
                  tPag: paymentMethod.tPag,
                  label: paymentMethod.label,
                  value: total + troco,
                  troco,
                },
              ],
            },
          },
        });
      }

      if (salesToCreate > 0) {
        this.logger.log(
          `[DemoSeed] ✅ ${salesToCreate} vendas de hoje geradas (caixa ${cashRegister.id.slice(0, 8)})`,
        );
      }
    } catch (e: any) {
      this.logger.error(`[DemoSeed] Erro ao garantir caixa/vendas de hoje: ${e.message}`);
    }
  }
}
