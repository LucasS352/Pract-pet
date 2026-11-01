import { Injectable, Logger } from '@nestjs/common';
import { FiscalEventType } from '@prisma/client';

export type MatchStatus = 'matched' | 'not_found';

export interface ItemMatchResult {
  itemId: string;       // ID do NfeEntradaItem
  productId: string | null;
  matchStatus: MatchStatus;
  matchMethod: string | null; // 'barcode' | 'supplier_code' | 'shortcode' | 'name_like' | null
  productName: string | null;
}

/**
 * MatchStage — Tenta relacionar itens da NF-e com produtos cadastrados no sistema.
 *
 * Regras de relacionamento (ordem de prioridade):
 * 1. Código de barras (EAN/GTIN) — match exato
 * 2. Código do fornecedor (SupplierProduct) — match exato
 * 3. ShortCode (código interno) — match exato
 * 4. Nome semelhante (LIKE %...%) — match fuzzy
 */
@Injectable()
export class MatchStage {
  private readonly logger = new Logger(MatchStage.name);

  async matchItens(
    prisma: any,
    itens: { id: string; codigoBarras: string | null; codigoBarrasTrib?: string | null; codigoFornecedor: string | null; descricao: string }[],
    supplierId: string | null,
    nfeEntradaId: string,
    correlationId: string,
    userId?: string,
  ): Promise<ItemMatchResult[]> {
    const results: ItemMatchResult[] = [];

    for (const item of itens) {
      const result = await this.matchSingleItem(prisma, item, supplierId, correlationId);
      results.push(result);

      // Registrar evento de match
      if (result.matchStatus === 'matched' && result.productId) {
        await prisma.fiscalEvent.create({
          data: {
            nfeEntradaId,
            type:              FiscalEventType.PRODUCT_MATCHED,
            description:       `Item "${item.descricao}" relacionado automaticamente ao produto "${result.productName}" via ${result.matchMethod}.`,
            performedByUserId: userId || null,
            correlationId,
          },
        });

        // Atualizar status do item
        await prisma.nfeEntradaItem.update({
          where: { id: item.id },
          data: { productId: result.productId },
        });
      }
    }

    const matched = results.filter(r => r.matchStatus === 'matched').length;
    this.logger.log(`[${correlationId}] Match: ${matched}/${itens.length} itens relacionados automaticamente.`);

    return results;
  }

  private async matchSingleItem(
    prisma: any,
    item: { id: string; codigoBarras: string | null; codigoBarrasTrib?: string | null; codigoFornecedor: string | null; descricao: string; ncm?: string | null },
    supplierId: string | null,
    correlationId: string,
  ): Promise<ItemMatchResult> {
    const notFound: ItemMatchResult = {
      itemId: item.id,
      productId: null,
      matchStatus: 'not_found',
      matchMethod: null,
      productName: null,
    };

    // 1. Fornecedor + Código Interno (SupplierProduct)
    if (supplierId && item.codigoFornecedor) {
      const supplierProduct = await prisma.supplierProduct.findFirst({
        where: { supplierId, cProdFornecedor: item.codigoFornecedor },
        include: { product: { select: { id: true, name: true } } },
      });
      if (supplierProduct?.product) {
        return {
          itemId: item.id,
          productId: supplierProduct.product.id,
          matchStatus: 'matched',
          matchMethod: 'supplier_code',
          productName: supplierProduct.product.name,
        };
      }
    }

    // 2. EAN/GTIN (Embalagem comercial)
    if (item.codigoBarras && item.codigoBarras !== 'SEM GTIN' && item.codigoBarras.trim() !== '') {
      const product = await prisma.product.findFirst({
        where: { barcode: item.codigoBarras },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'barcode',
          productName: product.name,
        };
      }
    }

    // 2b. EAN/GTIN (Item individual tributável)
    if (item.codigoBarrasTrib && item.codigoBarrasTrib !== 'SEM GTIN' && item.codigoBarrasTrib.trim() !== '') {
      const product = await prisma.product.findFirst({
        where: { barcode: item.codigoBarrasTrib },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'barcode_trib',
          productName: product.name,
        };
      }
    }

    // 3. Código interno (ShortCode) - match exato
    if (item.codigoFornecedor) {
      const product = await prisma.product.findFirst({
        where: { shortCode: item.codigoFornecedor },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'shortcode',
          productName: product.name,
        };
      }
    }

    // 4. ShortCode (contains / aproximado)
    if (item.codigoFornecedor) {
      const product = await prisma.product.findFirst({
        where: { shortCode: { contains: item.codigoFornecedor } },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'shortcode_contains',
          productName: product.name,
        };
      }
    }

    // 5. Nome semelhante (Busca inteligente por palavras-chave com AND)
    const keywords = this.getCleanKeywords(item.descricao);
    if (keywords.length >= 2) {
      const product = await prisma.product.findFirst({
        where: {
          AND: keywords.map(kw => ({
            name: { contains: kw }
          }))
        },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'name_keywords',
          productName: product.name,
        };
      }
    } else if (item.descricao && item.descricao.length >= 3) {
      // Fallback: substring simples
      const searchTerm = item.descricao.substring(0, Math.min(item.descricao.length, 15));
      const product = await prisma.product.findFirst({
        where: { name: { contains: searchTerm } },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'name_like',
          productName: product.name,
        };
      }
    }

    // 6. NCM (baixo nível de prioridade para evitar falsos positivos)
    if (item.ncm && item.ncm.trim() !== '') {
      const product = await prisma.product.findFirst({
        where: { ncm: item.ncm },
        select: { id: true, name: true },
      });
      if (product) {
        return {
          itemId: item.id,
          productId: product.id,
          matchStatus: 'matched',
          matchMethod: 'ncm',
          productName: product.name,
        };
      }
    }

    return notFound;
  }

  private getCleanKeywords(description: string): string[] {
    if (!description) return [];
    let clean = description.toUpperCase();
    
    // Remove termos comuns de embalagem comercial
    clean = clean.replace(/\b(LT\d+|CX|C\/\d+|FD|PACK|FI|FL|MAINLINE|MAIN|VD|GFA|C\b)\b/g, ' ');
    clean = clean.replace(/[./\-(),]/g, ' ');
    
    return clean.split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 2 && !['CX', 'FD', 'LT', 'UN', 'KG', 'PCT', 'FL', 'FI', 'C'].includes(w));
  }
}
