import { nextOccurrence, ensureFutureOccurrences } from './payable-recurrence';
import { PayablesService } from './payables.service';

describe('monthly payables', () => {
  const seed = { description: 'Aluguel', amount: 100, dueDate: new Date('2026-01-31T12:00:00Z'), type: 'FIXED', status: 'PENDING', isRecurring: true };
  function fixture() {
    let rows: any[] = [];
    let sequence = 0;
    const match = (r: any, w: any) => Object.entries(w).every(([k, v]) => r[k] === v);
    const tx: any = { $queryRaw: jest.fn(), payable: {
      create: jest.fn(async ({ data }) => { const r = { id: String(++sequence), ...data }; rows.push(r); return { ...r }; }),
      findUnique: jest.fn(async ({ where }) => { const r = rows.find(r => r.id === where.id); return r ? { ...r } : null; }),
      update: jest.fn(async ({ where, data }) => { const r = rows.find(r => r.id === where.id); Object.assign(r, data); return { ...r }; }),
      updateMany: jest.fn(async ({ where, data }) => { rows.filter(r => match(r, where)).forEach(r => Object.assign(r, data)); }),
      upsert: jest.fn(async ({ where, create }) => rows.find(r => match(r, where.recurrenceId_recurrenceMonth)) || tx.payable.create({ data: create })),
    } };
    const prisma = { $transaction: jest.fn(async (work: any, options: any) => {
      expect(options.isolationLevel).toBe('ReadCommitted');
      const before = rows.map(r => ({ ...r }));
      try { return await work(tx); } catch (e) { rows = before; throw e; }
    }) };
    const service = new PayablesService({ getTenantClient: () => prisma } as any, { get: () => ({ tenantId: 'test' }) } as any);
    return { service, tx, rows: () => rows };
  }
  test.each([
    ['2026-01', 31, 1, '2026-02-28'], ['2026-01', 31, 2, '2026-03-31'],
    ['2028-01', 31, 1, '2028-02-29'], ['2026-12', 30, 2, '2027-02-28'],
    ['2026-02', 31, 1, '2026-03-31'],
  ])('calendar %s day %s +%s', (month, day, offset, expected) => {
    expect(nextOccurrence(month, day, offset).dueDate.toISOString().slice(0, 10)).toBe(expected);
  });
  test('creates current + two pending months before payment', async () => {
    const f = fixture(); await f.service.createPayable(seed);
    expect(f.rows().map(r => r.recurrenceMonth)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(f.rows().every(r => r.status === 'PENDING')).toBe(true);
  });
  test('paid root does not mark future occurrences paid', async () => {
    const f = fixture(); await f.service.createPayable({ ...seed, status: 'PAID' });
    expect(f.rows().map(r => r.status)).toEqual(['PAID', 'PENDING', 'PENDING']);
  });
  test('same description creates independent series; ignores client identity', async () => {
    const f = fixture(); await f.service.createPayable({ ...seed, recurrenceId: 'untrusted' }); await f.service.createPayable(seed);
    expect(f.rows()).toHaveLength(6);
    expect(new Set(f.rows().map(r => r.recurrenceId)).size).toBe(2);
    expect(f.rows().some(r => r.recurrenceId === 'untrusted')).toBe(false);
  });
  test('pay repeatedly without duplicates; later month extends horizon', async () => {
    const f = fixture(); const root: any = await f.service.createPayable(seed);
    await f.service.payPayable(root.id); await f.service.payPayable(root.id);
    expect(f.rows()).toHaveLength(3);
    await f.service.payPayable(f.rows()[1].id);
    expect(f.rows().map(r => r.recurrenceMonth)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });
  test('deleted occurrence is not resurrected; existing edits preserved', async () => {
    const f = fixture(); const root: any = await f.service.createPayable(seed);
    await f.service.deletePayable(f.rows()[1].id);
    f.rows()[2].amount = 150;
    await f.service.payPayable(root.id);
    expect(f.rows()).toHaveLength(3);
    expect(f.rows()[1].status).toBe('CANCELLED'); expect(f.rows()[2].amount).toBe(150);
  });
  test('stop series preserves created rows and prevents future generation', async () => {
    const f = fixture(); const root: any = await f.service.createPayable(seed);
    await f.service.updatePayable(root.id, { isRecurring: false });
    await f.service.payPayable(f.rows()[2].id);
    expect(f.rows()).toHaveLength(3); expect(f.rows().every(r => !r.isRecurring)).toBe(true);
  });
  test('atomic create rolls back if future insertion fails', async () => {
    const f = fixture(); f.tx.payable.upsert.mockRejectedValue(new Error('write failed'));
    await expect(f.service.createPayable(seed)).rejects.toThrow('write failed'); expect(f.rows()).toHaveLength(0);
  });
  test('nonrecurring fixed and variable do not anticipate', async () => {
    const f = fixture(); await f.service.createPayable({ ...seed, isRecurring: false });
    await f.service.createPayable({ ...seed, type: 'VARIABLE' }); expect(f.rows()).toHaveLength(2);
  });
  test('legacy has no inferred series or backfill', async () => {
    const f = fixture(); await f.tx.payable.create({ data: seed });
    await f.service.updatePayable(f.rows()[0].id, { amount: 200 }); expect(f.rows()).toHaveLength(1);
    expect(f.rows()[0].recurrenceId).toBeUndefined();
  });
  test('helper skips cancelled rows', async () => {
    const upsert = jest.fn(); await ensureFutureOccurrences({ payable: { upsert } }, { ...seed, recurrenceId: 'x', status: 'CANCELLED' }, 2);
    expect(upsert).not.toHaveBeenCalled();
  });
});
