import { PetshopService } from './petshop.service';

describe('Reception registration', () => {
  const tutor = { id: 'owner', name: 'Tutor', phone: '11999999999' };
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
