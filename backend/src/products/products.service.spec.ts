import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: TenantConnectionManager, useValue: {} },
        { provide: TenantContextService, useValue: {} },
        { provide: HeartPrismaService, useValue: {} },
        { provide: IntegrationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
