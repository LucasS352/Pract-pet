import { Module } from '@nestjs/common';
import { FiscalLoggerService } from './fiscal-logger.service';
import { FiscalStorageService } from './fiscal-storage.service';
import { FiscalMetricsService } from './fiscal-metrics.service';
import { FiscalAuditController } from './fiscal-audit.controller';

@Module({
  controllers: [FiscalAuditController],
  providers: [FiscalLoggerService, FiscalStorageService, FiscalMetricsService],
  exports: [FiscalLoggerService, FiscalStorageService, FiscalMetricsService],
})
export class AuditModule {}
