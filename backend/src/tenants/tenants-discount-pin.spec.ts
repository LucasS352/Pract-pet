import { TenantsController } from './tenants.controller';

describe('Discount PIN does not expire the login session', () => {
  it('returns 403 for an incorrect PIN and accepts a correct one', async () => {
    const verifyDiscountPin = jest.fn(async (_tenant: string, pin: string) => pin === '2468');
    const controller = new TenantsController({ verifyDiscountPin } as any, {} as any);
    const req = { user: { tenantId: 'tenant-1' } };

    await expect(controller.verifyDiscountPin(req, { pin: '0000' })).rejects.toMatchObject({ status: 403 });
    await expect(controller.verifyDiscountPin(req, { pin: '2468' })).resolves.toEqual({ valid: true });
  });
});
