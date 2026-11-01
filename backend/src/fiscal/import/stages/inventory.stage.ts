import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface InventoryCommitItem {
  productId: string;
  quantidade: number;
  custoUnitario: number;
  nfeEntradaItemId: string;
  cProdFornecedor?: string | null;
  loteFornecedor?: string | null;
  dataFabricacao?: Date | null;
  expiresAt?: Date | null;
}

export interface InventoryResult {
  itemsCommitted: number;
  itemsSkipped:   number;
  totalValueAdded: number;
}

/**
 * InventoryStage — Executa a entrada de estoque dentro de uma única transação.
 *
 * Por item confirmado:
 * 1. Calcula custo médio ponderado
 * 2. Atualiza product.stock += quantidade
 * 3. Atualiza product.priceCost = novoCustoMedio
 * 4. Cria StockLot (lote para FIFO/custeio)
 * 5. Cria InventoryLog (histórico)
 * 6. Marca NfeEntradaItem como IMPORTADA (status final)
 *
 * TUDO em uma única transação: se qualquer item falhar — ROLLBACK total.
 */
@Injectable()
export class InventoryStage {
  private readonly logger = new Logger(InventoryStage.name);

  async commit(
    prisma: any,
    items: InventoryCommitItem[],
    supplierId: string | null,
    nfeEntradaId: string,
    correlationId: string,
    nfeNumero: string,
    nomeFornecedor: string,
    chaveNota: string,
    origin: 'IMPORT_XML' | 'IMPORT_DFE',
  ): Promise<InventoryResult> {
    let itemsCommitted = 0;
    let itemsSkipped   = 0;
    let totalValueAdded = 0;

    // TRANSAÇÃO ÚNICA: BEGIN ... COMMIT ou ROLLBACK
    await prisma.$transaction(async (tx: any) => {
      for (const item of items) {
        if (!item.productId) {
          itemsSkipped++;
          continue;
        }

        // Buscar produto atual para calcular custo médio
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true, priceCost: true, name: true },
        });

        if (!product) {
          this.logger.warn(`[${correlationId}] Produto ${item.productId} não encontrado. Pulando.`);
          itemsSkipped++;
          continue;
        }

        const estoqueAtual  = new Prisma.Decimal(product.stock);
        const custoAtual    = new Prisma.Decimal(product.priceCost);
        const qtdEntrada    = new Prisma.Decimal(item.quantidade);
        const custoNovo     = new Prisma.Decimal(item.custoUnitario);

        // Custo Médio Ponderado: (EstoqueAtual × CustoAtual + QtdEntrada × CustoNovo) / NovoEstoque
        const novoEstoque = estoqueAtual.add(qtdEntrada);
        let novoCusto = custoNovo; // fallback: se estoque vazio, usa o custo da nota
        if (novoEstoque.greaterThan(0)) {
          novoCusto = estoqueAtual.mul(custoAtual).add(qtdEntrada.mul(custoNovo)).div(novoEstoque);
        }

        // 1. Atualizar estoque e custo médio do produto
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock:     { increment: qtdEntrada },
            priceCost: novoCusto,
          },
        });

        // 2. Criar lote de estoque (para FIFO/rastreabilidade)
        await tx.stockLot.create({
          data: {
            productId:       item.productId,
            costPrice:       custoNovo,
            quantity:        qtdEntrada,
            remaining:       qtdEntrada,
            supplierId:      supplierId || undefined,
            cProdFornecedor: item.cProdFornecedor || null,
            loteFornecedor:  item.loteFornecedor || null,
            dataFabricacao:  item.dataFabricacao || null,
            expiresAt:       item.expiresAt || null,
          },
        });

        // 3. Recalcular e garantir sincronização total do estoque físico com a soma dos lotes
        const allLots = await tx.stockLot.findMany({
          where: { productId: item.productId },
          orderBy: { createdAt: 'desc' },
        });
        const lotSum = allLots.reduce((acc: number, l: any) => acc + Number(l.remaining), 0);
        if (lotSum >= 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: new Prisma.Decimal(lotSum) },
          });
        }

        // 3. Criar log de inventário
        await tx.inventoryLog.create({
          data: {
            productId:    item.productId,
            type:         'IN',
            quantity:     qtdEntrada,
            costPrice:    custoNovo,
            reason:       `NF-e ${nfeNumero} — ${nomeFornecedor}`,
            origin,
            referenceId:  nfeEntradaId,
            referenceKey: chaveNota,
          },
        });

        // 4. Marcar item como IMPORTADO (no novo enum)
        await tx.nfeEntradaItem.update({
          where: { id: item.nfeEntradaItemId },
          data:  { status: 'IMPORTADA' as any },
        });

        totalValueAdded += item.quantidade * item.custoUnitario;
        itemsCommitted++;

        this.logger.log(
          `[${correlationId}] ${product.name}: +${item.quantidade} unidades | Custo médio: R$${novoCusto.toFixed(4)}`,
        );
      }
    }); // FIM DA TRANSAÇÃO

    return { itemsCommitted, itemsSkipped, totalValueAdded };
  }
}
