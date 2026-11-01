import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [PrismaModule, TenantsModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
