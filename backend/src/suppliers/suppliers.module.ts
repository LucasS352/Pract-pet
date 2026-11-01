import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, TenantsModule, ProductsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
