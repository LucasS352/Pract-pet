import { SalesModule } from '../sales/sales.module';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../auth/jwt.strategy';
import { PetshopAccessGuard } from './petshop-access.guard';
import { PetshopController } from './petshop.controller';
import { PetshopService } from './petshop.service';
import { PetshopPortalController } from './petshop-portal.controller';
import { PetshopPortalService } from './petshop-portal.service';
import { PetshopPackagesService } from './petshop-packages.service';
import { PetshopWhatsappService } from './petshop-whatsapp.service';
import { PetshopPricingService } from './petshop-pricing.service';
import { PetshopCommissionsService } from './petshop-commissions.service';

@Module({
  imports: [SalesModule, JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [PetshopController, PetshopPortalController],
  providers: [
    PetshopService,
    PetshopPortalService,
    PetshopPackagesService,
    PetshopWhatsappService,
    PetshopPricingService,
    PetshopCommissionsService,
    PetshopAccessGuard,
  ],
  exports: [PetshopPackagesService, PetshopWhatsappService, PetshopPricingService],
})
export class PetshopModule {}
