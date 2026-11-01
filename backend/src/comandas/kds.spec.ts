import { initialKds, assertKdsTransition } from './kds.rules';
import { KdsService } from './kds.service';

describe('KDS opt-in e ciclo de produção', () => {
  it('roteia Bar 1/2 preservando o Bar legado e o módulo desligado', () => {
    for (const station of ['BAR', 'BAR_1', 'BAR_2']) {
      expect(initialKds({ requiresBar: true, barStation: station }, true)).toMatchObject({ kdsDestination: station });
      expect(initialKds({ requiresBar: true, barStation: station }, false)).toEqual({});
    }
  });
  it('não envia produtos antigos nem altera lançamentos com o módulo desligado', () => {
    expect(initialKds({}, true)).toEqual({});
    expect(initialKds({ requiresKitchen: true }, false, false)).toEqual({});
    expect(initialKds({}, false, true)).toEqual({});
  });
  it('envia cozinha e bar para seus destinos e respeita o check', () => {
    expect(initialKds({ requiresKitchen: true }, true, true)).toMatchObject({
      kdsDestination: 'KITCHEN',
      kdsStatus: 'PENDING',
      serveImmediately: false,
    });
    expect(initialKds({ requiresBar: true }, true, true)).toMatchObject({
      kdsDestination: 'BAR',
      kdsStatus: 'PENDING',
      serveImmediately: true,
    });
    expect(initialKds({}, true, false)).toMatchObject({
      kdsDestination: 'SERVICE',
      kdsStatus: 'READY',
      serveImmediately: false,
    });
    expect(initialKds({}, true, true)).toMatchObject({
      kdsDestination: 'SERVICE',
      kdsStatus: 'READY',
      kdsReadyAt: expect.any(Date),
    });
  });
  it('rejeita check inválido e saltos ou regressões de estado', () => {
    expect(() => initialKds({}, true, 'false' as any)).toThrow();
    for (const [from, to] of [
      [null, 'READY'],
      ['PENDING', 'DELIVERED'],
      ['READY', 'PREPARING'],
      ['DELIVERED', 'DELIVERED'],
    ])
      expect(() => assertKdsTransition(from, to!)).toThrow();
    expect(() => assertKdsTransition('PENDING', 'PREPARING')).not.toThrow();
    expect(() => assertKdsTransition('PREPARING', 'READY')).not.toThrow();
    expect(() => assertKdsTransition('READY', 'DELIVERED')).not.toThrow();
  });
  it('Carvoaria funciona isolada e mantém preparo sem iniciar ronda', () => {
    expect(initialKds({ requiresCarvoaria: true }, false, true, true)).toMatchObject({ kdsDestination: 'CARVOARIA', kdsStatus: 'PENDING', serveImmediately: false });
    expect(initialKds({ requiresKitchen: true }, false, false, true)).toEqual({});
  });
});

describe('KDS isolamento e entrega', () => {
  function setup(enabled = true) {
    const tx = {
      comandaItem: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'c1', status: 'open' }]),
    };
    const client = { ...tx, $transaction: (fn: any) => fn(tx) };
    const manager = { getTenantClient: jest.fn().mockResolvedValue(client) };
    const context = {
      get: () => ({ tenantId: 'tenant-a', databaseUrl: 'db-a' }),
    };
    const heart = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ modulos: JSON.stringify({ kds: enabled }) }),
      },
    };
    const service = new KdsService(
      heart as any,
      manager as any,
      context as any,
    );
    return { service, tx, manager, heart };
  }
  const ready = {
    id: 'i1',
    comandaId: 'c1',
    kdsStatus: 'READY',
    kdsDestination: 'BAR',
    serveImmediately: false,
    comanda: { status: 'open' },
  };
  it('filtra consulta no servidor e nega alteração de outra estação', async () => {
    const { service, tx } = setup();
    tx.comandaItem.findMany.mockResolvedValue([]);
    await service.tickets('BAR_1');
    expect(tx.comandaItem.findMany.mock.calls[0][0].where.kdsDestination).toEqual({ in: ['BAR_1'] });
    tx.comandaItem.findMany.mockResolvedValue([ready]);
    await expect(service.update(['i1'], 'DELIVERED', 'KITCHEN')).rejects.toThrow('Estação não está ativa');
    expect(tx.comandaItem.updateMany).not.toHaveBeenCalled();
  });
  it('inicia ronda somente em DELIVERED e respeita a duração fotografada', async () => {
    const { service, tx, heart } = setup();
    heart.tenant.findUnique.mockResolvedValue({ modulos: JSON.stringify({ carvoaria: true }) });
    expect(await service.config()).toMatchObject({ enabled: true, kdsEnabled: false, stations: ['CARVOARIA'] });
    const item = { ...ready, kdsDestination: 'CARVOARIA', timerMinutes: 30, timerStartedAt: null };
    tx.comandaItem.findMany.mockResolvedValue([{ ...item, kdsStatus: 'PREPARING' }]);
    await service.update(['i1'], 'READY');
    expect(tx.comandaItem.updateMany.mock.calls[0][0].data.timerStartedAt).toBeUndefined();
    tx.comandaItem.findMany.mockResolvedValue([item]);
    await service.update(['i1'], 'DELIVERED');
    const data = tx.comandaItem.updateMany.mock.calls[1][0].data;
    expect(data.timerDueAt.getTime() - data.timerStartedAt.getTime()).toBe(30 * 60_000);
    expect(tx.comandaItem.count).not.toHaveBeenCalled();
  });
  it('lote de 100 itens usa um bloqueio e uma atualização, preservando CAS', async () => {
    const { service, tx } = setup();
    const items = Array.from({ length: 100 }, (_, i) => ({ ...ready, id: `i${i}`, serveImmediately: true }));
    tx.comandaItem.findMany.mockResolvedValue(items);
    tx.comandaItem.updateMany.mockResolvedValue({ count: 100 });
    await expect(service.update(items.map(i => i.id), 'DELIVERED')).resolves.toEqual({ updated: 100 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.comandaItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.comandaItem.updateMany.mock.calls[0][0].where.kdsStatus).toBe('READY');
  });
  it('bloqueia leitura e escrita com módulo desativado', async () => {
    const { service, manager } = setup(false);
    await expect(service.tickets()).rejects.toThrow('KDS não está ativo');
    await expect(service.update(['i1'], 'DELIVERED')).rejects.toThrow(
      'KDS não está ativo',
    );
    expect(manager.getTenantClient).not.toHaveBeenCalled();
  });
  it('consulta somente o banco do tenant, comandas ativas e itens não entregues', async () => {
    const { service, manager, tx } = setup();
    await service.tickets();
    expect(manager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'db-a');
    expect(tx.comandaItem.findMany.mock.calls[0][0].where).toEqual({
      status: 'active',
      kdsStatus: { in: ['PENDING', 'PREPARING', 'READY'] },
      kdsDestination: { in: ['KITCHEN', 'BAR', 'BAR_1', 'BAR_2', 'SERVICE'] },
      comanda: { status: { in: ['open', 'waiting_payment'] } },
    });
  });
  it('não entrega bebida junto enquanto a cozinha prepara comida', async () => {
    const { service, tx } = setup();
    tx.comandaItem.findMany.mockResolvedValue([ready]);
    tx.comandaItem.count.mockResolvedValue(1);
    await expect(service.update(['i1'], 'DELIVERED')).rejects.toThrow(
      'Aguarde a cozinha',
    );
    expect(tx.comandaItem.updateMany).not.toHaveBeenCalled();
  });
  it('entrega imediata independe da cozinha, sem fechar comanda ou mexer no valor', async () => {
    const { service, tx } = setup();
    tx.comandaItem.findMany.mockResolvedValue([
      { ...ready, serveImmediately: true },
    ]);
    await expect(service.update(['i1'], 'DELIVERED')).resolves.toEqual({
      updated: 1,
    });
    expect(tx.comandaItem.count).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.comandaItem.updateMany.mock.calls[0][0].data).toEqual({
      kdsStatus: 'DELIVERED',
      kdsDeliveredAt: expect.any(Date),
    });
  });
  it('impede duplicação por concorrência e alterações em itens de comandas encerradas', async () => {
    const { service, tx } = setup();
    tx.comandaItem.findMany.mockResolvedValue([ready]);
    tx.comandaItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update(['i1'], 'DELIVERED')).rejects.toThrow(
      'outra tela',
    );
    tx.comandaItem.findMany.mockResolvedValue([
      { ...ready, comanda: { status: 'closed' } },
    ]);
    await expect(service.update(['i1'], 'DELIVERED')).rejects.toThrow(
      'encerrada',
    );
  });
  it('não aceita IDs inexistentes nem lotes duplicados', async () => {
    const { service, tx } = setup();
    await expect(service.update(['i1', 'i1'], 'READY')).rejects.toThrow(
      'distintos',
    );
    tx.comandaItem.findMany.mockResolvedValue([]);
    await expect(service.update(['foreign-id'], 'READY')).rejects.toThrow(
      'não encontrado',
    );
  });
});
