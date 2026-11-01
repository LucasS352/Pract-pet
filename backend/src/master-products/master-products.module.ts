import { Module } from '@nestjs/common';
import { MasterProductsService } from './master-products.service';
import { MasterProductsController } from './master-products.controller';

@Module({
  providers: [MasterProductsService],
  controllers: [MasterProductsController],
})
export class MasterProductsModule {}
