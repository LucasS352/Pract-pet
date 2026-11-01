import { Module } from '@nestjs/common';
import { OperatorsService } from './operators.service';
import { OperatorsController } from './operators.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [TenantsModule, ProductsModule],
  controllers: [OperatorsController],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
