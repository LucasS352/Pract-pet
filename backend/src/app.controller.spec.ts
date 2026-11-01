import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HeartPrismaService } from './prisma/heart-prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: HeartPrismaService, useValue: {} }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return health check object', () => {
      const result = appController.healthCheck();
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
    });
  });
});
