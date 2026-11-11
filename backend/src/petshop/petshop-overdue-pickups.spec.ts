import { PetshopService } from './petshop.service';
import { serializeAppointmentTransport, normalizeTransport } from './petshop-transport';

describe('coletas antigas do Táxi Dog', () => {
  it('consulta somente estados abertos no tenant atual e mantém apenas modalidades com coleta', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'old-pickup', status: 'scheduled', checkInNotes: serializeAppointmentTransport(normalizeTransport({ enabled: true, mode: 'pickup', address: 'Rua A' })) },
      { id: 'old-dropoff', status: 'scheduled', checkInNotes: serializeAppointmentTransport(normalizeTransport({ enabled: true, mode: 'dropoff', address: 'Rua B' })) },
      { id: 'not-taxi', status: 'scheduled', checkInNotes: null },
    ]);
    const tenantClient = { petAppointment: { findMany } };
    const tenantManager = { getTenantClient: jest.fn().mockResolvedValue(tenantClient) };
    const tenantContext = { get: jest.fn().mockReturnValue({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) };
    const pricing = { resolveAppointmentStages: jest.fn().mockReturnValue([]) };
    const service = new PetshopService(tenantManager as any, tenantContext as any, {} as any, {} as any, {} as any, pricing as any, {} as any, {} as any);

    const cutoff = '2026-11-10T03:00:00.000Z';
    const result = await service.listOverduePickups(cutoff);

    expect(tenantManager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'isolated-db');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      startsAt: { lt: new Date(cutoff) },
      status: { in: ['requested', 'scheduled', 'confirmed'] },
      checkInNotes: { contains: '"transport"' },
    } }));
    expect(result.map((item: any) => item.id)).toEqual(['old-pickup']);
  });
});

describe('busca de tutor para agendamento', () => {
  it('não carrega o cadastro inteiro e limita a busca no tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'tutor-1', name: 'Ana', phone: '14999990000' }]);
    const tenantManager = { getTenantClient: jest.fn().mockResolvedValue({ customer: { findMany } }) };
    const tenantContext = { get: jest.fn().mockReturnValue({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) };
    const service = new PetshopService(tenantManager as any, tenantContext as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    expect(await service.searchTutorsForBooking('a')).toEqual([]);
    expect(tenantManager.getTenantClient).not.toHaveBeenCalled();
    expect(await service.searchTutorsForBooking('Ana')).toHaveLength(1);
    expect(tenantManager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'isolated-db');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, name: true, phone: true }, take: 20,
      where: { OR: [{ name: { contains: 'Ana' } }, { phone: { contains: 'Ana' } }] },
    }));
  });

  it('não mistura resultados de dois tenants no mesmo gerenciador de conexões', async () => {
    const clients = {
      'tenant-a': { customer: { findMany: jest.fn().mockResolvedValue([{ id: 'ana', name: 'Ana', phone: '14999990000' }]) } },
      'tenant-b': { customer: { findMany: jest.fn().mockResolvedValue([{ id: 'bia', name: 'Bia', phone: '14999990001' }]) } },
    };
    const tenantManager = { getTenantClient: jest.fn((tenantId: 'tenant-a' | 'tenant-b') => clients[tenantId]) };
    const makeService = (tenantId: 'tenant-a' | 'tenant-b') => new PetshopService(
      tenantManager as any,
      { get: () => ({ tenantId, databaseUrl: `db-${tenantId}` }) } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    expect((await makeService('tenant-a').searchTutorsForBooking('Ana')).map(item => item.id)).toEqual(['ana']);
    expect((await makeService('tenant-b').searchTutorsForBooking('Ana')).map(item => item.id)).toEqual(['bia']);
    expect(tenantManager.getTenantClient.mock.calls).toEqual([
      ['tenant-a', 'db-tenant-a'],
      ['tenant-b', 'db-tenant-b'],
    ]);
  });
});

describe('clientes frequentes e diretório do agendamento', () => {
  const makeService = (tenantClient: any) => {
    const tenantManager = { getTenantClient: jest.fn().mockResolvedValue(tenantClient) };
    const tenantContext = { get: jest.fn().mockReturnValue({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) };
    return {
      service: new PetshopService(tenantManager as any, tenantContext as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any),
      tenantManager,
    };
  };

  it('exibe somente visitas reais do tenant, ordenadas pela movimentação e com o pet da última visita', async () => {
    const lastVisit = new Date('2026-11-10T15:00:00.000Z');
    const groupBy = jest.fn().mockResolvedValue([{ customerId: 'tutor-1', _count: { id: 12 }, _max: { startsAt: lastVisit } }]);
    const findFirst = jest.fn().mockResolvedValue({ pet: { id: 'pet-1', name: 'Leo', species: 'dog', photoUrl: null } });
    const findMany = jest.fn().mockResolvedValue([{ id: 'tutor-1', name: 'Lucas', phone: '14999990000', photoUrl: null }]);
    const { service, tenantManager } = makeService({ petAppointment: { groupBy, findFirst }, customer: { findMany } });

    expect(await service.listFrequentTutorsForBooking()).toEqual([{ id: 'tutor-1', name: 'Lucas', phone: '14999990000', photoUrl: null, pet: { id: 'pet-1', name: 'Leo', species: 'dog', photoUrl: null }, appointmentsCount: 12, lastVisitAt: lastVisit }]);
    expect(tenantManager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'isolated-db');
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['customerId'], take: 8,
      where: expect.objectContaining({ status: { in: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready', 'delivered'] }, startsAt: { lte: expect.any(Date) }, pet: { is: { active: true } } }),
      orderBy: [{ _count: { id: 'desc' } }, { _max: { startsAt: 'desc' } }],
    }));
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: 'tutor-1' }) }));
  });

  it('pagina o diretório sem carregar todos os clientes', async () => {
    const findMany = jest.fn().mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({ id: `tutor-${index}`, name: `Tutor ${index}`, phone: '14999990000' })));
    const { service } = makeService({ customer: { findMany } });
    const result = await service.listBookingTutorDirectory('2');
    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.page).toBe(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 21, select: { id: true, name: true, phone: true } }));
    await expect(service.listBookingTutorDirectory('0')).rejects.toThrow('Página inválida');
  });
});

describe('cobrança antecipada de agendamento', () => {
  const setup = (status: string, paid: boolean) => {
    const tx = {
      $queryRaw: jest.fn(),
      petAppointment: { findUnique: jest.fn().mockResolvedValue({ id: 'apt', status, completedAt: null }) },
      comanda: { findFirst: jest.fn().mockResolvedValue(paid ? { id: 'paid' } : null) },
    };
    const tenantClient = { $transaction: (callback: any) => callback(tx) };
    const tenantManager = { getTenantClient: jest.fn().mockResolvedValue(tenantClient) };
    const service = new PetshopService(tenantManager as any, { get: () => ({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, tx, tenantManager };
  };

  it('prepara pagamento no agendamento sem concluir os cuidados', async () => {
    const { service, tx, tenantManager } = setup('scheduled', false);
    jest.spyOn(service as any, 'ensureComandaForAppointment').mockResolvedValue({ id: 'cmd', total: 40 });
    expect(await service.prepareCheckout('apt', true)).toEqual({ id: 'cmd', total: 40 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tenantManager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'isolated-db');
  });

  it('impede segunda cobrança e permite concluir entrega já paga', async () => {
    const { service } = setup('ready', true);
    expect(await service.prepareCheckout('apt')).toEqual({ prepaid: true, total: 0 });
    await expect(service.prepareCheckout('apt', true)).rejects.toThrow('já pago');
  });

  it('usa a comanda na identidade da venda para permitir nova cobrança após estorno', async () => {
    const checkout = jest.fn().mockResolvedValue({ id: 'sale-new' });
    const service = new PetshopService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { checkout } as any);
    jest.spyOn(service, 'prepareCheckout').mockResolvedValue({ id: 'cmd-new', total: 40 } as any);
    await service.receivePayment('apt', { prepay: true, payments: [{ method: 'pix', value: 40 }] }, { headers: {}, user: { role: 'admin' } });
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'petshop-receipt:apt:cmd-new', petshopPrepayment: true, comandaId: 'cmd-new',
    }), true);
  });
  it('localiza a venda ativa somente no banco do tenant do atendimento', async () => {
    const tenantClient = {
      petAppointment: { findUnique: jest.fn().mockResolvedValue({ id: 'apt' }) },
      comanda: { findFirst: jest.fn().mockResolvedValue({ sale: { id: 'sale-1', total: 40, createdAt: new Date('2026-11-11T12:00:00Z'), nfceStatus: null } }) },
    };
    const manager = { getTenantClient: jest.fn().mockResolvedValue(tenantClient) };
    const service = new PetshopService(manager as any, { get: () => ({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    expect((await service.appointmentPayment('apt'))?.saleId).toBe('sale-1');
    expect(manager.getTenantClient).toHaveBeenCalledWith('tenant-a', 'isolated-db');
    expect(tenantClient.comanda.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ notes: { contains: 'apt' }, status: 'closed' }) }));
  });
  it('estorna a venda ativa com motivo e bloqueia NFC-e autorizada', async () => {
    const sale = { id: 'sale-1', total: 40, createdAt: new Date(), nfceStatus: null };
    const tenantClient = { petAppointment: { findUnique: jest.fn().mockResolvedValue({ id: 'apt' }) }, comanda: { findFirst: jest.fn().mockResolvedValue({ sale }) } };
    const cancel = jest.fn().mockResolvedValue({ id: sale.id, status: 'cancelled' });
    const service = new PetshopService({ getTenantClient: () => tenantClient } as any, { get: () => ({ tenantId: 'tenant-a', databaseUrl: 'isolated-db' }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, { cancel } as any);
    await expect(service.reverseAppointmentPayment('apt', 'Cancelamento solicitado pelo tutor')).resolves.toEqual({ id: sale.id, status: 'cancelled' });
    expect(cancel).toHaveBeenCalledWith('sale-1', 'Cancelamento solicitado pelo tutor');
    await expect(service.reverseAppointmentPayment('apt', 'Curto')).rejects.toThrow('pelo menos 15 caracteres');
    sale.nfceStatus = 'autorizada' as any;
    await expect(service.reverseAppointmentPayment('apt', 'Cancelamento solicitado pelo tutor')).rejects.toThrow('NFC-e autorizada');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
