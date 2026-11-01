import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { TenantConnectionManager } from '../../prisma/tenant-prisma.service';
import { TenantContextService } from '../../prisma/tenant-context.service';
import { FiscalLoggerService } from '../audit/fiscal-logger.service';
import { FiscalMetricsService } from '../audit/fiscal-metrics.service';
import { SupplierStage } from './stages/supplier.stage';
import { MatchStage } from './stages/match.stage';
import { InventoryStage } from './stages/inventory.stage';
import { FinalizeStage } from './stages/finalize.stage';

export interface ConfirmarImportacaoDto {
  nfeEntradaId:   string;
  /** IDs dos NfeEntradaItem selecionados para importar (importação parcial) */
  itensSelecionados: string[];
  userId?: string;
}

/**
 * FiscalImportOrchestrator — Coordena o pipeline de importação de NF-e.
 *
 * Pipeline v1 (Sprint 3):
 *   SupplierStage → MatchStage → InventoryStage → FinalizeStage
 *
 * Ao finalizar, emite o Domain Event 'inventory.imported' para que
 * outros módulos (Dashboard, Compras, etc.) possam reagir de forma desacoplada.
 */
@Injectable()
export class FiscalImportOrchestrator {
  private readonly logger = new Logger(FiscalImportOrchestrator.name);

  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly fiscalLogger: FiscalLoggerService,
    private readonly metrics: FiscalMetricsService,
    private readonly supplierStage: SupplierStage,
    private readonly matchStage: MatchStage,
    private readonly inventoryStage: InventoryStage,
    private readonly finalizeStage: FinalizeStage,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  /**
   * Confirma a importação dos itens selecionados de uma NF-e.
   * Suporta importação parcial (apenas os itensSelecionados serão processados).
   */
  async confirmar(dto: ConfirmarImportacaoDto) {
    const correlationId = FiscalLoggerService.generateCorrelationId();
    const trace = this.fiscalLogger.startTrace(correlationId);
    const prisma = await this.getPrisma();
    const startMs = Date.now();

    trace.log(`Iniciando confirmação NfeEntrada: ${dto.nfeEntradaId}`);

    // ── 1. Carregar NF-e e itens ─────────────────────────────────────────────────────
    trace.step('load-nfe');
    const nfeEntrada = await prisma.nfeEntrada.findUnique({
      where:   { id: dto.nfeEntradaId },
      include: { itens: true },
    });

    if (!nfeEntrada) {
      throw new BadRequestException('NF-e não encontrada.');
    }
    if (['IMPORTADA', 'CANCELADA'].includes(nfeEntrada.status)) {
      throw new BadRequestException(`NF-e já processada (status: ${nfeEntrada.status}).`);
    }

    // Atualizar status para IMPORTANDO (lock otimista)
    await prisma.nfeEntrada.update({
      where: { id: dto.nfeEntradaId },
      data:  { status: 'IMPORTANDO' as any },
    });

    // Filtrar apenas os itens selecionados (suporte a importação parcial)
    const itensSelecionados = nfeEntrada.itens.filter((item: any) =>
      dto.itensSelecionados.includes(item.id),
    );

    if (itensSelecionados.length === 0) {
      throw new BadRequestException('Nenhum item selecionado para importação.');
    }

    try {
      // ── 2. SupplierStage ─────────────────────────────────────────────────
      trace.step('supplier');
      const supplierResult = await this.supplierStage.resolve(
        prisma,
        {
          cnpj:      nfeEntrada.cnpjFornecedor,
          nome:      nfeEntrada.nomeFornecedor,
        },
        dto.nfeEntradaId,
        correlationId,
        dto.userId,
      );

      // ── 4. InventoryStage ───────────────────────────────────────────────────
      trace.step('inventory');
      const inventoryItems = itensSelecionados
        .filter((item: any) => item.productId)
        .map((item: any) => {
          return {
            productId:        item.productId,
            quantidade:       Number(item.quantidade),
            custoUnitario:    Number(item.custoUnitario),
            nfeEntradaItemId: item.id,
            cProdFornecedor:  item.codigoFornecedor || null,
          };
        });

      const matchResults = itensSelecionados.map((item: any) => ({
        itemId:      item.id,
        productId:   item.productId,
        matchStatus: item.productId ? 'matched' : 'not_found',
        matchMethod: item.productId ? 'database_saved' : null,
      }));

      const inventoryResult = await this.inventoryStage.commit(
        prisma,
        inventoryItems,
        supplierResult.supplierId,
        dto.nfeEntradaId,
        correlationId,
        nfeEntrada.numero,
        nfeEntrada.nomeFornecedor,
        nfeEntrada.chave,
        nfeEntrada.nsu ? 'IMPORT_DFE' : 'IMPORT_XML',
      );

      // ── 5. FinalizeStage ───────────────────────────────────────────────────
      trace.step('finalize');
      const finalResult = await this.finalizeStage.execute({
        prisma,
        nfeEntradaId:   dto.nfeEntradaId,
        supplierId:     supplierResult.supplierId,
        itemsCommitted: inventoryResult.itemsCommitted,
        itemsSkipped:   inventoryResult.itemsSkipped,
        totalValueAdded:inventoryResult.totalValueAdded,
        nomeFornecedor: nfeEntrada.nomeFornecedor,
        nfeNumero:      nfeEntrada.numero,
        correlationId,
        userId:         dto.userId,
      });

      // ── 6. Emitir Domain Event (desacoplamento) ──────────────────────────
      this.eventEmitter.emit('inventory.imported', {
        nfeEntradaId:    dto.nfeEntradaId,
        tenantId:        this.tenantContext.get().tenantId,
        itemsCommitted:  inventoryResult.itemsCommitted,
        totalValueAdded: inventoryResult.totalValueAdded,
        correlationId,
      });

      const traceResult = trace.finish();
      const totalMs = Date.now() - startMs;

      this.metrics.record({
        success:    true,
        estoqueMs:  traceResult.steps['inventory'] || 0,
        bancoMs:    traceResult.steps['load-nfe'] || 0,
      });

      return {
        ...finalResult,
        correlationId,
        durationMs: totalMs,
        matchResults: matchResults.map(r => ({
          itemId:      r.itemId,
          productId:   r.productId,
          matched:     r.matchStatus === 'matched',
          matchMethod: r.matchMethod,
        })),
      };

    } catch (error: any) {
      // Em caso de erro: salvar no Dead Letter e reverter status
      trace.error(`Erro na importação: ${error.message}`);
      trace.finish();

      await prisma.nfeEntrada.update({
        where: { id: dto.nfeEntradaId },
        data:  { status: 'ERRO' as any },
      });

      await prisma.fiscalFailedJob.create({
        data: {
          correlationId,
          action:  'IMPORT_NFE',
          payload: { nfeEntradaId: dto.nfeEntradaId, userId: dto.userId },
          error:   error.message,
        },
      });

      this.metrics.record({ success: false });
      throw error;
    }
  }
}
