import { Test, TestingModule } from '@nestjs/testing';
import { TenantConnectionManagerService } from './tenant-connection-manager.service';

describe('TenantConnectionManagerService', () => {
  let service: TenantConnectionManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantConnectionManagerService],
    }).compile();

    service = module.get<TenantConnectionManagerService>(TenantConnectionManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
