import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { JwtService } from '@nestjs/jwt';
import { StationAccessService } from './station-access.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService,
        { provide: HeartPrismaService, useValue: {} },
        { provide: TenantConnectionManager, useValue: {} },
        { provide: TenantContextService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: StationAccessService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
