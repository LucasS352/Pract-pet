import { PetshopService } from './petshop.service';

describe('PetshopService — flag isPaid / paidAmount na listagem e overview', () => {
  const createServiceWithPrisma = (prismaMock: any) => {
    const manager = { getTenantClient: jest.fn().mockResolvedValue(prismaMock) };
    const ctx = { get: () => ({ tenantId: 'tenant-1', databaseUrl: 'db-1' }) };
    const pricing = { resolveAppointmentStages: jest.fn().mockReturnValue([]) };
    return new PetshopService(
      manager as any,
      ctx as any,
      {} as any,
      {} as any,
      {} as any,
      pricing as any,
      {} as any,
      {} as any,
    );
  };

  it('marca isPaid=true com valor pago para atendimentos com comanda fechada e venda concluída', async () => {
    const paidAt = new Date('2026-11-15T15:30:00.000Z');
    const prismaMock = {
      petAppointment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'app-paid', status: 'scheduled', checkInNotes: null, services: [] },
          { id: 'app-unpaid', status: 'scheduled', checkInNotes: null, services: [] },
        ]),
      },
      comanda: {
        findMany: jest.fn().mockResolvedValue([
          {
            notes: 'PET2:{"v":2,"a":"app-paid"}',
            sale: { id: 'sale-1', total: 70, createdAt: paidAt },
          },
        ]),
      },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.listAppointments();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'app-paid', isPaid: true, paidAmount: 70, paidAt });
    expect(result[1]).toMatchObject({ id: 'app-unpaid', isPaid: false, paidAmount: null, paidAt: null });
  });

  it('marca isPaid=true automaticamente quando o atendimento está 100% coberto por pacote pago', async () => {
    const prismaMock = {
      petAppointment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'app-pkg-paid',
            status: 'scheduled',
            checkInNotes: null,
            services: [
              {
                coverageStatus: 'reserved',
                priceSnapshot: 60,
                coveredAmount: 60,
                customerPackage: { id: 'pkg-1', paymentStatus: 'paid', status: 'active' },
              },
            ],
          },
          {
            id: 'app-pkg-with-extra-unpaid',
            status: 'scheduled',
            checkInNotes: null,
            services: [
              {
                coverageStatus: 'reserved',
                priceSnapshot: 60,
                coveredAmount: 60,
                customerPackage: { id: 'pkg-1', paymentStatus: 'paid', status: 'active' },
              },
              {
                coverageStatus: 'none',
                priceSnapshot: 25,
                coveredAmount: 0,
                customerPackage: null,
              },
            ],
          },
        ]),
      },
      comanda: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.listAppointments();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'app-pkg-paid', isPaid: true });
    expect(result[1]).toMatchObject({ id: 'app-pkg-with-extra-unpaid', isPaid: false });
  });

  it('propaga isPaid e paidAmount para nextAppointments em overview()', async () => {
    const paidAt = new Date('2026-11-15T15:35:00.000Z');
    const prismaMock = {
      pet: { count: jest.fn().mockResolvedValue(1) },
      customer: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(1) },
      petService: { count: jest.fn().mockResolvedValue(1) },
      petVaccination: { count: jest.fn().mockResolvedValue(0) },
      petAppointment: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { id: 'app-today-paid', status: 'scheduled', startsAt: new Date() },
        ]),
      },
      comanda: {
        findMany: jest.fn().mockResolvedValue([
          {
            notes: 'PET2:{"v":2,"a":"app-today-paid"}',
            sale: { id: 'sale-2', total: 95, createdAt: paidAt },
          },
        ]),
      },
    };

    const service = createServiceWithPrisma(prismaMock);
    const result = await service.overview();

    expect(result.nextAppointments).toHaveLength(1);
    expect(result.nextAppointments[0]).toMatchObject({
      id: 'app-today-paid',
      isPaid: true,
      paidAmount: 95,
      paidAt,
    });
  });
});
