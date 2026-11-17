import { JwtService } from '@nestjs/jwt';
import { StationAccessService } from './station-access.service';
import { pinVersion } from './operator-session';

describe('Persistent PIN binding for shared Pet Shop stations', () => {
  const previous = process.env.JWT_SECRET;
  const secret = 'binding-regression-test-only';
  beforeAll(() => { process.env.JWT_SECRET = secret; });
  afterAll(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });

  it('removing or substituting the PIN header cannot restore admin privileges after restart', async () => {
    const jwt = new JwtService({ secret });
    const persisted = new Map<string, any>();
    const operator = { id: 'groomer', active: true, isManager: false, jobTitle: 'Tosadora', pin: 'hash' };
    const db = {
      tenantSettings: {
        upsert: async ({ create }: any) => persisted.set(create.id, create),
        findUnique: async ({ where }: any) => persisted.get(where.id) || null,
      }, operator: { findUnique: async () => operator },
    };
    const heart = { tenant: { findUnique: async () => ({ databaseUrl: 'isolated', modulos: { petshop: true } }) } };
    const manager = { getTenantClient: async () => db };
    const create = () => new StationAccessService(heart as any, jwt, manager as any);
    const user = { tenantId: 'tenant-a', role: 'admin' };
    const authorization = `Bearer ${jwt.sign({ sub: 'admin', ...user }, { expiresIn: '12h' })}`;
    await create().bindPetshopSession(user.tenantId, authorization);
    const service = create();
    const req = (token?: string) => ({ user, method: 'GET', originalUrl: '/api/petshop/overview', headers: { authorization, ...(token ? { 'x-operator-token': token } : {}) } });
    await expect(service.authorizeRequest(req())).rejects.toMatchObject({ status: 401 });
    const token = (context: string, tenantId = 'tenant-a') => jwt.sign({ type: 'op', opId: operator.id, tenantId, context, pinVersion: pinVersion(operator.pin, secret) });
    await expect(service.authorizeRequest(req(token('cashier')))).rejects.toMatchObject({ status: 401 });
    await expect(service.authorizeRequest(req(token('petshop', 'tenant-b')))).rejects.toMatchObject({ status: 401 });
    await expect(service.authorizeRequest(req(token('petshop')))).resolves.toBeUndefined();
    await expect(service.authorizeRequest({ ...req(token('petshop')), method: 'PATCH', originalUrl: '/api/operators/manager' })).rejects.toMatchObject({ status: 403 });
    await expect(service.authorizeRequest({ ...req(), method: 'POST', originalUrl: '/api/auth/operator-login' })).resolves.toBeUndefined();
    operator.isManager = true;
    await expect(service.authorizeRequest({ ...req(token('petshop')), method: 'PATCH', originalUrl: '/api/operators/manager' })).resolves.toBeUndefined();
    expect([...persisted.keys()][0]).not.toContain(authorization.slice(7));
  });
});
