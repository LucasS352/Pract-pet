import { Body, Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy, jwtConstants } from './jwt.strategy';
import { StationAccessService } from './station-access.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';

// Exercises real HTTP routing, Passport signatures and the authorization guard.
// Only persistence is simulated: no tenant, order or fiscal document is created.
@Controller()
@UseGuards(JwtAuthGuard)
class ProbeController {
  @Get('products/:id/composition') composition() { return [{ id: 'group' }]; }
  @Post('v1/comandas/:id/items') items(@Body() body: unknown) { return body; }
  @Post('sales/checkout') checkout(@Body() body: unknown) { return body; }
  @Get('tenants/me') admin() { return { ok: true }; }
}

describe('Operational authorization over HTTP', () => {
  let app: INestApplication;
  let access: StationAccessService;
  const secret = 'http-test-only-secret';
  const jwt = new JwtService({ secret });
  const previousSecret = process.env.JWT_SECRET;
  const previousConstant = jwtConstants.secret;
  const tenant = { id: 'tenant', status: 'active', databaseUrl: 'unused', modulos: {} as Record<string, boolean> };
  const operator = { id: 'waiter', active: true, jobTitle: 'Garçom', pin: 'hash' };
  const link = { id: 'link', tenantId: 'tenant', station: 'WAITER', active: true, tenant };
  const stationToken = () => jwt.sign({ sub: link.id, tenantId: tenant.id, type: 'station-session', linkId: link.id });
  const shopToken = () => jwt.sign({ sub: 'admin', tenantId: tenant.id, role: 'admin' });

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtConstants.secret = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule], controllers: [ProbeController],
      providers: [JwtStrategy, JwtAuthGuard, StationAccessService,
        { provide: JwtService, useValue: jwt },
        { provide: HeartPrismaService, useValue: {
          tenant: { findUnique: async () => tenant },
          stationAccessLink: { findUnique: async () => link },
        } },
        { provide: TenantConnectionManager, useValue: {
          getTenantClient: async () => ({ operator: { findUnique: async () => operator } }),
        } },
      ],
    }).compile();
    access = module.get(StationAccessService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  beforeEach(() => {
    tenant.modulos = { restaurante: true, kds: true };
    link.active = true; link.station = 'WAITER';
    operator.jobTitle = 'Garçom'; operator.pin = 'hash';
  });
  afterAll(async () => {
    await app?.close();
    jwtConstants.secret = previousConstant;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('rejects missing shop authentication and operator tokens used as shop tokens', async () => {
    await request(app.getHttpServer()).get('/api/products/p/composition').expect(401);
    await request(app.getHttpServer()).get('/api/products/p/composition')
      .auth(access.signWaiterSession(tenant.id, operator), { type: 'bearer' }).expect(401);
  });
  it('requires waiter PIN, then permits the exact composition endpoint', async () => {
    await request(app.getHttpServer()).get('/api/products/p/composition')
      .auth(stationToken(), { type: 'bearer' }).expect(401);
    await request(app.getHttpServer()).get('/api/products/p/composition')
      .auth(stationToken(), { type: 'bearer' })
      .set('x-operator-token', access.signWaiterSession(tenant.id, operator)).expect(200, [{ id: 'group' }]);
  });
  it('preserves modifiers and replaces forged item authorship', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/comandas/c/items')
      .auth(stationToken(), { type: 'bearer' })
      .set('x-operator-token', access.signWaiterSession(tenant.id, operator))
      .send({ items: [{ productId: 'p', quantity: 2, createdById: 'forged', modifiers: [{ optionId: 'o' }] }] }).expect(201);
    expect(res.body.items[0]).toEqual({ productId: 'p', quantity: 2, createdById: operator.id, modifiers: [{ optionId: 'o' }] });
  });
  it('denies administrative APIs to a waiter and compositions to the kitchen', async () => {
    await request(app.getHttpServer()).get('/api/tenants/me').auth(stationToken(), { type: 'bearer' }).expect(403);
    link.station = 'KITCHEN';
    await request(app.getHttpServer()).get('/api/products/p/composition').auth(stationToken(), { type: 'bearer' }).expect(403);
  });
  it('revokes existing access on link revocation or module deactivation', async () => {
    const token = stationToken();
    link.active = false;
    await request(app.getHttpServer()).get('/api/products/p/composition').auth(token, { type: 'bearer' }).expect(401);
    link.active = true; tenant.modulos = {};
    await request(app.getHttpServer()).get('/api/products/p/composition').auth(token, { type: 'bearer' }).expect(403);
  });
  it('invalidates the old PIN session immediately after reset', async () => {
    const token = access.signWaiterSession(tenant.id, operator);
    operator.pin = 'new-hash';
    await request(app.getHttpServer()).get('/api/products/p/composition')
      .auth(stationToken(), { type: 'bearer' }).set('x-operator-token', token).expect(401);
  });
  it('keeps legacy adega checkout unchanged, but requires cashier PIN with modules on', async () => {
    tenant.modulos = { estoque: true };
    await request(app.getHttpServer()).post('/api/sales/checkout').auth(shopToken(), { type: 'bearer' }).send({}).expect(201);
    tenant.modulos = { kds: true };
    await request(app.getHttpServer()).post('/api/sales/checkout').auth(shopToken(), { type: 'bearer' }).send({}).expect(401);
    operator.jobTitle = 'Caixa';
    const cashier = jwt.sign({ type: 'op', tenantId: tenant.id, opId: operator.id, context: 'cashier' });
    await request(app.getHttpServer()).post('/api/sales/checkout').auth(shopToken(), { type: 'bearer' })
      .set('x-operator-token', cashier).send({}).expect(201, { operatorId: operator.id });
  });
});
