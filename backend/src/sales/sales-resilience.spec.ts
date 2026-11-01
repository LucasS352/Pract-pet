import { ConflictException } from '@nestjs/common';
import { computeSaleFingerprint, isSaleIdentityConflict, normalizeIdempotencyKey } from './sales-idempotency.helper';
import { SalesService } from './sales.service';

const key = '11111111-1111-4111-8111-111111111111';
const request = { idempotencyKey: key, operatorId: 'op', items: [{ productId: 'p1', quantity: 1, priceUnit: 10 }], payments: [{ method: 'dinheiro', value: 10 }] };
const sale = () => ({ id: key, requestFingerprint: computeSaleFingerprint(request), total: 10 });

function service(db: any) {
  return new SalesService({ getTenantClient: async () => db } as any, {} as any, {} as any,
    { get: () => ({ tenantId: 'tenant', userId: 'op' }) } as any, {} as any, {} as any, {} as any);
}

describe('transactional sale identity', () => {
  it('busca apenas itens ativos ao fechar uma comanda, antes de calcular ou cobrar', async () => {
    const stop = new Error('consulta conferida');
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({}) },
      cashRegister: { findUnique: jest.fn().mockResolvedValue({ id: 'caixa', status: 'open' }) },
      comanda: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockImplementation((query: any) => {
          expect(query.include.items.where).toEqual({ status: 'active' });
          throw stop;
        }),
      },
    };
    const db = {
      sale: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    await expect(service(db).checkout({ ...request, comandaId: 'comanda', cashRegisterId: 'caixa' }))
      .rejects.toBe(stop);
    expect(tx.comanda.findUnique).toHaveBeenCalledTimes(1);
  });
  it('returns a committed sale without a file cache or optional client totals', async () => {
    const existing = sale();
    const db = { sale: { findUnique: jest.fn().mockResolvedValue(existing) }, $transaction: jest.fn() };
    expect(await service(db).checkout(request)).toBe(existing);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a different product with identical total and row counts', async () => {
    const db = { sale: { findUnique: async () => sale() } };
    await expect(service(db).checkout({ ...request, items: [{ ...request.items[0], productId: 'p2' }] })).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not fabricate a fingerprint for a legacy sale', async () => {
    const db = { sale: { findUnique: async () => ({ id: key, total: 10 }) } };
    await expect(service(db).checkout(request)).rejects.toBeInstanceOf(ConflictException);
  });
  it('validates the database winner only after the failed transaction rolled back', async () => {
    let rolledBack = false;
    let lookups = 0;
    const existing = sale();
    const db = {
      sale: { findUnique: async () => { if (++lookups === 1) return null; expect(rolledBack).toBe(true); return existing; } },
      $transaction: async () => { rolledBack = true; throw { code: 'P2002', meta: { target: 'PRIMARY' } }; },
    };
    expect(await service(db).checkout(request)).toBe(existing);
    lookups = 0;
    await expect(service(db).checkout({ ...request, discount: 1 })).rejects.toBeInstanceOf(ConflictException);
  });
  it('does not hide collisions on another unique constraint', async () => {
    const error = { code: 'P2002', meta: { target: ['nfceChave'] } };
    const db = { sale: { findUnique: async () => null }, $transaction: async () => { throw error; } };
    await expect(service(db).checkout(request)).rejects.toBe(error);
    expect(isSaleIdentityConflict(error)).toBe(false);
  });
  it('includes inventory intent, detailed payment, prices and fiscal data', () => {
    for (const changed of [
      { ...request, movimentarEstoque: false },
      { ...request, payments: [{ method: 'pix', value: 10 }] },
      { ...request, items: [{ ...request.items[0], priceUnit: 10.0001 }] },
      { ...request, emitirNfce: true },
    ]) expect(computeSaleFingerprint(changed)).not.toBe(computeSaleFingerprint(request));
  });
  it('canonicalizes row ordering and numeric representation, and ignores transport metadata', () => {
    const items = [...request.items, { productId: 'p2', quantity: 2, priceUnit: 5 }];
    expect(computeSaleFingerprint({ ...request, items })).toBe(computeSaleFingerprint({ ...request,
      items: [...items].reverse().map(i => ({ ...i, quantity: String(i.quantity) })), offlineContingency: true, localId: key,
    }));
  });
  it('preserves legacy-key mapping and tenant separation', () => {
    expect(normalizeIdempotencyKey('old-key', 'a')).toBe(normalizeIdempotencyKey('old-key', 'a'));
    expect(normalizeIdempotencyKey('old-key', 'a')).not.toBe(normalizeIdempotencyKey('old-key', 'b'));
  });
});
