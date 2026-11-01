import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';
import { Module } from '@nestjs/common';
import { ComandasController } from './comandas.controller';
import { ComandasService } from './comandas.service';
import { ProductsModule } from '../products/products.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [ProductsModule, IntegrationsModule, TenantsModule],
  controllers: [ComandasController, KdsController],
  providers: [ComandasService, KdsService],
  exports: [ComandasService],
})
export class ComandasModule {}
