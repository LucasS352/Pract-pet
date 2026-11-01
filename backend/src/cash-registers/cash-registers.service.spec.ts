import { Test, TestingModule } from '@nestjs/testing';
import { CashRegistersService } from './cash-registers.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { JwtService } from '@nestjs/jwt';

describe('CashRegistersService', () => {
  let service: CashRegistersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CashRegistersService,
        { provide: TenantConnectionManager, useValue: {} },
        { provide: TenantContextService, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    service = module.get<CashRegistersService>(CashRegistersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
