import { ComandasService } from './comandas.service';

describe('Cancelamento auditável de comanda', () => {
  function setup() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'c', status: 'open' }]),
      comandaActionAuthorization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'auth', authorizationType: 'cashier_pin', authorizedByName: 'PIN do Caixa' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      comanda: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c', number: '12', total: 18, items: [] }),
        update: jest.fn(),
      },
      comandaItem: { updateMany: jest.fn() },
      comandaAssetReservation: { deleteMany: jest.fn() },
      comandaAuditEvent: { create: jest.fn() },
      product: { update: jest.fn() },
      inventoryLog: { create: jest.fn() },
    };
    const db = {
      comanda: { findUnique: jest.fn().mockResolvedValue({ id: 'c', number: '12', total: 18, status: 'open', items: [] }) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new ComandasService(
      { getTenantClient: async () => db } as any,
      { get: () => ({ tenantId: 'tenant' }) } as any,
      { invalidateCache: jest.fn() } as any,
      {} as any,
      { invalidateQueue: jest.fn() } as any,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'c', status: 'cancelled' } as any);
    return { service, tx };
  }

  it('preserva a comanda, itens e registra o cancelamento sem venda', async () => {
    const { service, tx } = setup();
    await expect(service.cancelComanda('c', 'a'.repeat(40), 'Cliente desistiu do pedido', { operatorId: 'waiter', name: 'João' }))
      .resolves.toMatchObject({ status: 'cancelled' });
    expect(tx.comandaItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
    expect(tx.comandaAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'comanda_cancelled', reason: 'Cliente desistiu do pedido' }) }));
    expect(tx.comanda.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled', cancellationAuthorizedByName: 'PIN do Caixa' }) }));
  });

  it('não altera a comanda quando a autorização já expirou ou foi usada', async () => {
    const { service, tx } = setup();
    tx.comandaActionAuthorization.findFirst.mockResolvedValue(null);
    await expect(service.cancelComanda('c', 'a'.repeat(40), 'Cliente desistiu do pedido', { operatorId: 'waiter', name: 'João' }))
      .rejects.toThrow('autorização por PIN');
    expect(tx.comandaItem.updateMany).not.toHaveBeenCalled();
    expect(tx.comanda.update).not.toHaveBeenCalled();
  });
});
