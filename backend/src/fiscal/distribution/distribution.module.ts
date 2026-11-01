import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ImportModule } from '../import/import.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FiscalDistributionService } from './fiscal-distribution.service';
import { DownloadStage } from './stages/download.stage';
import { FiscalModule } from '../fiscal.module';

@Module({
  imports: [AuditModule, PrismaModule, forwardRef(() => ImportModule), forwardRef(() => FiscalModule)],
  providers: [FiscalDistributionService, DownloadStage],
  exports: [FiscalDistributionService],
})
export class DistributionModule {}
