import { Module, forwardRef } from '@nestjs/common';
import { DanfeController } from './danfe.controller';
import { DanfeService } from './danfe.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { FiscalModule } from '../fiscal.module';

@Module({
  imports: [PrismaModule, AuditModule, forwardRef(() => FiscalModule)],
  controllers: [DanfeController],
  providers: [DanfeService],
  exports: [DanfeService],
})
export class DanfeModule {}
