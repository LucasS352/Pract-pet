import { PetshopService } from './petshop.service';

describe('Reception registration', () => {
  const tutor = { id: 'owner', name: 'Tutor', phone: '11999999999', address: 'Rua A, 123 - Centro', reference: 'Casa 2' };
  let service: PetshopService;
  let tx: any;
  let prisma: any;
  beforeEach(() => {
    tx = { customer: { create: jest.fn().mockResolvedValue(tutor), findUnique: jest.fn().mockResolvedValue(tutor) }, pet: { create: jest.fn().mockResolvedValue({ id: 'pet', customer: tutor }) } };
    prisma = { $transaction: jest.fn(callback => callback(tx)), customer: tx.customer };
    service = Object.create(PetshopService.prototype);
    (service as any).prisma = async () => prisma;
  });
  it('creates both records in the transaction and ignores a forged pet owner', async () => {
    const result = await service.registerReception({ tutor, pet: { name: 'Mel', species: 'dog', customerId: 'forged' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.pet.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Mel', customerId: 'owner' }) }));
    expect(result.pet?.id).toBe('pet');
    expect(result.tutor.address).toBe('Rua A, 123 - Centro');
    expect(result.tutor.reference).toBe('Casa 2');
  });
  it('keeps standalone tutor registration available', async () => {
    const result = await service.registerReception({ tutor });
    expect(result.pet).toBeNull();
    expect(tx.pet.create).not.toHaveBeenCalled();
  });
  it('reuses an existing tutor without modifying their record', async () => {
    await service.registerReception({ customerId: 'owner', tutor: { name: 'changed' }, pet: { name: 'Mel', species: 'dog' } });
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.customer.findUnique).toHaveBeenCalledWith({ where: { id: 'owner' } });
  });
  it.each([{ name: '', species: 'dog' }, { name: 'Mel', species: 'invalid' }, { name: 'Mel', species: 'dog', weight: -1 }])('rejects invalid pets before creating the tutor: %j', async pet => {
    await expect(service.registerReception({ tutor, pet })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects missing existing tutor', async () => {
    tx.customer.findUnique.mockResolvedValue(null);
    await expect(service.registerReception({ customerId: 'missing', pet: { name: 'Mel', species: 'dog' } })).rejects.toThrow('Tutor');
    expect(tx.pet.create).not.toHaveBeenCalled();
  });
  it('explains duplicate phone conflicts', async () => {
    tx.customer.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.registerReception({ tutor })).rejects.toThrow('Buscar por telefone');
  });
  it('looks up only the exact normalized phone and minimal identity', async () => {
    await service.findReceptionTutor('(11) 99999-9999');
    expect(tx.customer.findUnique).toHaveBeenCalledWith({ where: { phone: '11999999999' }, select: { id: true, name: true, phone: true } });
  });
});

describe('Appointment creation customer address persistence', () => {
  const makeService = (customerAddress: string | null) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'op-1' }]),
      petAppointment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'apt-1', status: 'scheduled' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'apt-1',
          status: 'scheduled',
          pet: { id: 'pet-1', name: 'Belinha' },
          customer: { id: 'cust-1', name: 'Juliana', address: customerAddress },
          professional: null,
          services: [],
        }),
      },
      petAppointmentService: { create: jest.fn().mockResolvedValue({ id: 'aps-1' }) },
      customer: { update: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
    };
    const prisma = {
      pet: { findUnique: jest.fn().mockResolvedValue({ id: 'pet-1', active: true, customerId: 'cust-1', species: 'dog', size: 'small', coatType: 'short', customer: { id: 'cust-1', address: customerAddress } }) },
      petService: { findMany: jest.fn().mockResolvedValue([{ id: 'svc-1', name: 'Banho', category: 'bath', price: 50, durationMinutes: 60, serviceType: 'SERVICE', pricingRules: [], comboItems: [] }]) },
      storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(cb => cb(tx)),
    };
    const service = Object.create(PetshopService.prototype);
    (service as any).prisma = async () => prisma;
    (service as any).tenantContext = { get: () => ({ tenantId: 't1', userId: 'u1' }) };
    (service as any).pricing = {
      resolvePriceAndDuration: () => ({ price: 50, durationMinutes: 60, matchedRule: null }),
      suggestStages: () => [],
      consolidateStages: () => [],
      resolveAppointmentStages: () => [],
    };
    (service as any).resolveUserDisplayName = jest.fn().mockResolvedValue('Atendente');
    (service as any).whatsapp = { enqueueAppointmentEvent: jest.fn().mockResolvedValue(undefined) };
    return { service, tx };
  };

  it('persists Taxi Dog address onto customer when customer had no address and saveAddressToCustomer is enabled', async () => {
    const { service, tx } = makeService(null);
    await service.createAppointment({
      petId: 'pet-1',
      startsAt: '2026-11-24T12:00:00.000Z',
      serviceIds: ['svc-1'],
      saveAddressToCustomer: true,
      customerAddress: 'Nagib Sahad, 576 - Cohab',
      customerReference: 'Ap 12',
      transport: { enabled: true, mode: 'both', fee: 10, street: 'Nagib Sahad, 576', neighborhood: 'Cohab', reference: 'Ap 12', address: 'Nagib Sahad, 576 - Cohab' },
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { address: 'Nagib Sahad, 576 - Cohab', reference: 'Ap 12' },
    });
  });

  it('does not overwrite existing customer address unless saveAddressToCustomer is explicitly true', async () => {
    const { service, tx } = makeService('Rua Original, 10 - Centro');
    await service.createAppointment({
      petId: 'pet-1',
      startsAt: '2026-11-24T12:00:00.000Z',
      serviceIds: ['svc-1'],
      saveAddressToCustomer: false,
      customerAddress: 'Outro Endereço, 99 - Bairro B',
      transport: { enabled: true, mode: 'both', fee: 10, street: 'Outro Endereço, 99', neighborhood: 'Bairro B', address: 'Outro Endereço, 99 - Bairro B' },
    });
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
});
