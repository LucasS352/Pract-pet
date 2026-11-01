import { Global, Module } from '@nestjs/common';
import { HeartPrismaService } from './heart-prisma.service';
import { TenantConnectionManager } from './tenant-prisma.service';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  providers: [HeartPrismaService, TenantConnectionManager, TenantContextService],
  exports: [HeartPrismaService, TenantConnectionManager, TenantContextService],
})
export class PrismaModule {}
