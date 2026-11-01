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
});
