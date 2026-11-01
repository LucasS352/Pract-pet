import { Test, TestingModule } from '@nestjs/testing';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';

describe('CashRegistersController', () => {
  let controller: CashRegistersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashRegistersController],
      providers: [{ provide: CashRegistersService, useValue: { findAll: jest.fn().mockResolvedValue([]) } }],
    }).compile();

    controller = module.get<CashRegistersController>(CashRegistersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
