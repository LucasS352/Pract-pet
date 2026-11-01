import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { TenantsService } from '../tenants/tenants.service';
import { IfoodService } from './ifood/ifood.service';

describe('IntegrationsController', () => {
  let controller: IntegrationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: IntegrationsService, useValue: {} },
        { provide: TenantsService, useValue: {} },
        { provide: IfoodService, useValue: {} },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
