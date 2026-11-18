import { PetshopService } from './petshop.service';

const serviceLine = (id: string, price: number, coverageStatus = 'none') => ({
  id,
  serviceId: id,
  nameSnapshot: id,
  priceSnapshot: price,
  coveredAmount: 0,
  coverageStatus,
  comboParentId: null,
});

const taxi = (fee: number) => JSON.stringify({ transport: {
  enabled: true,
  mode: 'round_trip',
  fee,
  coveredByPackage: false,
  address: 'Rua de teste, 10',
} });

function fixture(services: any[], checkInNotes: string | null, existing: any = null, paidSale: any = null, stageHistory: any[] = []) {
  const service = Object.create(PetshopService.prototype) as any;
  service.ensureServiceProductBacking = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    petAppointment: { findUnique: jest.fn().mockResolvedValue({
      id: 'apt-1', pet: { name: 'Leo' }, customer: { name: 'Lucas' },
      professional: null, startsAt: new Date('2026-11-09T12:00:00Z'),
      services, checkInNotes, stageHistory,
    }) },
    comanda: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.status === 'closed') return paidSale;
        return where.notes ? existing : null;
      }),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new-comanda', ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: existing?.id, ...data })),
    },
    comandaItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service, prisma };
}

describe('Comanda de atendimento com Táxi Dog', () => {
  it('cobra só o novo adicional após uma venda anterior', async () => {
    const prior = { ...serviceLine('banho', 70), id: 'original', chargedSaleId: 'sale-prior' };
    const extra = { ...serviceLine('tosa', 15), id: 'extra', chargedSaleId: null };
    const { service, prisma } = fixture([prior, extra], taxi(40), null,
      { sale: { createdAt: new Date('2026-11-09T12:00:00Z') } },
      [{ kind: 'service_added', appointmentServiceId: 'extra', at: '2026-11-09T13:00:00Z' }]);
    const result = await service.ensureComandaForAppointment(prisma, 'apt-1', true, true);
    expect(Number(result.total)).toBe(15);
    expect(result.items.create).toEqual([expect.objectContaining({ productId: 'tosa', notes: 'Serviço Pet Shop:extra' })]);
  });
  it('não cobra novamente serviços antigos de uma venda paga sem vínculo por item', async () => {
    const prior = { ...serviceLine('banho', 70), id: 'old-service', chargedSaleId: null };
    const { service, prisma } = fixture([prior], null, null,
      { sale: { createdAt: new Date('2026-11-09T12:00:00Z') } });
    expect(await service.ensureComandaForAppointment(prisma, 'apt-1', true, true)).toBeNull();
    expect(prisma.comanda.create).not.toHaveBeenCalled();
  });
  it('inclui serviço e transporte avulsos no total e nos itens da venda', async () => {
    const { service, prisma } = fixture([serviceLine('banho', 70)], taxi(40));
    const result = await service.ensureComandaForAppointment(prisma, 'apt-1');
    expect(Number(result.total)).toBe(110);
    expect(result.items.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'banho', totalPrice: expect.anything() }),
      expect.objectContaining({ productId: 'petshop-taxi-dog-fee', notes: 'Táxi Dog Pet Shop' }),
    ]));
    expect(result.items.create.map((item: any) => Number(item.totalPrice)).sort()).toEqual([40, 70]);
  });

  it('cobra somente o transporte quando o banho está coberto por pacote', async () => {
    const { service, prisma } = fixture([serviceLine('banho', 70, 'reserved')], taxi(40));
    const result = await service.ensureComandaForAppointment(prisma, 'apt-1');
    expect(Number(result.total)).toBe(40);
    expect(result.items.create).toHaveLength(1);
    expect(result.items.create[0].productId).toBe('petshop-taxi-dog-fee');
  });

  it('corrige a comanda antiga que omitia a taxa de transporte', async () => {
    const existing = { id: 'old-comanda', status: 'waiting_payment', total: 70, items: [
      { id: 'old-banho', status: 'active', productId: 'banho', totalPrice: 70, quantity: 1, notes: 'Serviço Pet Shop' },
    ] };
    const { service, prisma } = fixture([serviceLine('banho', 70)], taxi(40), existing);
    await service.ensureComandaForAppointment(prisma, 'apt-1');
    expect(prisma.comandaItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['old-banho'] } },
      data: expect.objectContaining({ status: 'removed' }),
    }));
    const newLines = prisma.comandaItem.createMany.mock.calls[0][0].data;
    expect(newLines.map((item: any) => Number(item.totalPrice)).sort((a: number, b: number) => a - b)).toEqual([40, 70]);
    expect(Number(prisma.comanda.update.mock.calls[0][0].data.total)).toBe(110);
  });

  it('recalcula a comanda após adicionar outro serviço igual antes de cobrar', async () => {
    const existing = { id: 'old-comanda', status: 'waiting_payment', total: 70, items: [
      { id: 'old-banho', status: 'active', productId: 'banho', totalPrice: 70, quantity: 1, notes: 'Serviço Pet Shop' },
    ] };
    const { service, prisma } = fixture([serviceLine('banho', 70), { ...serviceLine('banho', 70), id: 'banho-2' }], null, existing);
    await service.ensureComandaForAppointment(prisma, 'apt-1');
    const newLines = prisma.comandaItem.createMany.mock.calls[0][0].data;
    expect(newLines).toHaveLength(2);
    expect(newLines.every((item: any) => item.productId === 'banho')).toBe(true);
    expect(Number(prisma.comanda.update.mock.calls[0][0].data.total)).toBe(140);
  });

  it('preserva os itens quando a comanda já corresponde ao agendamento', async () => {
    const existing = { id: 'ready-comanda', status: 'waiting_payment', total: 110, items: [
      { id: 'banho', status: 'active', productId: 'banho', totalPrice: 70, quantity: 1, notes: 'Serviço Pet Shop:banho' },
      { id: 'taxi', status: 'active', productId: 'petshop-taxi-dog-fee', totalPrice: 40, quantity: 1, notes: 'Táxi Dog Pet Shop' },
    ] };
    const { service, prisma } = fixture([serviceLine('banho', 70)], taxi(40), existing);
    await service.ensureComandaForAppointment(prisma, 'apt-1');
    expect(prisma.comandaItem.updateMany).not.toHaveBeenCalled();
    expect(prisma.comandaItem.createMany).not.toHaveBeenCalled();
    expect(Number(prisma.comanda.update.mock.calls[0][0].data.total)).toBe(110);
  });

  it('substitui a comanda quando o serviço novo tem o mesmo produto e valor', async () => {
    const existing = { id: 'waiting-addon', status: 'waiting_payment', total: 15, notes: 'PET2:{"a":"apt-1","addon":1}', items: [
      { id: 'old-line', status: 'active', productId: 'tosa', totalPrice: 15, quantity: 1, notes: 'Serviço Pet Shop:old-service' },
    ] };
    const { service, prisma } = fixture([{ ...serviceLine('tosa', 15), id: 'new-service' }], null, existing,
      { sale: { createdAt: new Date('2026-11-09T12:00:00Z') } },
      [{ kind: 'service_added', appointmentServiceId: 'new-service', at: '2026-11-09T13:00:00Z' }]);
    await service.ensureComandaForAppointment(prisma, 'apt-1', true, true);
    expect(prisma.comandaItem.updateMany).toHaveBeenCalled();
    expect(prisma.comandaItem.createMany.mock.calls[0][0].data[0].notes).toBe('Serviço Pet Shop:new-service');
  });
});
