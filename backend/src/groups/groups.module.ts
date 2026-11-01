import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, ProductsModule],
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupsModule {}
