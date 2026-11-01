import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { NfceService } from '../nfce/nfce.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { MailService } from '../mail/mail.service';
import { IntegrationsService } from '../integrations/integrations.service';

describe('SalesService', () => {
  let service: SalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: TenantConnectionManager, useValue: {} },
        { provide: HeartPrismaService, useValue: {} },
        { provide: NfceService, useValue: {} },
        { provide: TenantContextService, useValue: {} },
        { provide: ProductsService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: IntegrationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
