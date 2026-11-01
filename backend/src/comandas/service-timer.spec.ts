import { extendTimer, releaseComandaAssets, serviceSnapshot } from './service-timer.rules';
import { ComandasService } from './comandas.service';

describe('Narguilaria: patrimônio e prazos de atendimento', () => {
  const product = { requiresCarvoaria: true, serviceTimerMinutes: 30, assetTrackingTotal: 40 };
  it('preserva produtos legados sem criar rondas', () => {
    expect(serviceSnapshot({}, undefined, 2, false)).toEqual({});
  });
  it('reserva uma etiqueta válida com duração fotografada, sem iniciar timer', () => {
    expect(serviceSnapshot(product, 7, 1, true)).toEqual({ assetNumber: 7, timerMinutes: 30 });
  });
  it.each([undefined, null, 0, -1, 41, 1.5, '7'])('recusa etiqueta inválida %s', value => {
    expect(() => serviceSnapshot(product, value, 1, true)).toThrow();
  });
  it('recusa múltiplas unidades com uma etiqueta e módulo desligado', () => {
    expect(() => serviceSnapshot(product, 7, 2, true)).toThrow();
    expect(() => serviceSnapshot(product, 7, 1, false)).toThrow();
  });
  it('não exige patrimônio em um rosh sem rastreamento', () => {
    expect(serviceSnapshot({ requiresCarvoaria: true }, undefined, 2, true)).toEqual({ assetNumber: null, timerMinutes: null });
  });
  it('concede 15 minutos completos mesmo após 10 minutos de atraso', () => {
    expect(extendTimer(new Date('2026-09-16T12:30:00Z'), 15, new Date('2026-09-16T12:40:00Z')).toISOString())
      .toBe('2026-09-16T12:55:00.000Z');
  });
  it('não encurta o prazo ao prorrogar antes de vencer', () => {
    expect(extendTimer(new Date('2026-09-16T12:30:00Z'), 15, new Date('2026-09-16T12:10:00Z')).toISOString())
      .toBe('2026-09-16T12:45:00.000Z');
    expect(() => extendTimer(new Date(), 999, new Date())).toThrow();
  });
  it('libera reservas e encerra rondas da mesma comanda no fechamento', async () => {
    const tx = { comandaItem: { updateMany: jest.fn() }, comandaAssetReservation: { deleteMany: jest.fn() } };
    await releaseComandaAssets(tx, 'c1');
    expect(tx.comandaItem.updateMany.mock.calls[0][0].where.comandaId).toBe('c1');
    expect(tx.comandaAssetReservation.deleteMany).toHaveBeenCalledWith({ where: { item: { comandaId: 'c1' } } });
  });

  function setup(overrides = {}) {
    const row = { id: 'i', comandaId: 'c', assetNumber: 7, timerMinutes: 30, kdsStatus: 'DELIVERED',
      timerStartedAt: new Date('2026-09-16T12:00:00Z'), timerDueAt: new Date('2026-09-16T12:30:00Z'), assetReturnedAt: null, ...overrides };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'c', status: 'open' }]),
      comandaItem: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue(row) },
      comandaAssetReservation: { deleteMany: jest.fn() } };
    const db = { $transaction: jest.fn(fn => fn(tx)) };
    const service = new ComandasService({ getTenantClient: async () => db } as any,
      { get: () => ({ tenantId: 'test' }) } as any, {} as any, {} as any,
      { config: async () => ({ carvoariaEnabled: true }) } as any);
    return { service, tx };
  }
  it('recusa prorrogação de uma versão antiga, evitando extensão duplicada', async () => {
    const { service, tx } = setup();
    await expect(service.snoozeTimer('c', 'i', 15, '2026-09-16T12:00:00Z')).rejects.toThrow('outra tela');
    expect(tx.comandaItem.update).not.toHaveBeenCalled();
  });
  it('recolhe sem alterar preço ou estoque e é idempotente após devolução', async () => {
    const { service, tx } = setup();
    await service.returnAsset('c', 'i');
    expect(tx.comandaAssetReservation.deleteMany).toHaveBeenCalledWith({ where: { comandaItemId: 'i' } });
    expect(tx.comandaItem.update).toHaveBeenCalledWith({ where: { id: 'i' }, data: { assetReturnedAt: expect.any(Date) } });
    const returned = setup({ assetReturnedAt: new Date() });
    await returned.service.returnAsset('c', 'i');
    expect(returned.tx.comandaItem.update).not.toHaveBeenCalled();
  });
  it('impede recolher antes da entrega ou alterar outra comanda', async () => {
    await expect(setup({ kdsStatus: 'READY' }).service.returnAsset('c', 'i')).rejects.toThrow('entregues');
    const { service, tx } = setup();
    tx.comandaItem.findFirst.mockResolvedValue(null as any);
    await expect(service.returnAsset('other', 'i')).rejects.toThrow('nesta comanda');
    expect(tx.comandaItem.findFirst).toHaveBeenCalledWith({ where: { id: 'i', comandaId: 'other', status: 'active' } });
  });
});
