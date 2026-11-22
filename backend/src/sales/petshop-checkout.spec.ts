import { appointmentFromComanda, claimPetshopCheckout, completePetshopCheckout } from './petshop-checkout';

describe('Pet Shop checkout integrity', () => {
  const comanda = { notes: 'PET2:{"a":"apt"}' };
  const tx = (status = 'ready') => ({ $queryRaw: jest.fn(), petAppointment: { findUnique: jest.fn().mockResolvedValue({ status, stageHistory: [] }), update: jest.fn() } });
  it('accepts both link formats and rejects corrupt pet links', () => {
    expect(appointmentFromComanda(comanda.notes)).toBe('apt');
    expect(appointmentFromComanda('PETSHOP_LINK_V1:{"appointment":{"id":"apt"}}')).toBe('apt');
    expect(() => appointmentFromComanda('PET2:broken')).toThrow();
    expect(appointmentFromComanda('ordinary')).toBeNull();
  });
  it('locks the appointment before allowing payment', async () => {
    const db = tx();
    expect(await claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, comanda)).toBe('apt');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it.each(['delivered', 'cancelled', 'no_show', 'bathing', 'scheduled'])('rejects checkout in %s', async status => {
    await expect(claimPetshopCheckout(tx(status), {}, comanda)).rejects.toThrow();
  });
  it('rejects a forced direct charge and a mismatching appointment', async () => {
    await expect(claimPetshopCheckout(tx(), { petshopAppointmentId: 'apt' }, null)).rejects.toThrow();
    await expect(claimPetshopCheckout(tx(), { petshopAppointmentId: 'another' }, comanda)).rejects.toThrow();
  });
  it('records completion and propagates failures to rollback the sale', async () => {
    const db = tx();
    await completePetshopCheckout(db, 'apt', 'cashier', 'tenant');
    expect(db.petAppointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'delivered', stageHistory: [expect.objectContaining({ userId: 'cashier' })] }) }));
    db.petAppointment.update.mockRejectedValue(new Error('database unavailable'));
    await expect(completePetshopCheckout(db, 'apt', 'cashier', 'tenant')).rejects.toThrow('database unavailable');
  });
  it('records advance payment without completing the scheduled appointment', async () => {
    const db = tx('scheduled');
    expect(await claimPetshopCheckout(db, { petshopAppointmentId: 'apt', petshopPrepayment: true }, comanda)).toBe('apt');
    await completePetshopCheckout(db, 'apt', 'cashier', 'tenant', true);
    expect(db.petAppointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      stageHistory: [expect.objectContaining({ kind: 'prepayment', status: 'scheduled' })],
    } }));
  });
  it('blocks another charge when advance payment is still completed', async () => {
    const db = tx('ready') as any;
    db.petAppointment.findUnique.mockResolvedValue({ status: 'ready', stageHistory: [{ kind: 'prepayment' }] });
    db.comanda = { findFirst: jest.fn().mockResolvedValue({ id: 'paid' }) };
    await expect(claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, comanda)).rejects.toThrow('já pago antecipadamente');
  });

  it('permite cobrar apenas serviço adicional novo em atendimento concluído já pago', async () => {
    const db = tx('delivered') as any;
    db.comanda = { findFirst: jest.fn().mockResolvedValue(null) };
    const addonComanda = { notes: 'PET2:{"v":2,"a":"apt","addon":1}' };

    expect(await claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, addonComanda)).toBe('apt');
    await completePetshopCheckout(db, 'apt', 'cashier', 'tenant', false, 'sale-extra', addonComanda);
    expect(db.petAppointment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        stageHistory: [expect.objectContaining({ kind: 'additional_charge', status: 'delivered', userId: 'cashier' })],
      },
    }));

    // Uma venda anterior não impede a cobrança complementar de um item ainda não pago.
    db.comanda = { findFirst: jest.fn().mockResolvedValue({ id: 'already-paid' }) };
    db.petAppointmentService = { count: jest.fn().mockResolvedValue(1) };
    const newAddon = { ...addonComanda, items: [{ notes: 'Serviço Pet Shop:extra-1' }] };
    await expect(claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, newAddon)).resolves.toBe('apt');
    db.petAppointmentService.count.mockResolvedValue(0);
    await expect(claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, newAddon)).rejects.toThrow('já cobrado');
    await expect(claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, addonComanda)).rejects.toThrow('sem serviços novos');
  });
  it('cobra um adicional depois do pré-pagamento sem concluir o atendimento', async () => {
    const db = tx('scheduled') as any;
    db.petAppointment.findUnique.mockResolvedValue({ status: 'scheduled', stageHistory: [{ kind: 'prepayment' }] });
    db.comanda = { findFirst: jest.fn().mockResolvedValue({ id: 'paid' }) };
    db.petAppointmentService = { count: jest.fn().mockResolvedValue(1), updateMany: jest.fn() };
    const addon = { notes: 'PET2:{"a":"apt","addon":1}', items: [{ notes: 'Serviço Pet Shop:extra-1' }] };
    expect(await claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, addon)).toBe('apt');
    await completePetshopCheckout(db, 'apt', 'cashier', 'tenant', false, 'sale-extra', addon);
    expect(db.petAppointment.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(db.petAppointment.update.mock.calls[0][0].data.stageHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'additional_charge', status: 'scheduled', saleId: 'sale-extra' }),
    ]));
  });

  it('permite cobrar adicional/diferença antecipadamente em atendimento em andamento (bathing) mantendo fluxo normal bloqueado', async () => {
    const db = tx('bathing') as any;
    db.petAppointment.findUnique.mockResolvedValue({ status: 'bathing', stageHistory: [] });
    db.comanda = { findFirst: jest.fn().mockResolvedValue(null) };
    db.petAppointmentService = { count: jest.fn().mockResolvedValue(1), updateMany: jest.fn() };

    await expect(claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, comanda)).rejects.toThrow();

    const earlyAddon = {
      notes: 'PET2:{"v":2,"a":"apt","addon":1}',
      items: [{ notes: 'Serviço Pet Shop:diff-1' }],
    };
    expect(await claimPetshopCheckout(db, { petshopAppointmentId: 'apt' }, earlyAddon)).toBe('apt');

    await completePetshopCheckout(db, 'apt', 'cashier', 'tenant', false, 'sale-diff', earlyAddon);
    expect(db.petAppointmentService.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        appointmentId: 'apt',
        chargedSaleId: null,
        comboParentId: null,
        coverageStatus: { notIn: ['reserved', 'consumed'] },
      }),
    }));
    expect(db.petAppointment.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(db.petAppointment.update.mock.calls[0][0].data.stageHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'additional_charge', status: 'bathing', saleId: 'sale-diff' }),
    ]));
  });
});
