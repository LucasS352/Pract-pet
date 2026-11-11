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
