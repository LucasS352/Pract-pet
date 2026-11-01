import { Test, TestingModule } from '@nestjs/testing';
import { IfoodService } from './ifood.service';

describe('IfoodService', () => {
  let service: IfoodService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IfoodService],
    }).compile();

    service = module.get<IfoodService>(IfoodService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
