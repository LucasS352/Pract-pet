import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TributacaoService } from './tributacao.service';

@UseGuards(JwtAuthGuard)
@Controller('tributacao')
export class TributacaoController {
  constructor(private service: TributacaoService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user.tenantId);
  }

  /**
   * GET /v1/tributacao/suggest?q=brahma
   * Sugere um grupo tributário com base no nome/barcode do produto.
   * Usado pelo frontend ao cadastrar produto para sugestão automática.
   */
  @Get('suggest')
  suggest(@Query('q') q: string, @Request() req: any) {
    return this.service.suggest(req.user.tenantId, q || '');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create(req.user.tenantId, body);
  }

  /**
   * POST /v1/tributacao/seed-defaults
   * Cria os grupos tributários padrão no banco do tenant atual via upsert.
   * Seguro para chamar em tenants existentes — não duplica nem sobrescreve customizações.
   * Acionado pelo botão "Restaurar Padrões" no frontend.
   */
  @Post('seed-defaults')
  seedDefaults(@Request() req: any) {
    return this.service.seedDefaultGrupos(req.user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.update(req.user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(req.user.tenantId, id);
  }
}
