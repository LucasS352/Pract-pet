import { PetshopService } from './petshop.service';

describe('Resumo de pagamento na Agenda', () => {
  it('exibe a venda ativa mais recente quando o atendimento teve cobrança adicional', async () => {
    const service = Object.create(PetshopService.prototype) as any;
    const prisma = { comanda: { findMany: jest.fn().mockResolvedValue([
      { notes: 'PET2:{"a":"appointment-1"}', sale: { id: 'old', total: 90, createdAt: new Date('2026-11-17T10:00:00Z') } },
      { notes: 'PET2:{"a":"appointment-1","addon":1}', sale: { id: 'new', total: 15, createdAt: new Date('2026-11-17T14:00:00Z') } },
    ]) } };
    const [appointment] = await service.attachPaymentStatus(prisma, [{ id: 'appointment-1', services: [], transport: null }]);
    expect(appointment.isPaid).toBe(true);
    expect(appointment.paidAmount).toBe(15);
    expect(appointment.paidAt).toEqual(new Date('2026-11-17T14:00:00Z'));
  });
});
