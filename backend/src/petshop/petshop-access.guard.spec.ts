import { PetshopAccessGuard } from './petshop-access.guard';

describe('Pet Shop operational authorization', () => {
  const guard = new PetshopAccessGuard({ tenant: { findUnique: async () => ({ status: 'active', modulos: { petshop: true } }) } } as any, { sessionOperator: async () => ({ id: 'staff', isManager: false }) } as any);
  const context = (path: string, method = 'GET', role = 'admin') => ({ switchToHttp: () => ({ getRequest: () => ({ originalUrl: `/api/petshop/${path}`, method, headers: { 'x-operator-token': 'pin-session' }, user: { tenantId: 'shop', role } }) }) } as any);
  it.each(['commissions/report', 'packages/contracts', 'tutors', 'metrics'])('blocks financial and administrative API %s under staff PIN', async path => {
    await expect(guard.canActivate(context(path))).rejects.toThrow('restrito');
  });
  it.each(['overview', 'appointments', 'pets', 'services', 'stages', 'packages/available/pet'])('allows agenda dependency %s', async path => {
    expect(await guard.canActivate(context(path))).toBe(true);
  });
  it.each(['tutors/booking-search?search=Ana', 'tutors/booking-frequent', 'tutors/booking-directory?page=2', 'appointments/overdue-pickups?before=2026-11-09', 'pets/pet-1'])('allows new booking and overdue dependency %s for staff', async path => {
    expect(await guard.canActivate(context(path))).toBe(true);
  });
  it.each(['tutors', 'tutors/customer-1', 'tutors/booking-frequent/private', 'appointments/overdue-pickups/private', 'pets/pet-1/vaccinations'])('keeps administrative routes blocked for staff: %s', async path => {
    await expect(guard.canActivate(context(path))).rejects.toThrow('restrito');
  });
  it('permits stage updates but not forced checkout or service editing', async () => {
    expect(await guard.canActivate(context('appointments/a/status', 'PATCH'))).toBe(true);
    expect(await guard.canActivate(context('appointments/a/checkout', 'POST'))).toBe(true);
    expect(await guard.canActivate(context('appointments/a/receive', 'POST'))).toBe(true);
    expect(await guard.canActivate(context('appointments/batch-taxi-departure', 'POST'))).toBe(true);
    expect(await guard.canActivate(context('pending-reservations'))).toBe(true);
    await expect(guard.canActivate(context('services/a', 'PATCH'))).rejects.toThrow();
  });
  it('allows reception registration and exact lookup under staff PIN', async () => {
    expect(await guard.canActivate(context('reception/tutors?phone=11999999999'))).toBe(true);
    expect(await guard.canActivate(context('reception/registrations', 'POST'))).toBe(true);
  });
  it('requires staff identification for reception under operator accounts', async () => {
    const noPinGuard = new PetshopAccessGuard({ tenant: { findUnique: async () => ({ status: 'active', modulos: { petshop: true } }) } } as any, { sessionOperator: async () => null } as any);
    await expect(noPinGuard.canActivate(context('reception/registrations', 'POST', 'operator'))).rejects.toThrow('PIN');
  });
});
