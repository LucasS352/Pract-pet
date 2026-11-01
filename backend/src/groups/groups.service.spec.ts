import { GroupsService } from './groups.service';

function tenant(productId: string, stock: number) {
  const state = { stock, lots: [{ id: `${productId}-lot`, remaining: stock }], logs: [] as any[] };
  const product = { id: productId, name: 'Café', unit: 'UN', barcode: null, active: true, priceCost: 4 };
  const client: any = {
    product: {
      findUnique: jest.fn(async () => ({ ...product, stock: state.stock })),
      findMany: jest.fn(async () => [{ ...product, stock: state.stock }]),
      updateMany: jest.fn(async ({ where, data }) => {
        if (where.stock?.gte > state.stock) return { count: 0 };
        state.stock += (data.stock.increment || 0) - (data.stock.decrement || 0);
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }) => { state.stock += data.stock.increment || 0; return product; }),
    },
    stockLot: {
      findMany: jest.fn(async () => state.lots.map(l => ({ ...l }))),
      updateMany: jest.fn(async ({ where, data }) => { const lot = state.lots.find(l => l.id === where.id)!; if (lot.remaining < where.remaining.gte) return { count: 0 }; lot.remaining -= data.remaining.decrement; return { count: 1 }; }),
      update: jest.fn(async ({ where, data }) => { state.lots.find(l => l.id === where.id)!.remaining += data.remaining.increment; }),
      create: jest.fn(async ({ data }) => { state.lots.push({ id: 'received', remaining: data.remaining }); }),
    },
    inventoryLog: {
      create: jest.fn(async ({ data }) => { state.logs.push({ ...data }); return data; }),
      update: jest.fn(async ({ where, data }) => { Object.assign(state.logs.find(l => l.id === where.id), data); }),
      findUnique: jest.fn(async ({ where }) => state.logs.find(l => l.id === where.id) || null),
    },
    $disconnect: jest.fn(),
  };
  client.$transaction = jest.fn(async (fn: any) => {
    const snapshot = structuredClone(state);
    try { return await fn(client); }
    catch (e) { Object.assign(state, snapshot); throw e; }
  });
  return { client, state };
}

describe('GroupsService transfers', () => {
  let service: GroupsService;
  let source: ReturnType<typeof tenant>;
  let destination: ReturnType<typeof tenant>;
  let invalidateCache: jest.Mock;
  const body = { fromTenantId: 'a', toTenantId: 'b', productId: 'source-product', quantity: 3 };
  beforeEach(() => {
    source = tenant('source-product', 10); destination = tenant('destination-product', 5);
    invalidateCache = jest.fn();
    service = new GroupsService({ tenantGroup: { findUnique: jest.fn().mockResolvedValue({ members: [{ tenantId: 'a', tenant: { databaseUrl: 'a' } }, { tenantId: 'b', tenant: { databaseUrl: 'b' } }] }) } } as any, { invalidateCache } as any);
    jest.spyOn(service as any, 'createTenantClient').mockImplementation((url: any) => url === 'a' ? source.client : destination.client);
  });
  it('does not debit when the destination product is missing', async () => {
    destination.client.product.findMany.mockResolvedValue([]);
    await expect(service.stockTransfer('g', body)).rejects.toThrow('Nenhum saldo foi debitado');
    expect(source.state.stock).toBe(10); expect(source.client.$transaction).not.toHaveBeenCalled();
  });
  it('rejects ambiguous destination and incompatible unit before debit', async () => {
    destination.client.product.findMany.mockResolvedValue([{ id: 'x', unit: 'KG' }]);
    await expect(service.stockTransfer('g', body)).rejects.toThrow('unidade diferente');
    expect(source.client.$transaction).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 0.0001, 10000000])('rejects invalid quantity %s', async quantity => {
    await expect(service.stockTransfer('g', { ...body, quantity })).rejects.toThrow('quantidade positiva');
    expect(source.client.$transaction).not.toHaveBeenCalled();
  });
  it('rejects transfers to the same tenant and outside the group', async () => {
    await expect(service.stockTransfer('g', { ...body, toTenantId: 'a' })).rejects.toThrow('diferentes');
    await expect(service.stockTransfer('g', { ...body, toTenantId: 'outsider' })).rejects.toThrow('pertencer ao grupo');
  });
  it('uses a conditional debit when the stock was consumed concurrently', async () => {
    source.client.product.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.stockTransfer('g', body)).rejects.toThrow('insuficiente');
    expect(destination.state.stock).toBe(5); expect(source.state.logs).toHaveLength(0);
  });
  it('moves exactly the requested stock even without FIFO lots', async () => {
    source.state.lots = []; destination.state.lots = [];
    await service.stockTransfer('g', body);
    expect(source.state.stock).toBe(7); expect(destination.state.stock).toBe(8);
    expect(source.state.logs[0]).toMatchObject({ type: 'transfer_out', quantity: -3, referenceKey: 'b' });
    expect(destination.state.logs[0]).toMatchObject({ type: 'transfer_in', quantity: 3, referenceKey: 'a', id: source.state.logs[0].id });
    expect(invalidateCache.mock.calls).toEqual([['a'], ['b']]);
  });
  it('restores source stock and FIFO lots when destination logging fails', async () => {
    destination.client.inventoryLog.create.mockRejectedValueOnce(new Error('DB write failed'));
    await expect(service.stockTransfer('g', body)).rejects.toThrow('restaurado');
    expect(source.state.stock).toBe(10); expect(source.state.lots[0].remaining).toBe(10);
    expect(destination.state.stock).toBe(5); expect(destination.state.logs).toHaveLength(0);
    expect(source.state.logs[0].type).toBe('transfer_cancelled');
  });
  it('rolls back the source when its log cannot be persisted', async () => {
    source.client.inventoryLog.create.mockRejectedValueOnce(new Error('log unavailable'));
    await expect(service.stockTransfer('g', body)).rejects.toThrow('log unavailable');
    expect(source.state.stock).toBe(10); expect(source.state.lots[0].remaining).toBe(10);
    expect(destination.client.$transaction).not.toHaveBeenCalled();
  });
  it('does not compensate a destination commit with a lost acknowledgement', async () => {
    destination.client.$transaction.mockImplementationOnce(async (fn: any) => { await fn(destination.client); throw new Error('lost ACK'); });
    await expect(service.stockTransfer('g', body)).resolves.toMatchObject({ success: true });
    expect(source.state.stock).toBe(7); expect(destination.state.stock).toBe(8);
  });
  it('leaves an auditable reservation when the destination cannot confirm the outcome', async () => {
    destination.client.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    destination.client.inventoryLog.findUnique.mockRejectedValueOnce(new Error('offline'));
    await expect(service.stockTransfer('g', body)).rejects.toThrow('origem está reservada');
    expect(source.state.stock).toBe(7); expect(source.state.logs[0].type).toBe('transfer_out');
  });
  it('reports the reference for manual reconciliation when compensation fails', async () => {
    destination.client.$transaction.mockRejectedValueOnce(new Error('destination offline'));
    source.client.product.update.mockRejectedValueOnce(new Error('source offline'));
    await expect(service.stockTransfer('g', body)).rejects.toThrow('pendente de conferência');
    expect(source.state.logs).toHaveLength(1);
  });
});

describe('GroupsService forecast', () => {
  it('consolidates local product IDs and handles zero sales without Infinity', async () => {
    const service = new GroupsService({ tenantGroup: { findUnique: jest.fn().mockResolvedValue({ members: [{ tenant: { databaseUrl: 'a' } }, { tenant: { databaseUrl: 'b' } }] }) } } as any, {} as any);
    jest.spyOn(service as any, 'createTenantClient').mockImplementation((id: any) => ({ product: { findMany: async () => [{ id, name: 'Café', unit: 'UN', stock: 10 }, { id: `${id}-new`, name: 'Novo', unit: 'UN', stock: 0 }] }, saleItem: { groupBy: async () => [{ productId: id, _sum: { quantity: 30 } }] }, $disconnect: async () => {} }));
    const forecast = await service.getPurchaseForecast('g', 15);
    expect(forecast).toHaveLength(2);
    expect(forecast.find(r => r.name === 'Café')).toMatchObject({ totalStock: 20, avgDailySales: 2, autonomyDays: 10, suggestion: 10 });
    expect(forecast.find(r => r.name === 'Novo')).toMatchObject({ avgDailySales: 0, autonomyDays: null, suggestion: 0 });
    expect(JSON.stringify(forecast)).not.toMatch(/NaN|Infinity/);
    await expect(service.getPurchaseForecast('g', NaN)).rejects.toThrow('prazo');
  });
});

describe('GroupsService dashboard period', () => {
  it('keeps today and period transaction counts separate and preserves exact end timestamps', async () => {
    const client = {
      sale: {
        aggregate: jest.fn().mockResolvedValueOnce({ _sum: { total: 90 } }).mockResolvedValueOnce({ _sum: { total: 300 } }),
        count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      saleItem: { groupBy: jest.fn().mockResolvedValue([]) }, payment: { groupBy: jest.fn().mockResolvedValue([]) },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) }, product: { findMany: jest.fn().mockResolvedValue([]) }, $disconnect: jest.fn(),
    };
    const service = new GroupsService({ tenantGroup: { findUnique: jest.fn().mockResolvedValue({ name: 'Grupo', members: [{ tenantId: 'a', tenant: { databaseUrl: 'a', name: 'Loja' } }] }) } } as any, {} as any);
    jest.spyOn(service as any, 'createTenantClient').mockReturnValue(client);
    const dashboard = await service.getDashboard('g', '2026-10-01T03:00:00Z', '2026-10-09T13:24:00Z');
    expect(dashboard.tenants[0]).toMatchObject({ salesToday: 90, salesMonth: 300, countToday: 3, countPeriod: 10 });
    expect(client.sale.count.mock.calls[0][0].where.createdAt.lte.toISOString()).toBe('2026-10-09T13:24:00.000Z');
    await expect(service.getDashboard('g', 'not-a-date')).rejects.toThrow('Período inválido');
  });
});
