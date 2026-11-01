import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { IfoodService } from './ifood/ifood.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [PrismaModule, TenantsModule],
  providers: [IntegrationsService, IfoodService],
  controllers: [IntegrationsController],
  exports: [IntegrationsService]
})
export class IntegrationsModule {}
