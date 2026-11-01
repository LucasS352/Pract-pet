import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtStrategy, jwtConstants } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StationAccessService } from '../auth/station-access.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

// Real controller, JWT signatures and guards; persistence is a spy, never a customer DB.
describe('Tenant administration isolation over HTTP', () => {
  let app: INestApplication;
  const secret = 'tenant-isolation-test-only';
  const jwt = new JwtService({ secret });
  const previousSecret = jwtConstants.secret;
  const updateTenant = jest.fn(async (id: string) => ({ id }));
  const validatePin = jest.fn(async (pin: string) => pin === 'test-setup-pin');
  const token = (role = 'admin', tenantId = 'tenant-a') => jwt.sign({ sub: 'user-a', role, tenantId });

  beforeAll(async () => {
    jwtConstants.secret = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule], controllers: [TenantsController],
      providers: [JwtStrategy, JwtAuthGuard, StationAccessService,
        { provide: JwtService, useValue: jwt },
        { provide: TenantsService, useValue: { updateTenant, validatePin } },
        { provide: HeartPrismaService, useValue: { tenant: { findUnique: async () => ({ status: 'active', modulos: {} }) } } },
        { provide: TenantConnectionManager, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => { await app?.close(); jwtConstants.secret = previousSecret; });

  it('denies an admin modifying another tenant before persistence', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/tenant-b')
      .auth(token(), { type: 'bearer' }).send({ nomeFantasia: 'forged' }).expect(403);
    expect(updateTenant).not.toHaveBeenCalled();
  });
  it('preserves same-tenant administration', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/tenant-a')
      .auth(token(), { type: 'bearer' }).send({ nomeFantasia: 'My shop' }).expect(200);
    expect(updateTenant).toHaveBeenCalledWith('tenant-a', { nomeFantasia: 'My shop' });
  });
  it('allows a superadmin to administer an explicitly selected tenant', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/tenant-b')
      .auth(token('superadmin'), { type: 'bearer' }).send({ nomeFantasia: 'Selected shop' }).expect(200);
  });
  it.each(['operator', 'stockist', 'group_owner'])('denies %s administrative mutation', async role => {
    await request(app.getHttpServer()).patch('/api/tenants/tenant-a')
      .auth(token(role), { type: 'bearer' }).send({}).expect(403);
    expect(updateTenant).not.toHaveBeenCalled();
  });
  it('rejects absent or forged authentication', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/tenant-b').send({}).expect(401);
    await request(app.getHttpServer()).patch('/api/tenants/tenant-b')
      .auth(new JwtService({ secret: 'wrong' }).sign({ role: 'superadmin', tenantId: 'tenant-a' }), { type: 'bearer' }).send({}).expect(401);
    expect(updateTenant).not.toHaveBeenCalled();
  });
  it('rejects setup mutation without its separate authorization', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/setup/tenant-b')
      .auth(token(), { type: 'bearer' }).send({}).expect(401);
    expect(updateTenant).not.toHaveBeenCalled();
  });
  it('does not disclose the SaaS tenant directory to a customer administrator', async () => {
    await request(app.getHttpServer()).get('/api/tenants').auth(token(), { type: 'bearer' }).expect(403);
  });
  it('also denies deleting another tenant', async () => {
    await request(app.getHttpServer()).delete('/api/tenants/tenant-b').auth(token(), { type: 'bearer' }).expect(403);
  });
  it('also denies replacing another tenant logo', async () => {
    await request(app.getHttpServer()).post('/api/tenants/tenant-b/logo').auth(token(), { type: 'bearer' }).expect(403);
  });
});
