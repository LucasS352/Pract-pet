import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { XmlParserService } from './xml-parser.service';
import { ValidationStage } from './stages/validation.stage';
import { SupplierStage } from './stages/supplier.stage';
import { MatchStage } from './stages/match.stage';
import { InventoryStage } from './stages/inventory.stage';
import { FinalizeStage } from './stages/finalize.stage';
import { FiscalImportService } from './fiscal-import.service';
import { FiscalImportOrchestrator } from './fiscal-import.orchestrator';
import { FiscalImportController } from './fiscal-import.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { DistributionModule } from '../distribution/distribution.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    AuditModule,
    PrismaModule,
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
    forwardRef(() => DistributionModule),
  ],
  controllers: [FiscalImportController],
  providers: [
    XmlParserService,
    ValidationStage,
    SupplierStage,
    MatchStage,
    InventoryStage,
    FinalizeStage,
    FiscalImportService,
    FiscalImportOrchestrator,
  ],
  exports: [FiscalImportService, FiscalImportOrchestrator, XmlParserService],
})
export class ImportModule {}
