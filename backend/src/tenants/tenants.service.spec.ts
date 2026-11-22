import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from './tenants.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

describe('TenantsService', () => {
  let service: TenantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: HeartPrismaService, useValue: {} },
        { provide: TenantConnectionManager, useValue: {} },
        { provide: TenantContextService, useValue: {} },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('strips databaseUrl, certPfx and certSenha from findById and findAll', async () => {
    const rawTenant = {
      id: 't1',
      name: 'Pet A',
      databaseName: 'pet_a',
      databaseUrl: 'mysql://root:secret@mysql:3306/pet_a',
      certPfx: Buffer.from('pfx-secret'),
      certSenha: 'pfx-password',
      nfceCsc: 'csc-secret',
      nfceIdCsc: '000001',
      cosmosApiKey: 'cosmos-secret',
      tvPublicId: 'ABCD1234',
      nfceSerie: 1,
      users: [{ id: 'u1', name: 'Admin', email: 'a@a.com', role: 'admin', active: true }],
      tenantIntegrations: [],
    };
    const heart = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(rawTenant),
        findMany: jest.fn().mockResolvedValue([rawTenant]),
      },
    };
    const manager = {
      getTenantClient: jest.fn().mockResolvedValue({
        numeracaoNfce: { findUnique: jest.fn().mockResolvedValue({ ultimo: 5 }) },
      }),
    };
    const svc = new TenantsService(heart as any, manager as any, {} as any);

    const adminView = await svc.findById('t1', 'admin');
    expect(adminView.databaseUrl).toBeUndefined();
    expect(adminView.certPfx).toBeUndefined();
    expect(adminView.certSenha).toBeUndefined();
    expect(adminView.hasCertificado).toBe(true);
    expect(adminView.nfceCsc).toBe('csc-secret');
    expect(adminView.proximaNota).toBe(6);

    const opView = await svc.findById('t1', 'operator');
    expect(opView.nfceCsc).toBeUndefined();
    expect(opView.nfceIdCsc).toBeUndefined();
    expect(opView.cosmosApiKey).toBeUndefined();

    const list = await svc.findAll();
    expect(list[0].databaseUrl).toBeUndefined();
    expect(list[0].certPfx).toBeUndefined();
    expect(list[0].certSenha).toBeUndefined();
    expect(list[0].hasCertificado).toBe(true);
    expect(heart.tenant.findMany.mock.calls[0][0].include.users.select).toBeDefined();
    expect(heart.tenant.findMany.mock.calls[0][0].include.users.select.password).toBeUndefined();
  });

  it('prevents store admin updateTenant from mutating modulos, status or billing fields', async () => {
    const update = jest.fn().mockResolvedValue({ id: 't1', nomeFantasia: 'Nova Loja', certPfx: null, certSenha: 's', databaseUrl: 'u' });
    const svc = new TenantsService({ tenant: { update } } as any, {} as any, {} as any);

    const res = await svc.updateTenant('t1', {
      nomeFantasia: 'Nova Loja',
      modulos: { petshop: true, nfce: true },
      status: 'active',
      mensalidadeValor: 0,
      mensalidadeVencimento: '2099-01-01',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { nomeFantasia: 'Nova Loja' },
    });
    expect((res as any).databaseUrl).toBeUndefined();
    expect((res as any).certSenha).toBeUndefined();
  });

  it('validatePin rejects SQL_PIN when it differs from SETUP_PIN', async () => {
    const prevSetup = process.env.SETUP_PIN;
    const prevSql = process.env.SQL_PIN;
    process.env.SETUP_PIN = 'setup-only-pin';
    process.env.SQL_PIN = 'sql-only-pin';
    try {
      expect(await service.validatePin('setup-only-pin')).toBe(true);
      expect(await service.validatePin('sql-only-pin')).toBe(false);
    } finally {
      if (prevSetup === undefined) delete process.env.SETUP_PIN; else process.env.SETUP_PIN = prevSetup;
      if (prevSql === undefined) delete process.env.SQL_PIN; else process.env.SQL_PIN = prevSql;
    }
  });
});
