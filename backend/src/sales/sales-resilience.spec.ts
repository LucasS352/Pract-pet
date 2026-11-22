import { ConflictException } from '@nestjs/common';
import { computeSaleFingerprint, isSaleIdentityConflict, normalizeIdempotencyKey } from './sales-idempotency.helper';
import { SalesService } from './sales.service';

const key = '11111111-1111-4111-8111-111111111111';
const request = { idempotencyKey: key, operatorId: 'op', items: [{ productId: 'p1', quantity: 1, priceUnit: 10 }], payments: [{ method: 'dinheiro', value: 10 }] };
const sale = () => ({ id: key, requestFingerprint: computeSaleFingerprint(request), total: 10 });

function service(db: any) {
  return new SalesService({ getTenantClient: async () => db } as any, { tenant: { findUnique: async () => ({ modulos: {} }) } } as any, {} as any,
    { get: () => ({ tenantId: 'tenant', userId: 'op' }) } as any, {} as any, {} as any, {} as any);
}

describe('transactional sale identity', () => {
  it('bloqueia PDV desativado antes de consultar ou cobrar uma venda', async () => {
    const target = service({});
    (target as any).heartPrisma = { tenant: { findUnique: async () => ({ modulos: { pdv: false } }) } };
    await expect(target.checkout(request)).rejects.toThrow('PDV desabilitado');
  });
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

  it('rejeita quantidade negativa, desconto maior que subtotal e pagamento insuficiente no checkout', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ allowNegativeStock: true }) },
      cashRegister: { findUnique: jest.fn().mockResolvedValue({ id: 'caixa', status: 'open' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Ração', unit: 'KG', stock: 10, priceCost: 10, priceSell: 20, modifierGroups: [] }]) },
    };
    const db = {
      sale: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const target = service(db);

    await expect(target.checkout({
      idempotencyKey: '22222222-2222-4222-8222-222222222221',
      cashRegisterId: 'caixa',
      items: [{ productId: 'p1', quantity: -1, priceUnit: 20 }],
      payments: [{ method: 'dinheiro', value: 20 }],
    })).rejects.toThrow('Quantidade inválida');

    await expect(target.checkout({
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      cashRegisterId: 'caixa',
      items: [{ productId: 'p1', quantity: 1, priceUnit: 20 }],
      discount: 25,
      payments: [{ method: 'dinheiro', value: 0 }],
    })).rejects.toThrow('desconto');

    await expect(target.checkout({
      idempotencyKey: '22222222-2222-4222-8222-222222222223',
      cashRegisterId: 'caixa',
      items: [{ productId: 'p1', quantity: 1, priceUnit: 20 }],
      payments: [{ method: 'dinheiro', value: 5 }],
    })).rejects.toThrow('inferior');
  });

  it('incrementa salesCount como inteiro seguro em venda de quantidade fracionada', async () => {
    const productUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ allowNegativeStock: true, paymentMethodsConfig: {} }) },
      cashRegister: { findUnique: jest.fn().mockResolvedValue({ id: 'caixa', status: 'open' }) },
      tenantPaymentMethod: { findMany: jest.fn().mockResolvedValue([]) },
      operator: { findUnique: jest.fn().mockResolvedValue({ id: 'op' }) },
      stockLot: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'lot-1', costPrice: 10 }) },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Ração Granel', unit: 'KG', stock: 10, priceCost: 10, priceSell: 20, modifierGroups: [], category: { name: 'Rações' } }]),
        update: productUpdate,
      },
      sale: {
        findFirst: jest.fn().mockResolvedValue({ code: 1 }),
        create: jest.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', code: 2, total: 7, emitirNfce: false }),
        findUnique: jest.fn().mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', items: [], payments: [] }),
      },
      saleItem: { create: jest.fn().mockResolvedValue({}) },
      inventoryLog: { createMany: jest.fn().mockResolvedValue({}) },
      saleDeliveryJob: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      sale: { findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: '33333333-3333-4333-8333-333333333333', items: [], payments: [] }) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const target = service(db);
    (target as any).productsService = { invalidateCache: jest.fn() };
    (target as any).integrationsService = { syncProductStock: jest.fn().mockResolvedValue(undefined) };

    await target.checkout({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      cashRegisterId: 'caixa',
      operatorId: 'op',
      emitirNfce: false,
      items: [{ productId: 'p1', quantity: 0.35, priceUnit: 20 }],
      payments: [{ method: 'dinheiro', value: 7 }],
    });

    expect(productUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ salesCount: { increment: 1 } }),
    }));
  });
});
