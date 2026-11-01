import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService]
})
export class ProductsModule {}
