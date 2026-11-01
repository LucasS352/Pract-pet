import { SalesDeliveryService } from './sales-delivery.service';

function fixture(kind = 'STOCK', status = 'PENDING') {
  const row: any = { id: 'job', saleId: 'sale', kind, status, payload: '{"productIds":["p"]}', attempts: 0,
    availableAt: new Date(0), claimedAt: new Date(0), claimToken: 'old' };
  const sale: any = { id: 'sale', nfceStatus: 'pendente', status: 'completed' };
  function matches(where: any) {
    return Object.entries(where).every(([key, value]: [string, any]) => {
      if (value?.lt) return row[key] < value.lt;
      if (value?.lte) return row[key] <= value.lte;
      return row[key] === value;
    });
  }
  const db: any = {
    saleDeliveryJob: {
      findMany: async ({ where }: any) => matches(where) ? [{ ...row }] : [],
      updateMany: async ({ where, data }: any) => {
        if (!matches(where)) return { count: 0 };
        for (const [key, value] of Object.entries(data) as any) row[key] = value?.increment ? row[key] + value.increment : value;
        return { count: 1 };
      },
    },
    sale: {
      findUnique: async () => sale,
      updateMany: async ({ data }: any) => { Object.assign(sale, data); return { count: 1 }; },
    },
    $transaction: async (work: any) => work(db),
  };
  const integrations = { syncProductStock: jest.fn().mockResolvedValue(undefined) };
  const sales = { dispararNfce: jest.fn().mockImplementation(async () => { sale.nfceStatus = 'autorizada'; }) };
  const worker = () => new SalesDeliveryService({} as any, {} as any, sales as any, integrations as any);
  return { db, row, sale, integrations, sales, worker };
}

describe('durable sale delivery', () => {
  it('only one worker owns a pending job', async () => {
    const f = fixture();
    await Promise.all([f.worker().deliverTenant(f.db, 'tenant', 'db'), f.worker().deliverTenant(f.db, 'tenant', 'db')]);
    expect(f.integrations.syncProductStock).toHaveBeenCalledTimes(1);
    expect(f.row.status).toBe('DONE');
  });
  it('preserves failed stock delivery and retries after restart/backoff', async () => {
    const f = fixture();
    f.integrations.syncProductStock.mockRejectedValueOnce(new Error('Network down'));
    await f.worker().deliverTenant(f.db, 'tenant', 'db');
    expect(f.row.status).toBe('PENDING');
    expect(f.row.lastError).toContain('Network down');
    f.row.availableAt = new Date(0);
    await f.worker().deliverTenant(f.db, 'tenant', 'db');
    expect(f.row.status).toBe('DONE');
  });
  it('recovers abandoned stock work with an absolute-stock update', async () => {
    const f = fixture('STOCK', 'PROCESSING');
    await f.worker().deliverTenant(f.db, 'tenant', 'db');
    expect(f.integrations.syncProductStock).toHaveBeenCalledWith('tenant', ['p'], true);
    expect(f.row.status).toBe('DONE');
  });
  it('does not blindly re-emit a fiscal request interrupted after dispatch', async () => {
    const f = fixture('NFCE', 'PROCESSING');
    await f.worker().deliverTenant(f.db, 'tenant', 'db');
    expect(f.sales.dispararNfce).not.toHaveBeenCalled();
    expect(f.row.status).toBe('REVIEW');
    expect(f.sale.nfceMotivoRejeicao).toContain('desconhecido');
  });
  it('records completion for a newly authorized fiscal job', async () => {
    const f = fixture('NFCE');
    await f.worker().deliverTenant(f.db, 'tenant', 'db');
    expect(f.sales.dispararNfce).toHaveBeenCalledTimes(1);
    expect(f.row.status).toBe('DONE');
  });
});
