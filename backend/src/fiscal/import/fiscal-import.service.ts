import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { TenantConnectionManager } from '../../prisma/tenant-prisma.service';
import { TenantContextService } from '../../prisma/tenant-context.service';
import { FiscalLoggerService } from '../audit/fiscal-logger.service';
import { FiscalStorageService } from '../audit/fiscal-storage.service';
import { XmlParserService } from './xml-parser.service';
import { ValidationStage } from './stages/validation.stage';
import { MatchStage } from './stages/match.stage';
import * as crypto from 'crypto';

/**
 * FiscalImportService — Orquestra o fluxo de importação de NF-e.
 */
@Injectable()
export class FiscalImportService {
  private readonly logger = new Logger(FiscalImportService.name);

  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly fiscalLogger: FiscalLoggerService,
    private readonly storage: FiscalStorageService,
    private readonly parser: XmlParserService,
    private readonly validation: ValidationStage,
    private readonly matchStage: MatchStage,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  /**
   * Recebe um XML (string), valida, persiste como RECEBIDA, parseia e executa match automático.
   */
  async uploadXml(xmlContent: string, userId?: string) {
    const correlationId = FiscalLoggerService.generateCorrelationId();
    const trace = this.fiscalLogger.startTrace(correlationId);
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    trace.log(`Upload de XML iniciado | Tenant: ${tenantId}`);

    const tenantCnpj = '';

    // ── 1. Calcular Hash SHA-256 para anti-duplicação ─────────────────────────
    const xmlHash = crypto.createHash('sha256').update(xmlContent, 'utf-8').digest('hex');

    // ── 2. Buscar chaves ou hashes já importados ──────────────────────────────
    trace.step('check-duplicatas');
    const duplicate = await prisma.nfeEntrada.findFirst({
      where: {
        OR: [
          { xmlHash },
          { status: { not: 'CANCELADA' } as any } // Filtro genérico
        ]
      }
    });

    const existingEntries = await prisma.nfeEntrada.findMany({
      select: { chave: true },
      where: { status: { not: 'CANCELADA' } as any },
    });
    const existingKeys = new Set(existingEntries.map((e: any) => e.chave));

    // ── 3. ValidationStage ────────────────────────────────────────────────────
    trace.step('validation');
    const validation = this.validation.validate(xmlContent, tenantCnpj, existingKeys);
    if (!validation.valid) {
      trace.error(`Validação falhou: ${validation.errors.join('; ')}`);
      trace.finish();
      throw new BadRequestException({
        message: 'XML inválido ou rejeitado.',
        errors: validation.errors,
      });
    }

    // ── 4. ParserStage ────────────────────────────────────────────────────────
    trace.step('parser');
    const parsed = this.parser.parse(xmlContent);

    // Double check duplicata pela chave
    if (existingKeys.has(parsed.chave)) {
      throw new ConflictException(
        `Nota ${parsed.numero} (chave ${parsed.chave.substring(0, 12)}...) já foi importada.`,
      );
    }

    // ── 5. Salvar XML no Storage ──────────────────────────────────────────────
    trace.step('storage');
    const storageResult = this.storage.saveXml(parsed.chave, xmlContent);

    // ── 6. Persistir NfeEntrada como PROCESSANDO ──────────────────────────────
    trace.step('db-persist');
    const nfeEntrada = await prisma.nfeEntrada.create({
      data: {
        chave:          parsed.chave,
        numero:         parsed.numero,
        serie:          parsed.serie,
        dataEmissao:    parsed.dataEmissao,
        cnpjFornecedor: parsed.fornecedor.cnpj,
        nomeFornecedor: parsed.fornecedor.nome,
        valorTotal:     parsed.valorTotal,
        quantItens:     parsed.itens.length,
        status:         'PROCESSANDO' as any,
        xmlPath:        storageResult.xmlPath,
        xmlHash:        storageResult.xmlHash,
        xmlSize:        storageResult.xmlSize,
        xmlVersion:     parsed.xmlVersion,
        schemaVersion:  parsed.schemaVersion,
        itens: {
          create: parsed.itens.map(item => ({
            descricao:        item.descricao,
            codigoFornecedor: item.codigoFornecedor,
            codigoBarras:     item.codigoBarras || null,
            ncm:              item.ncm || null,
            cest:             item.cest || null,
            cfop:             item.cfop || null,
            unidade:          item.unidade,
            quantidade:       item.quantidade,
            custoUnitario:    item.custoUnitario,
            custoTotal:       item.custoTotal,
            uCom:             item.uCom || null,
            qCom:             item.qCom || null,
            vUnCom:           item.vUnCom || null,
            cEANTrib:         item.cEANTrib || null,
            status:           'RECEBIDA' as any,

            // Impostos
            cstIcms:          item.cstIcms || null,
            aliqIcms:         item.aliqIcms || null,
            vBCIcms:          item.vBCIcms || null,
            vIcms:            item.vIcms || null,
            cstPis:           item.cstPis || null,
            aliqPis:          item.aliqPis || null,
            vPis:             item.vPis || null,
            cstCofins:        item.cstCofins || null,
            aliqCofins:       item.aliqCofins || null,
            vCofins:          item.vCofins || null,
            cstIpi:           item.cstIpi || null,
            aliqIpi:          item.aliqIpi || null,
            vIpi:             item.vIpi || null,
            ibsCst:           item.ibsCst || null,
            ibsAliq:          item.ibsAliq || null,
            vIbs:             item.vIbs || null,
            cbsCst:           item.cbsCst || null,
            cbsAliq:          item.cbsAliq || null,
            vCbs:             item.vCbs || null,
          })),
        },
      },
      include: { itens: true },
    });

    // ── 7. Executar Match Automático em Cascata ──────────────────────────────
    trace.step('auto-match');
    let supplierId: string | null = null;
    try {
      const existingSupplier = await prisma.supplier.findFirst({
        where: { cnpjCpf: nfeEntrada.cnpjFornecedor.replace(/\D/g, '') },
      });
      if (existingSupplier) {
        supplierId = existingSupplier.id;
        await prisma.nfeEntrada.update({
          where: { id: nfeEntrada.id },
          data: { supplierId },
        });
      }
    } catch (err: any) {
      this.logger.error('Erro ao resolver fornecedor no upload: ' + err.message);
    }

    const matchResults = await this.matchStage.matchItens(
      prisma,
      nfeEntrada.itens.map(item => ({
        id:              item.id,
        codigoBarras:    item.codigoBarras,
        codigoBarrasTrib:item.cEANTrib,
        codigoFornecedor:item.codigoFornecedor,
        descricao:       item.descricao,
        ncm:             item.ncm,
      })),
      supplierId,
      nfeEntrada.id,
      correlationId,
      userId,
    );

    // Determinar status final baseado em matches
    const allMatched = matchResults.every(r => r.matchStatus === 'matched');
    const finalStatus = allMatched ? 'PRONTA_IMPORTAR' : 'AGUARDANDO_CONCILIACAO';

    const nfeFinal = await prisma.nfeEntrada.update({
      where: { id: nfeEntrada.id },
      data: { status: finalStatus as any },
      include: {
        itens: { include: { product: true } },
        supplier: true,
      },
    });

    // ── 8. Registrar evento de auditoria ──────────────────────────────────────
    await prisma.fiscalEvent.create({
      data: {
        nfeEntradaId:       nfeEntrada.id,
        type:               'XML_UPLOADED' as any,
        description:        `XML da NF-e ${parsed.numero} enviado manualmente. Status: ${finalStatus}.`,
        performedByUserId:  userId || null,
        correlationId,
      },
    });

    const traceResult = trace.finish();
    trace.log(`Upload concluído | NfeEntrada.id: ${nfeEntrada.id}`);

    return {
      id:            nfeFinal.id,
      correlationId,
      chave:         parsed.chave,
      numero:        parsed.numero,
      serie:         parsed.serie,
      dataEmissao:   parsed.dataEmissao,
      fornecedor:    parsed.fornecedor,
      valorTotal:    parsed.valorTotal,
      status:        nfeFinal.status,
      itens:         nfeFinal.itens,
      trace:         traceResult,
    };
  }

  /**
   * Lista NF-es pendentes de importação.
   */
  async listarPendentes() {
    const prisma = await this.getPrisma();
    return prisma.nfeEntrada.findMany({
      where: {
        status: { in: ['RECEBIDA', 'PROCESSANDO', 'AGUARDANDO_CONCILIACAO', 'PRONTA_IMPORTAR', 'IMPORTANDO', 'ERRO'] } as any,
      },
      orderBy: { dataEmissao: 'desc' },
      include: { supplier: true, itens: true },
    });
  }

  /**
   * Lista NF-es ja importadas ou canceladas (historico).
   */
  async listarHistorico() {
    const prisma = await this.getPrisma();
    return prisma.nfeEntrada.findMany({
      where: {
        status: { in: ['IMPORTADA', 'CANCELADA'] } as any,
      },
      orderBy: { importadaEm: 'desc' },
      include: { supplier: true, itens: true },
    });
  }

  /**
   * Exclui uma nota fiscal do sistema e opcionalmente estorna os itens importados do estoque fisico.
   * Mantem os cadastros tributarios e EANs no catalogo intactos.
   */
  async excluirNota(nfeId: string, revertStock: boolean) {
    const prisma = await this.getPrisma();

    // 1. Carregar a nota
    const nfe = await prisma.nfeEntrada.findUnique({
      where: { id: nfeId },
      include: { itens: true },
    });

    if (!nfe) {
      throw new BadRequestException('Nota fiscal nao encontrada.');
    }

    // 2. Executar em transacao
    await prisma.$transaction(async (tx: any) => {
      // Estornar estoque apenas se a nota foi importada com sucesso e revertStock for solicitado
      if (revertStock && nfe.status === 'IMPORTADA') {
        for (const item of nfe.itens) {
          if (item.productId) {
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { id: true, stock: true },
            });

            if (product) {
              const qtyEstorno = Number(item.quantidade);

              // Decrementa o estoque do produto
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  stock: { decrement: qtyEstorno },
                },
              });

              // Cria log de estorno (tipo OUT)
              await tx.inventoryLog.create({
                data: {
                  productId:    item.productId,
                  type:         'OUT',
                  quantity:     item.quantidade,
                  costPrice:    item.custoUnitario,
                  reason:       `Estorno NF-e Excluida ${nfe.numero} — ${nfe.nomeFornecedor}`,
                  origin:       nfe.nsu ? 'IMPORT_DFE' : 'IMPORT_XML',
                  referenceId:  nfe.id,
                  referenceKey: nfe.chave,
                },
              });

              // Exclui lote de estoque criado por esse item
              await tx.stockLot.deleteMany({
                where: {
                  productId:       item.productId,
                  supplierId:      nfe.supplierId || undefined,
                  cProdFornecedor: item.codigoFornecedor || null,
                  quantity:        item.quantidade,
                },
              });
            }
          }
        }
      }

      // 3. Excluir a nota (o Cascade delete do MySQL/Prisma limpa itens e eventos)
      await tx.nfeEntrada.delete({
        where: { id: nfeId },
      });
    });

    // 4. Excluir o XML bruto do disco se aplicavel
    if (nfe.xmlPath) {
      try {
        this.storage.deleteXml(nfe.xmlPath);
      } catch (err: any) {
        this.logger.warn(`Nao foi possivel excluir o XML fisicamente: ${nfe.xmlPath} | ${err.message}`);
      }
    }

    return { success: true, message: 'Nota fiscal excluida com sucesso.' };
  }

  /**
   * Retorna apenas o contador de notas pendentes.
   */
  async contarPendentes(): Promise<number> {
    const prisma = await this.getPrisma();
    return prisma.nfeEntrada.count({
      where: {
        status: { in: ['RECEBIDA', 'PROCESSANDO', 'AGUARDANDO_CONCILIACAO', 'PRONTA_IMPORTAR', 'ERRO'] } as any,
      },
    });
  }

  /**
   * Obtém detalhes completos de uma NF-e específica.
   */
  async obterDetalhes(nfeId: string) {
    const prisma = await this.getPrisma();
    const nfe = await prisma.nfeEntrada.findUnique({
      where: { id: nfeId },
      include: {
        itens: {
          include: { product: true },
        },
        supplier: true,
      },
    });

    if (!nfe) {
      throw new BadRequestException('Nota fiscal não encontrada.');
    }

    return nfe;
  }

  /**
   * Atualiza as informacoes de um item de NF-e, incluindo o vinculo de produto e dados de conversao.
   */
  async atualizarItem(itemId: string, data: {
    productId?: string;
    quantidade?: number;
    custoUnitario?: number;
    unidade?: string;
    uCom?: string;
    qCom?: number;
    vUnCom?: number;
  }) {
    const prisma = await this.getPrisma();

    const item = await prisma.nfeEntradaItem.findUnique({
      where: { id: itemId },
      include: { nfeEntrada: true },
    });
    if (!item) {
      throw new BadRequestException('Item da NF-e nao encontrado.');
    }

    if (['IMPORTADA', 'CANCELADA'].includes(item.nfeEntrada.status)) {
      throw new BadRequestException('Nao e possivel editar itens em uma nota ja importada ou cancelada.');
    }

    // Se estiver associando um produto, enriquecer dados dele
    if (data.productId && data.productId !== item.productId) {
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
      });
      if (!product) {
        throw new BadRequestException('Produto nao encontrado.');
      }

      // Enriquecer dados cadastrais do produto local (EAN, NCM, CEST) automaticamente com o XML
      try {
        const updatedData: any = {};
        const targetEan = (item.cEANTrib && item.cEANTrib !== 'SEM GTIN' && item.cEANTrib.trim() !== '')
          ? item.cEANTrib
          : item.codigoBarras;

        if (targetEan && targetEan !== 'SEM GTIN' && targetEan.trim() !== '') {
          const existingWithBarcode = await prisma.product.findFirst({
            where: { barcode: targetEan, id: { not: data.productId } },
          });
          if (!existingWithBarcode) {
            updatedData.barcode = targetEan;
          }
        }
        if (item.ncm) {
          updatedData.ncm = item.ncm;
        }
        if (item.cest) {
          updatedData.cest = item.cest;
        }

        if (Object.keys(updatedData).length > 0) {
          await prisma.product.update({
            where: { id: data.productId },
            data: updatedData,
          });
        }
      } catch (err: any) {
        this.logger.error('Erro ao atualizar produto local na vinculacao: ' + err.message);
      }

      // Se houver um fornecedor associado a nota, cria ou atualiza o SupplierProduct (atalho codigo fornecedor)
      if (item.nfeEntrada.supplierId && item.codigoFornecedor) {
        try {
          await prisma.supplierProduct.upsert({
            where: {
              supplierId_productId: {
                supplierId: item.nfeEntrada.supplierId,
                productId: data.productId,
              },
            },
            update: { cProdFornecedor: item.codigoFornecedor },
            create: {
              supplierId: item.nfeEntrada.supplierId,
              productId: data.productId,
              cProdFornecedor: item.codigoFornecedor,
            },
          });
        } catch (err: any) {
          this.logger.error('Erro ao salvar SupplierProduct: ' + err.message);
        }
      }
    }

    // Atualizar o item no banco
    const updatedItem = await prisma.nfeEntradaItem.update({
      where: { id: itemId },
      data: {
        productId:     data.productId !== undefined ? data.productId : undefined,
        quantidade:    data.quantidade !== undefined ? data.quantidade : undefined,
        custoUnitario: data.custoUnitario !== undefined ? data.custoUnitario : undefined,
        unidade:       data.unidade !== undefined ? data.unidade : undefined,
        uCom:          data.uCom !== undefined ? data.uCom : undefined,
        qCom:          data.qCom !== undefined ? data.qCom : undefined,
        vUnCom:        data.vUnCom !== undefined ? data.vUnCom : undefined,
      },
      include: { product: true },
    });

    // Verifica se todos os itens da nota agora possuem productId
    const itensNota = await prisma.nfeEntradaItem.findMany({
      where: { nfeEntradaId: item.nfeEntradaId },
    });
    const todosCasados = itensNota.every((i: any) => i.productId !== null);

    if (todosCasados && item.nfeEntrada.status === 'AGUARDANDO_CONCILIACAO') {
      await prisma.nfeEntrada.update({
        where: { id: item.nfeEntradaId },
        data: { status: 'PRONTA_IMPORTAR' as any },
      });
    } else if (!todosCasados && item.nfeEntrada.status === 'PRONTA_IMPORTAR') {
      await prisma.nfeEntrada.update({
        where: { id: item.nfeEntradaId },
        data: { status: 'AGUARDANDO_CONCILIACAO' as any },
      });
    }

    return updatedItem;
  }

  /**
   * Reprocessa o XML original salvo no disco, útil caso ocorra alguma alteração de cadastro ou lógica.
   */
  async reprocessar(nfeId: string) {
    const prisma = await this.getPrisma();
    const nfe = await prisma.nfeEntrada.findUnique({
      where: { id: nfeId },
    });

    if (!nfe) {
      throw new BadRequestException('Nota fiscal não encontrada.');
    }
    if (['IMPORTADA', 'CANCELADA'].includes(nfe.status)) {
      throw new BadRequestException('Não é possível reprocessar uma nota já importada ou cancelada.');
    }
    if (!nfe.xmlPath) {
      throw new BadRequestException('XML original não encontrado para reprocessamento.');
    }

    const xmlContent = this.storage.readXml(nfe.xmlPath);
    if (!xmlContent) {
      throw new BadRequestException('Arquivo XML não encontrado no disco.');
    }

    const parsed = this.parser.parse(xmlContent);

    // Deleta os itens antigos
    await prisma.nfeEntradaItem.deleteMany({
      where: { nfeEntradaId: nfeId },
    });

    // Recria itens baseados no novo parse
    const nfeAtualizada = await prisma.nfeEntrada.update({
      where: { id: nfeId },
      data: {
        status: 'PROCESSANDO' as any,
        itens: {
          create: parsed.itens.map(item => ({
            descricao:        item.descricao,
            codigoFornecedor: item.codigoFornecedor,
            codigoBarras:     item.codigoBarras || null,
            ncm:              item.ncm || null,
            cest:             item.cest || null,
            cfop:             item.cfop || null,
            unidade:          item.unidade,
            quantidade:       item.quantidade,
            custoUnitario:    item.custoUnitario,
            custoTotal:       item.custoTotal,
            uCom:             item.uCom || null,
            qCom:             item.qCom || null,
            vUnCom:           item.vUnCom || null,
            cEANTrib:         item.cEANTrib || null,
            status:           'RECEBIDA' as any,

            // Impostos
            cstIcms:          item.cstIcms || null,
            aliqIcms:         item.aliqIcms || null,
            vBCIcms:          item.vBCIcms || null,
            vIcms:            item.vIcms || null,
            cstPis:           item.cstPis || null,
            aliqPis:          item.aliqPis || null,
            vPis:             item.vPis || null,
            cstCofins:        item.cstCofins || null,
            aliqCofins:       item.aliqCofins || null,
            vCofins:          item.vCofins || null,
            cstIpi:           item.cstIpi || null,
            aliqIpi:          item.aliqIpi || null,
            vIpi:             item.vIpi || null,
            ibsCst:           item.ibsCst || null,
            ibsAliq:          item.ibsAliq || null,
            vIbs:             item.vIbs || null,
            cbsCst:           item.cbsCst || null,
            cbsAliq:          item.cbsAliq || null,
            vCbs:             item.vCbs || null,
          })),
        },
      },
      include: {
        itens: { include: { product: true } },
        supplier: true,
      },
    });

    // Roda match automático novamente
    const matchResults = await this.matchStage.matchItens(
      prisma,
      nfeAtualizada.itens.map(item => ({
        id:              item.id,
        codigoBarras:    item.codigoBarras,
        codigoBarrasTrib:item.cEANTrib,
        codigoFornecedor:item.codigoFornecedor,
        descricao:       item.descricao,
        ncm:             item.ncm,
      })),
      nfe.supplierId,
      nfeId,
      'reprocess_job',
    );

    const allMatched = matchResults.every(r => r.matchStatus === 'matched');
    const finalStatus = allMatched ? 'PRONTA_IMPORTAR' : 'AGUARDANDO_CONCILIACAO';

    return prisma.nfeEntrada.update({
      where: { id: nfeId },
      data: { status: finalStatus as any },
      include: {
        itens: { include: { product: true } },
        supplier: true,
      },
    });
  }
}
