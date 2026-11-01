import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy, jwtConstants } from '../auth/jwt.strategy';
import { StationAccessService } from '../auth/station-access.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService, TenantInterceptor } from '../prisma/tenant-context.service';

describe('Reports HTTP authorization and tenant context', () => {
  let app: INestApplication;
  const secret = 'reports-http-test-only';
  const previousSecret = jwtConstants.secret;
  const jwt = new JwtService({ secret });
  const context = new TenantContextService();
  const sales = jest.fn(async () => ({ tenantId: context.get().tenantId }));
  const token = (role: string, tenantId = 'a') => jwt.sign({ sub: 'user', role, tenantId });
  beforeAll(async () => {
    jwtConstants.secret = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule], controllers: [ReportsController],
      providers: [JwtStrategy, JwtAuthGuard, StationAccessService, TenantInterceptor,
        { provide: JwtService, useValue: jwt },
        { provide: ReportsService, useValue: { sales } },
        { provide: TenantContextService, useValue: context },
        { provide: HeartPrismaService, useValue: { tenant: {
          findUnique: async ({ where }: any) => ({ id: where.id, databaseUrl: 'unused', modulos: {} }),
        } } },
        { provide: TenantConnectionManager, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(module.get(TenantInterceptor));
    await app.init();
  });
  beforeEach(() => sales.mockClear());
  afterAll(async () => { await app?.close(); jwtConstants.secret = previousSecret; });
  const url = '/api/reports/sales?startDate=2026-01-01&endDate=2026-01-02';
  it('rejects missing or invalid authentication', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer()).get(url).auth('invalid', { type: 'bearer' }).expect(401);
    expect(sales).not.toHaveBeenCalled();
  });
  it.each(['stockist', 'cashier', 'operator', 'station'])('denies %s before report execution', async role => {
    await request(app.getHttpServer()).get(url).auth(token(role), { type: 'bearer' }).expect(403);
    expect(sales).not.toHaveBeenCalled();
  });
  it.each(['admin', 'superadmin'])('allows %s', async role => {
    await request(app.getHttpServer()).get(url).auth(token(role), { type: 'bearer' })
      .expect('Cache-Control', 'private, no-store').expect(200, { tenantId: 'a' });
    expect(sales).toHaveBeenCalledWith('2026-01-01', '2026-01-02');
  });
  it('isolates concurrent tenants and ignores a forged tenant query', async () => {
    await Promise.all(['a', 'b'].map(tenant => request(app.getHttpServer())
      .get(`${url}&tenantId=forged`).auth(token('admin', tenant), { type: 'bearer' })
      .expect(200, { tenantId: tenant })));
  });
});
