import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProductsModule } from '../products/products.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [PrismaModule, TenantsModule, ProductsModule, IntegrationsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
