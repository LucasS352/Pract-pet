import { Module, Global } from '@nestjs/common';
import { HeartPrismaService } from './heart-prisma/heart-prisma.service';
import { TenantConnectionManager } from './tenant-connection-manager/tenant-connection-manager.service';

@Global()
@Module({
  providers: [HeartPrismaService, TenantConnectionManager],
  exports: [HeartPrismaService, TenantConnectionManager]
})
export class PrismaModule {}
