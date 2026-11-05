import { PetshopService } from './petshop.service';

describe('Recebimento dentro do Pet Shop', () => {
  const req = { user: { role: 'operator' }, headers: { 'x-operator-token': 'pin' } };
  function fixture() {
    const service = Object.create(PetshopService.prototype) as any;
    service.commissions = { sessionOperator: jest.fn().mockResolvedValue({ id: 'beatriz' }) };
    service.prepareCheckout = jest.fn().mockResolvedValue({ id: 'comanda', total: '60.00' });
    service.sales = { checkout: jest.fn().mockResolvedValue({ id: 'sale' }) };
    return service;
  }
  it('permite colaborador e usa o total do servidor sem exigir PDV ou caixa', async () => {
    const service = fixture();
    await service.receivePayment('appointment', { method: 'pix', value: 0.01, operatorId: 'forged' }, req);
    expect(service.sales.checkout).toHaveBeenCalledWith(expect.objectContaining({ operatorId: 'beatriz', source: 'petshop', emitirNfce: false, payments: [{ method: 'pix', value: 60 }] }), true);
  });
  it('aceita pagamento dividido e recusa total diferente da comanda', async () => {
    const service = fixture();
    await service.receivePayment('a', { payments: [{ method: 'pix', value: 20 }, { method: 'dinheiro', value: 40 }] }, req);
    expect(service.sales.checkout).toHaveBeenCalledWith(expect.objectContaining({ payments: [{ method: 'pix', value: 20 }, { method: 'dinheiro', value: 40 }] }), true);
    await expect(service.receivePayment('a', { payments: [{ method: 'pix', value: 1 }] }, req)).rejects.toThrow('soma');
  });
  it('recusa operador sem PIN e forma de pagamento desconhecida', async () => {
    const service = fixture();
    await expect(service.receivePayment('a', { method: 'pix' }, { user: { role: 'operator' }, headers: {} })).rejects.toThrow();
    await expect(service.receivePayment('a', { method: 'invalid' }, req)).rejects.toThrow();
    expect(service.sales.checkout).not.toHaveBeenCalled();
  });
  it('propaga bloqueio de duplicidade e não lança nova venda', async () => {
    const service = fixture(); service.prepareCheckout.mockRejectedValue(new Error('Já concluído'));
    await expect(service.receivePayment('a', { method: 'pix' }, req)).rejects.toThrow('Já concluído');
    expect(service.sales.checkout).not.toHaveBeenCalled();
  });
  it('consulta todas as reservas pendentes em ordem, sem limitar ao dia atual', async () => {
    const service = fixture(); const findMany = jest.fn().mockResolvedValue([]);
    service.prisma = async () => ({ petAppointment: { findMany } });
    await service.pendingReservations();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'requested' }, orderBy: { startsAt: 'asc' } }));
  });
});
