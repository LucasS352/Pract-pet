import { ConflictException } from '@nestjs/common';
import { SalesService } from './sales.service';

function harness(addon = false, appointmentStatus = 'delivered') {
  const tx: any = {
    $queryRaw: jest.fn(),
    sale: {
      findUnique: jest.fn().mockResolvedValue({ id: 'sale-1', status: 'completed', items: [], nfceStatus: null }),
      update: jest.fn().mockResolvedValue({ id: 'sale-1', status: 'cancelled' }),
    },
    comanda: { findFirst: jest.fn().mockResolvedValueOnce({
      notes: `PET2:{"a":"apt-1"${addon ? ',"addon":1' : ''}}`,
      items: [{ notes: 'Serviço Pet Shop:svc-1' }],
    }).mockResolvedValue(null) },
    petCommission: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    petCommissionAdjustment: { create: jest.fn() },
    petAppointmentService: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    petAppointment: {
      findUnique: jest.fn().mockResolvedValue({ status: appointmentStatus, stageHistory: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const db = { $transaction: jest.fn((callback: any) => callback(tx)) };
  const service = new SalesService(
    { getTenantClient: async () => db } as any, {} as any, {} as any,
    { get: () => ({ tenantId: 'tenant', userId: 'admin' }) } as any,
    { invalidateCache: jest.fn() } as any, {} as any, {} as any,
  );
  return { service, tx };
}

describe('estorno de recebimento do Pet Shop', () => {
  it('reabre atendimento comum, libera os serviços e registra o estorno', async () => {
    const { service, tx } = harness();
    await service.cancel('sale-1', 'Pagamento lançado na forma errada');
    expect(tx.petAppointmentService.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: 'apt-1', chargedSaleId: 'sale-1' }, data: { chargedSaleId: null },
    });
    expect(tx.petAppointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'ready', completedAt: null,
      stageHistory: [expect.objectContaining({ kind: 'payment_reversed', saleId: 'sale-1' })],
    }) }));
  });

  it('mantém o status ao estornar um adicional', async () => {
    const { service, tx } = harness(true, 'bathing');
    await service.cancel('sale-1', 'Pagamento adicional incorreto');
    expect(tx.petAppointment.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(tx.petAppointment.update.mock.calls[0][0].data.stageHistory[0].kind).toBe('additional_charge_reversed');
  });

  it('impede estornar a venda principal enquanto há adicional pago', async () => {
    const { service, tx } = harness();
    tx.comanda.findFirst.mockReset()
      .mockResolvedValueOnce({ notes: 'PET2:{"a":"apt-1"}', items: [] })
      .mockResolvedValueOnce({ id: 'additional-payment' });
    await expect(service.cancel('sale-1', 'Pagamento principal incorreto')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.petAppointment.update).not.toHaveBeenCalled();
  });
});
