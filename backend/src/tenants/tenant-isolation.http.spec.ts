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
  const updateTenantPlatform = jest.fn(async (id: string) => ({ id }));
  const deleteTenant = jest.fn(async (id: string) => ({ success: true, id }));
  const syncMasterCatalogFromTenants = jest.fn(async () => ({ synced: 0, tenants: 0, errors: [] }));
  const getLogoImage = jest.fn(async () => null);
  const validatePin = jest.fn(async (pin: string) => pin === 'test-setup-pin');
  const token = (role = 'admin', tenantId = 'tenant-a') => jwt.sign({ sub: `user-${role}-${tenantId}`, role, tenantId });

  beforeAll(async () => {
    jwtConstants.secret = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule], controllers: [TenantsController],
      providers: [JwtStrategy, JwtAuthGuard, StationAccessService,
        { provide: JwtService, useValue: jwt },
        { provide: TenantsService, useValue: { updateTenant, updateTenantPlatform, deleteTenant, syncMasterCatalogFromTenants, getLogoImage, validatePin } },
        { provide: HeartPrismaService, useValue: {
          tenant: { findUnique: async () => ({ status: 'active', modulos: {} }) },
          user: { findUnique: async ({ where }: any) => {
            const [, role, ...tenantParts] = String(where.id).split('-');
            return { id: where.id, tenantId: tenantParts.join('-'), email: 'qa@example.test', role, groupId: null, active: true, tenant: { status: 'active' } };
          } },
        } },
        { provide: TenantConnectionManager, useValue: { getTenantClient: async () => ({ tenantSettings: { findUnique: async () => null } }) } },
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
  it('also denies deleting own or another tenant as store admin, allowing only superadmin', async () => {
    await request(app.getHttpServer()).delete('/api/tenants/tenant-b').auth(token(), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).delete('/api/tenants/tenant-a').auth(token(), { type: 'bearer' }).expect(403);
    expect(deleteTenant).not.toHaveBeenCalled();
    await request(app.getHttpServer()).delete('/api/tenants/tenant-b').auth(token('superadmin'), { type: 'bearer' }).expect(200);
    expect(deleteTenant).toHaveBeenCalledWith('tenant-b');
  });
  it('also denies replacing another tenant logo', async () => {
    await request(app.getHttpServer()).post('/api/tenants/tenant-b/logo').auth(token(), { type: 'bearer' }).expect(403);
  });
  it('routes store admin PATCH /tenants/me to store-only updateTenant and setup PATCH to updateTenantPlatform', async () => {
    await request(app.getHttpServer()).patch('/api/tenants/me').auth(token('admin'), { type: 'bearer' }).send({ nomeFantasia: 'Loja', modulos: { petshop: true } }).expect(200);
    expect(updateTenant).toHaveBeenCalledTimes(1);
    expect(updateTenantPlatform).not.toHaveBeenCalled();

    await request(app.getHttpServer()).patch('/api/tenants/setup/tenant-a').set('x-setup-pin', 'test-setup-pin').send({ status: 'suspended' }).expect(200);
    expect(updateTenantPlatform).toHaveBeenCalledWith('tenant-a', { status: 'suspended' });
  });
  it('requires valid setup PIN for POST /tenants/trigger-sync', async () => {
    await request(app.getHttpServer()).post('/api/tenants/trigger-sync').expect(401);
    await request(app.getHttpServer()).post('/api/tenants/trigger-sync').set('x-setup-pin', 'wrong').expect(401);
    expect(syncMasterCatalogFromTenants).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/api/tenants/trigger-sync').set('x-setup-pin', 'test-setup-pin').expect(201);
    expect(syncMasterCatalogFromTenants).toHaveBeenCalledTimes(1);
  });
  it('blocks path traversal in GET /tenants/uploads/logos/:filename', async () => {
    await request(app.getHttpServer()).get('/api/tenants/uploads/logos/..%2f..%2fpackage.json').expect(404);
    await request(app.getHttpServer()).get('/api/tenants/uploads/logos/..%5cpackage.json').expect(404);
  });
});
