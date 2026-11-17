import { PetshopService } from './petshop.service';

describe('PetshopService.getMetrics — mix de pagamentos', () => {
  const createServiceWithPrisma = (prismaMock: any) => {
    const manager = { getTenantClient: jest.fn().mockResolvedValue(prismaMock) };
    const ctx = { get: () => ({ tenantId: 'tenant-1', databaseUrl: 'db-1' }) };
    return new PetshopService(
      manager as any,
      ctx as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  it('agrega vendas PDV, pagamentos divididos, pacotes diretos, troco e meios personalizados', async () => {
    const now = new Date('2026-11-15T14:00:00.000Z');
    const prismaMock = {
      sale: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            // Venda petshop com pagamento dividido (Pix + Crédito)
            {
              id: 's1',
              source: 'petshop',
              total: 150,
              createdAt: now,
              items: [],
              payments: [
                { method: 'pix', label: 'Pix', tPag: '17', value: 100, troco: 0 },
                { method: 'credito', label: 'Cartão de Crédito', tPag: '03', value: 50, troco: 0 },
              ],
            },
            // Venda loja em dinheiro estilo PDV (value já é líquido e troco é informativo)
            {
              id: 's2',
              source: 'pdv',
              total: 40,
              createdAt: now,
              items: [{ quantity: 1, subtotal: 40, product: { id: 'p1', name: 'Ração' } }],
              payments: [
                { method: 'dinheiro', label: 'Dinheiro', tPag: '01', value: 40, troco: 10 },
              ],
            },
            // Venda demo com troco somado dentro de Payment.value (50 = 40 + 10)
            {
              id: 's3',
              source: 'pdv',
              total: 40,
              createdAt: now,
              items: [{ quantity: 1, subtotal: 40, product: { id: 'p2', name: 'Petisco' } }],
              payments: [
                { method: 'dinheiro', label: 'Dinheiro', tPag: '01', value: 50, troco: 10 },
              ],
            },
            // Venda com meio personalizado cadastrado e outra sem registros em payments
            {
              id: 's4',
              source: 'petshop',
              total: 90,
              createdAt: now,
              items: [],
              payments: [
                { method: 'pm-link', label: 'Outros', tPag: '99', value: 90, troco: 0 },
              ],
            },
            {
              id: 's5',
              source: 'pdv',
              total: 30,
              createdAt: now,
              items: [{ quantity: 1, subtotal: 30, product: { id: 'p3', name: 'Brinquedo' } }],
              payments: [],
            },
          ])
          // Chamada do período anterior (prevSales)
          .mockResolvedValueOnce([{ total: 200 }]),
      },
      petAppointment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerPetPackage: {
        findMany: jest
          .fn()
          // Período atual: pacote pago fora do PDV (saleId: null)
          .mockResolvedValueOnce([
            { finalPrice: 250, paymentMethod: 'pix' },
            { finalPrice: 100, paymentMethod: 'debito' },
          ])
          // Período anterior
          .mockResolvedValueOnce([]),
      },
      tenantPaymentMethod: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'pm-link', name: 'Link de Pagamento' },
        ]),
      },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.getMetrics('today');

    // Total = 150 + 40 + 40 + 90 + 30 + (250 + 100) = 700
    expect(result.totals.totalRevenue).toBe(700);

    const byKey = Object.fromEntries(result.paymentMix.map((m) => [m.key, m]));

    expect(byKey.pix).toEqual({
      key: 'pix',
      label: 'Pix',
      amount: 350, // 100 (s1) + 250 (pkg1)
      count: 2,
      percentage: 50,
    });
    expect(byKey.debito).toEqual({
      key: 'debito',
      label: 'Cartão de Débito',
      amount: 100,
      count: 1,
      percentage: 14.3,
    });
    expect(byKey['custom:pm-link']).toEqual({
      key: 'custom:pm-link',
      label: 'Link de Pagamento',
      amount: 90,
      count: 1,
      percentage: 12.9,
    });
    expect(byKey.dinheiro).toEqual({
      key: 'dinheiro',
      label: 'Dinheiro',
      amount: 80, // 40 (PDV líquido) + 40 (50 bruto - 10 troco)
      count: 2,
      percentage: 11.4,
    });
    expect(byKey.credito).toEqual({
      key: 'credito',
      label: 'Cartão de Crédito',
      amount: 50,
      count: 1,
      percentage: 7.1,
    });
    expect(byKey.outros).toEqual({
      key: 'outros',
      label: 'Outros',
      amount: 30,
      count: 1,
      percentage: 4.3,
    });

    // Ordenado do maior para o menor valor
    expect(result.paymentMix[0].key).toBe('pix');
    const sumAmounts = result.paymentMix.reduce((acc, m) => acc + m.amount, 0);
    expect(sumAmounts).toBeCloseTo(result.totals.totalRevenue, 2);
  });

  it('mantém os 4 meios padrão com R$ 0,00 quando não há vendas no período', async () => {
    const prismaMock = {
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      petAppointment: { findMany: jest.fn().mockResolvedValue([]) },
      customerPetPackage: { findMany: jest.fn().mockResolvedValue([]) },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.getMetrics('today');

    expect(result.totals.totalRevenue).toBe(0);
    expect(result.paymentMix.map((m) => m.key)).toEqual(['pix', 'credito', 'debito', 'dinheiro']);
    expect(result.paymentMix.every((m) => m.amount === 0 && m.percentage === 0 && m.count === 0)).toBe(true);
    expect(result.cashDrawer).toEqual({
      cashSalesAmount: 0,
      totalIn: 0,
      totalOut: 0,
      netCashBalance: 0,
      movements: [],
    });
  });

  it('calcula saldo da gaveta (vendas em dinheiro + entradas/abertura - sangrias) sem distorcer o faturamento bruto', async () => {
    const now = new Date('2026-11-15T14:00:00.000Z');
    const prismaMock = {
      sale: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 's-cash',
              source: 'petshop',
              total: 120,
              createdAt: now,
              items: [],
              payments: [{ method: 'dinheiro', label: 'Dinheiro', tPag: '01', value: 120, troco: 0 }],
            },
          ])
          .mockResolvedValueOnce([]),
      },
      petAppointment: { findMany: jest.fn().mockResolvedValue([]) },
      customerPetPackage: { findMany: jest.fn().mockResolvedValue([]) },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) },
      cashMovement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', type: 'IN', value: 100, reason: 'Troco abertura', createdAt: now },
          { id: 'm2', type: 'OUT', value: 35, reason: 'Sangria produtos limpeza', createdAt: now },
        ]),
      },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.getMetrics('today');

    // Faturamento bruto permanece exatamente R$ 120,00 (sem inflar com o troco de R$ 100)
    expect(result.totals.totalRevenue).toBe(120);
    // Saldo da gaveta = 120 (vendas dinheiro) + 100 (entrada) - 35 (sangria) = 185
    expect(result.cashDrawer).toEqual({
      cashSalesAmount: 120,
      totalIn: 100,
      totalOut: 35,
      netCashBalance: 185,
      movements: [
        { id: 'm1', type: 'IN', value: 100, reason: 'Troco abertura', createdAt: now },
        { id: 'm2', type: 'OUT', value: 35, reason: 'Sangria produtos limpeza', createdAt: now },
      ],
    });
  });

  it('restringe cashDrawer apenas ao filtro Hoje (retorna undefined em Este Mês / outros períodos)', async () => {
    const prismaMock = {
      sale: { findMany: jest.fn().mockResolvedValue([]) },
      petAppointment: { findMany: jest.fn().mockResolvedValue([]) },
      customerPetPackage: { findMany: jest.fn().mockResolvedValue([]) },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) },
      cashMovement: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = createServiceWithPrisma(prismaMock);
    const resultMonth = await service.getMetrics('month');

    expect(resultMonth.cashDrawer).toBeUndefined();
    expect(prismaMock.cashMovement.findMany).not.toHaveBeenCalled();
  });

  it('consolida receitas do Táxi Dog entre pacotes (sem duplicar grupo), vendas no PDV e atendimentos na agenda', async () => {
    const now = new Date('2026-11-16T15:00:00.000Z');
    const prismaMock = {
      sale: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            // Atendimento avulso pago no PDV (R$ 15 de Táxi Dog + R$ 60 Banho)
            {
              id: 'sale-apt-paid',
              source: 'petshop',
              total: 75,
              createdAt: now,
              items: [
                { productId: 'petshop-service-1', quantity: 1, subtotal: 60, notes: 'Serviço Pet Shop' },
                { productId: 'petshop-taxi-dog-fee', quantity: 1, subtotal: 15, notes: 'Táxi Dog Pet Shop' },
              ],
              payments: [{ method: 'pix', label: 'Pix', tPag: '17', value: 75, troco: 0 }],
            },
          ])
          .mockResolvedValueOnce([]),
      },
      petAppointment: {
        findMany: jest.fn().mockResolvedValue([
          // Mesmo atendimento já quitado no PDV acima (não pode duplicar na agenda)
          {
            id: 'apt-paid-pdv',
            status: 'delivered',
            startsAt: now,
            checkInNotes: JSON.stringify({
              transport: { enabled: true, mode: 'pickup_only', fee: 15, coveredByPackage: false, address: 'Rua A, 10' },
            }),
            services: [],
            professional: { id: 'op1', name: 'Sara' },
          },
          // Atendimento concluído direto sem passar pelo caixa PDV
          {
            id: 'apt-delivered-direct',
            status: 'delivered',
            startsAt: now,
            checkInNotes: JSON.stringify({
              transport: { enabled: true, mode: 'round_trip', fee: 10, coveredByPackage: false, address: 'Rua B, 20' },
            }),
            services: [],
            professional: { id: 'op1', name: 'Sara' },
          },
          // Atendimento agendado pendente de cobrança
          {
            id: 'apt-scheduled',
            status: 'scheduled',
            startsAt: now,
            checkInNotes: JSON.stringify({
              transport: { enabled: true, mode: 'dropoff_only', fee: 12, coveredByPackage: false, address: 'Rua C, 30' },
            }),
            services: [],
            professional: null,
          },
          // Corrida coberta por pacote (sem taxa avulsa; só contabiliza volume de corridas)
          {
            id: 'apt-pkg-covered',
            status: 'delivered',
            startsAt: now,
            checkInNotes: JSON.stringify({
              transport: { enabled: true, mode: 'round_trip', fee: 0, coveredByPackage: true, address: 'Rua D, 40' },
            }),
            services: [],
            professional: null,
          },
        ]),
      },
      comanda: {
        findMany: jest.fn().mockResolvedValue([
          {
            notes: 'PET2:{"v":2,"a":"apt-paid-pdv"}',
            saleId: 'sale-apt-paid',
            items: [{ productId: 'petshop-taxi-dog-fee', notes: 'Táxi Dog Pet Shop' }],
          },
        ]),
      },
      customerPetPackage: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            // Pacote Família: pet 1 concentra o frete R$ 20 (110 = 90+20); pet 2 tem fee 0 (90)
            {
              finalPrice: 110,
              paymentMethod: 'pix',
              saleId: null,
              notes: JSON.stringify({
                transport: { enabled: true, mode: 'round_trip', fee: 20, address: 'Rua Família, 100' },
              }),
            },
            {
              finalPrice: 90,
              paymentMethod: 'pix',
              saleId: null,
              notes: JSON.stringify({
                transport: { enabled: true, mode: 'round_trip', fee: 0, address: 'Rua Família, 100' },
              }),
            },
            // Pacote quitado via PDV (saleId preenchido): não soma novamente no packageSalesRevenue, mas contabiliza a taxa do Táxi Dog
            {
              finalPrice: 170,
              paymentMethod: 'comanda',
              saleId: 'sale-pkg-comanda',
              notes: JSON.stringify({
                transport: { enabled: true, mode: 'round_trip', fee: 30, address: 'Rua E, 50' },
              }),
            },
          ])
          .mockResolvedValueOnce([]),
      },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.getMetrics('today');

    // Pacotes pagos (20 + 30 = 50), PDV avulso (15), Agenda concluído direto (10), Agenda agendado (12)
    expect(result.taxiDog).toEqual({
      totalRevenue: 87,
      confirmedRevenue: 65,
      packageRevenue: 50,
      packageCount: 2,
      pdvRevenue: 15,
      pdvCount: 1,
      agendaDeliveredRevenue: 10,
      agendaDeliveredCount: 1,
      agendaPendingRevenue: 12,
      agendaPendingCount: 1,
      coveredByPackageRidesCount: 1,
      standaloneRidesCount: 3,
      byMode: [
        { mode: 'round_trip', label: 'Buscar e Levar (Ida e Volta)', count: 3, revenue: 60 },
        { mode: 'pickup_only', label: 'Somente Buscar (Ida)', count: 1, revenue: 15 },
        { mode: 'dropoff_only', label: 'Somente Levar (Volta)', count: 1, revenue: 12 },
      ],
    });
    // Pacote pago via comanda (170) não é duplicado no packageSalesRevenue
    expect(result.totals.packageSalesRevenue).toBe(200);
    expect(result.totals.totalRevenue).toBe(275); // 75 (sale-apt-paid) + 200 (pacotes diretos)
  });
});
