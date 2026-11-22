import { PetshopService } from './petshop.service';
import { PetshopPricingService } from './petshop-pricing.service';

function fixture() {
  const startsAt = new Date('2026-11-25T14:00:00Z');
  const endsAt = new Date('2026-11-25T15:00:00Z');
  const bath = { id: 'bath', name: 'Banho', category: 'Higiene', customStages: ['checked_in', 'bathing', 'finishing', 'ready'] };
  const current: any = {
    id: 'apt', petId: 'pet', customerId: 'customer', status: 'scheduled', startsAt, endsAt,
    updatedAt: new Date('2026-11-20T10:00:00Z'), stageHistory: [], professionalId: null,
    pet: { id: 'pet', species: 'dog', size: 'small' }, customer: { id: 'customer' },
    services: [{ id: 'parent', appointmentId: 'apt', serviceId: 'bath', service: bath,
      nameSnapshot: 'Banho', durationMinutes: 60, priceSnapshot: 50, coverageStatus: 'none', comboParentId: null }],
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    petAppointment: {
      findUnique: jest.fn().mockResolvedValue({ status: current.status, updatedAt: current.updatedAt }),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...current, ...data })),
    },
    petAppointmentService: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(current.services[0]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    petCommission: { findFirst: jest.fn().mockResolvedValue(null), deleteMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn() },
  };
  const prisma: any = {
    petAppointment: { findUnique: jest.fn().mockResolvedValue(current) },
    comanda: { findFirst: jest.fn().mockResolvedValue(null) },
    petService: { findUnique: jest.fn() },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const service: any = Object.create(PetshopService.prototype);
  service.prisma = jest.fn().mockResolvedValue(prisma);
  service.pricing = new PetshopPricingService();
  service.tenantContext = { get: () => ({ userId: 'admin', tenantId: 'tenant' }) };
  service.stationAccess = { assertPetshopCommissionAdmin: jest.fn() };
  service.commissions = { sessionOperator: jest.fn() };
  return { service, prisma, tx, current };
}

describe('edição de serviços do atendimento', () => {
  it('remove componentes e comissões pendentes antes do serviço principal', async () => {
    const { service, tx, current } = fixture();
    current.services.push({ id: 'child', comboParentId: 'parent', durationMinutes: 20, service: { name: 'Hidratação' } });
    tx.petAppointmentService.findMany.mockResolvedValue([{ id: 'child' }]);
    await service.updateAppointment('apt', { removeAppointmentServiceId: 'parent' });
    expect(tx.petCommission.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ appointmentServiceId: { in: ['parent', 'child'] } }),
    }));
    expect(tx.petCommission.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ appointmentServiceId: { in: ['parent', 'child'] } }),
    }));
    expect(tx.petAppointmentService.deleteMany.mock.calls.map((call: any) => call[0].where.id)).toEqual([
      { in: ['child'] }, 'parent',
    ]);
  });

  it('recusa excluir comissão estornada para preservar o histórico financeiro', async () => {
    const { service, tx } = fixture();
    tx.petCommission.findFirst.mockResolvedValue({ id: 'reversed-commission' });
    await expect(service.updateAppointment('apt', { removeAppointmentServiceId: 'parent' })).rejects.toThrow('histórico');
    expect(tx.petAppointmentService.deleteMany).not.toHaveBeenCalled();
  });

  it('recalcula horário e etapas quando inclui um serviço', async () => {
    const { service, prisma, tx } = fixture();
    prisma.petService.findUnique.mockResolvedValue({
      id: 'groom', name: 'Tosa na Tesoura', category: 'Tosa', active: true,
      price: 30, priceSell: 30, durationMinutes: 30,
      customStages: ['checked_in', 'grooming', 'finishing', 'ready'],
    });
    await service.updateAppointment('apt', { addServices: [{ serviceId: 'groom', priceSnapshot: 30 }] });
    expect(tx.petAppointment.update.mock.calls[0][0].data.endsAt).toEqual(new Date('2026-11-25T15:30:00Z'));
    expect(tx.petAppointment.update.mock.calls[0][0].data.customStages).toContain('grooming');
  });
});
