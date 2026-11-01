import { Test, TestingModule } from '@nestjs/testing';
import { HeartPrismaService } from './heart-prisma.service';

describe('HeartPrismaService', () => {
  let service: HeartPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeartPrismaService],
    }).compile();

    service = module.get<HeartPrismaService>(HeartPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
