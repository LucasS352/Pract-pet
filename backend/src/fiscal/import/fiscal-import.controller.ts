import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FiscalImportService } from './fiscal-import.service';
import { FiscalImportOrchestrator } from './fiscal-import.orchestrator';
import { FiscalDistributionService } from '../distribution/fiscal-distribution.service';
import { TenantContextService } from '../../prisma/tenant-context.service';

@UseGuards(JwtAuthGuard)
@Controller('v1/fiscal/import')
export class FiscalImportController {
  constructor(
    private readonly importService: FiscalImportService,
    private readonly orchestrator: FiscalImportOrchestrator,
    private readonly distributionService: FiscalDistributionService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * POST /v1/fiscal/import/upload-xml
   * Recebe um arquivo .xml ou string XML no body e inicia o processo de importação.
   * Retorna os dados parseados para o frontend exibir antes de confirmar.
   */
  @Post('upload-xml')
  @UseInterceptors(FileInterceptor('file'))
  async uploadXml(
    @Request() req: any,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: { xml?: string },
  ) {
    let xmlContent: string;

    if (file) {
      // Upload via multipart/form-data
      xmlContent = file.buffer.toString('utf-8');
    } else if (body?.xml) {
      // XML enviado diretamente no body JSON
      xmlContent = body.xml;
    } else {
      throw new BadRequestException(
        'Envie o XML via arquivo (multipart) ou campo "xml" no body.',
      );
    }

    const userId = req.user?.id || req.user?.userId;
    return this.importService.uploadXml(xmlContent, userId);
  }

  /**
   * POST /v1/fiscal/import/sync-dfe
   * Busca notas fiscais eletrônicas (DF-e) destinadas ao CNPJ do tenant diretamente na SEFAZ.
   */
  @Post('sync-dfe')
  async syncDfe() {
    const { tenantId } = this.tenantContext.get();
    return this.distributionService.syncSingleTenant(tenantId);
  }

  /**
   * GET /v1/fiscal/import/pendentes
   * Lista NF-es pendentes de importação.
   */
  @Get('pendentes')
  async listarPendentes() {
    return this.importService.listarPendentes();
  }

  /**
   * GET /v1/fiscal/import/pendentes/count
   * Retorna o contador de notas pendentes.
   */
  @Get('pendentes/count')
  async contarPendentes() {
    const count = await this.importService.contarPendentes();
    return { count };
  }

  /**
   * GET /v1/fiscal/import/nfe/:id
   * Retorna os detalhes de uma NF-e de entrada específica.
   */
  @Get('nfe/:id')
  async obterDetalhes(@Param('id') id: string) {
    return this.importService.obterDetalhes(id);
  }

  /**
   * PATCH /v1/fiscal/import/items/:id
   * Associa manualmente um item de NF-e a um produto cadastrado.
   */
  @Patch('items/:id')
  async atualizarItem(
    @Param('id') itemId: string,
    @Body() body: {
      productId?: string;
      quantidade?: number;
      custoUnitario?: number;
      unidade?: string;
      uCom?: string;
      qCom?: number;
      vUnCom?: number;
    },
  ) {
    return this.importService.atualizarItem(itemId, body);
  }

  /**
   * POST /v1/fiscal/import/nfe/:id/confirm
   * Confirma a importação final da nota fiscal, incrementando estoque e gerando logs.
   */
  @Post('nfe/:id/confirm')
  async confirmarImportacao(
    @Request() req: any,
    @Param('id') nfeEntradaId: string,
    @Body() body: { itensSelecionados: string[] },
  ) {
    if (!body.itensSelecionados || !Array.isArray(body.itensSelecionados)) {
      throw new BadRequestException('O array itensSelecionados é obrigatório.');
    }
    const userId = req.user?.id || req.user?.userId;
    return this.orchestrator.confirmar({
      nfeEntradaId,
      itensSelecionados: body.itensSelecionados,
      userId,
    });
  }

  /**
   * POST /v1/fiscal/import/nfe/:id/reprocess
   * Reprocessa o XML original salvo no disco para atualizar os dados estruturados.
   */
  @Post('nfe/:id/reprocess')
  async reprocessar(@Param('id') id: string) {
    return this.importService.reprocessar(id);
  }

  /**
   * GET /v1/fiscal/import/history
   * Lista notas ja importadas ou canceladas (historico).
   */
  @Get('history')
  async listarHistorico() {
    return this.importService.listarHistorico();
  }

  /**
   * DELETE /v1/fiscal/import/nfe/:id
   * Exclui uma nota fiscal do sistema e opcionalmente estorna os itens do estoque.
   */
  @Delete('nfe/:id')
  async excluirNota(
    @Param('id') id: string,
    @Query('revertStock') revertStock: string,
  ) {
    const shouldRevert = revertStock === 'true';
    return this.importService.excluirNota(id, shouldRevert);
  }
}
