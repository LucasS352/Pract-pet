import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsService } from './integrations.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { IfoodService } from './ifood/ifood.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IntegrationsService,
        { provide: HeartPrismaService, useValue: {} },
        { provide: TenantConnectionManager, useValue: {} },
        { provide: IfoodService, useValue: {} },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
