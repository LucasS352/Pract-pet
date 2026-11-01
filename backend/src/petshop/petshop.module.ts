import { Module } from '@nestjs/common';
import { PetshopAccessGuard } from './petshop-access.guard';
import { PetshopController } from './petshop.controller';
import { PetshopService } from './petshop.service';
import { PetshopPortalController } from './petshop-portal.controller';
import { PetshopPortalService } from './petshop-portal.service';

@Module({
  controllers: [PetshopController, PetshopPortalController],
  providers: [PetshopService, PetshopPortalService, PetshopAccessGuard],
})
export class PetshopModule {}
