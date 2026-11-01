import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImportModule } from './import/import.module';
import { DistributionModule } from './distribution/distribution.module';
import { DanfeModule } from './danfe/danfe.module';
import { AuditModule } from './audit/audit.module';
import { FiscalPhpService } from './fiscal-php.service';

@Module({
  imports: [
    HttpModule,
    ImportModule,
    DistributionModule,
    DanfeModule,
    AuditModule,
  ],
  providers: [FiscalPhpService],
  exports: [FiscalPhpService],
})
export class FiscalModule {}
