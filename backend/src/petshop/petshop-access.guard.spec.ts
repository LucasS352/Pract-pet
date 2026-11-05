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
  it('permits stage updates but not forced checkout or service editing', async () => {
    expect(await guard.canActivate(context('appointments/a/status', 'PATCH'))).toBe(true);
    expect(await guard.canActivate(context('appointments/a/checkout', 'POST'))).toBe(true);
    expect(await guard.canActivate(context('appointments/a/receive', 'POST'))).toBe(true);
    expect(await guard.canActivate(context('pending-reservations'))).toBe(true);
    await expect(guard.canActivate(context('services/a', 'PATCH'))).rejects.toThrow();
  });
});
