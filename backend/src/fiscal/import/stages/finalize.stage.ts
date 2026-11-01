import { Injectable, Logger } from '@nestjs/common';
import { FiscalEventType } from '@prisma/client';

/**
 * FinalizeStage — Última etapa do pipeline de importação.
 *
 * Responsabilidades:
 * 1. Determinar status final da NF-e (IMPORTED ou PARTIAL)
 * 2. Atualizar NfeEntrada com status final, supplierId e timestamp
 * 3. Emitir FiscalEvent de conclusão com resumo
 * 4. Retornar mensagem de sucesso rica para o usuário
 */
@Injectable()
export class FinalizeStage {
  private readonly logger = new Logger(FinalizeStage.name);

  async execute(params: {
    prisma: any;
    nfeEntradaId: string;
    supplierId: string | null;
    itemsCommitted: number;
    itemsSkipped: number;
    totalValueAdded: number;
    nomeFornecedor: string;
    nfeNumero: string;
    correlationId: string;
    userId?: string;
  }): Promise<{ status: string; summary: object }> {
    const {
      prisma, nfeEntradaId, supplierId,
      itemsCommitted, itemsSkipped, totalValueAdded,
      nomeFornecedor, nfeNumero, correlationId, userId,
    } = params;

    const statusFinal = itemsCommitted > 0
      ? 'IMPORTADA'
      : 'ERRO';

    // Atualizar a NF-e com status final
    await prisma.nfeEntrada.update({
      where: { id: nfeEntradaId },
      data: {
        status:      statusFinal as any,
        supplierId:  supplierId || undefined,
        importadaEm: new Date(),
      },
    });

    const eventType = statusFinal === 'IMPORTADA'
      ? FiscalEventType.IMPORT_FINISHED
      : FiscalEventType.IMPORT_PARTIAL;

    const description = [
      `Importação concluída para NF-e ${nfeNumero} (Fornecedor: ${nomeFornecedor}).`,
      `Produtos importados: ${itemsCommitted}.`,
      itemsSkipped > 0 ? `Produtos ignorados/não relacionados: ${itemsSkipped}.` : '',
      `Valor total entrada: R$ ${totalValueAdded.toFixed(2)}.`,
    ].filter(Boolean).join(' ');

    await prisma.fiscalEvent.create({
      data: {
        nfeEntradaId,
        type:              eventType,
        description,
        performedByUserId: userId || null,
        correlationId,
      },
    });

    this.logger.log(`[${correlationId}] ${description}`);

    const summary = {
      status:             statusFinal,
      fornecedor:         nomeFornecedor,
      nfeNumero,
      produtosImportados: itemsCommitted,
      produtosIgnorados:  itemsSkipped,
      valorTotal:         `R$ ${totalValueAdded.toFixed(2)}`,
      mensagem:           `Entrada realizada com sucesso. Estoque e custo médio atualizados.`,
    };

    return { status: statusFinal, summary };
  }
}
