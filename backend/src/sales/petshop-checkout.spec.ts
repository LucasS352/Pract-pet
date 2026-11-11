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
});
