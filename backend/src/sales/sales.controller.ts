import { Controller, Post, Put, Get, Body, UseGuards, Request, Param, NotFoundException, BadRequestException, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('checkout-capabilities')
  checkoutCapabilities() {
    return this.salesService.checkoutCapabilities();
  }

  @Post('checkout')
  checkout(@Body() body: any) {
    return this.salesService.checkout(body);
  }

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.salesService.findAll(
      Number(page || 1), 
      Number(limit || 50),
      startDate,
      endDate,
    );
  }

  @Get('today')
  getTodaySales(
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.salesService.getTodaySales(
      Number(page || 1), 
      Number(limit || 50)
    );
  }

  /** Resumo e estatísticas fiscais de NFC-e */
  @Get('fiscal/summary')
  getFiscalSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.salesService.getFiscalSummary(startDate, endDate);
  }

  /** Histórico e listagem de vendas fiscais com filtros */
  @Get('fiscal/list')
  getFiscalSales(
    @Query() query: any,
  ) {
    return this.salesService.getFiscalSales(query);
  }

  /** Polling de status NFC-e — chamado pelo frontend a cada 2s */
  @Get(':id/nfce-status')
  getNfceStatus(@Param('id') id: string) {
    return this.salesService.getNfceStatus(id);
  }

  /** Solicitar emissão manual de NFC-e para uma venda já existente */
  @Post(':id/emit-nfce')
  emitNfce(@Param('id') id: string, @Body() body?: { forceNewNumber?: boolean, manualNumber?: number }) {
    const forceNewNumber = body?.forceNewNumber === true;
    return this.salesService.emitNfce(id, forceNewNumber, body?.manualNumber);
  }

  /** Exportar XMLs em lote para contabilidade */
  @Get('export/xmls')
  async exportXmls(@Query('startDate') startDate: string, @Query('endDate') endDate: string, @Res() res: Response) {
    if (!startDate || !endDate) {
      throw new BadRequestException('As datas inicial e final são obrigatórias.');
    }
    const stream = await this.salesService.exportNfceXmls(startDate, endDate);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="xmls_${startDate}_a_${endDate}.zip"`,
    });
    stream.getStream().pipe(res);
  }

  /** Exportar XMLs em lote e enviar diretamente por e-mail */
  @Post('export/xmls/send-email')
  async exportXmlsAndSendEmail(
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
    @Body('email') email?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('As datas inicial e final são obrigatórias.');
    }
    return this.salesService.exportNfceXmlsAndSendEmail(startDate, endDate, email);
  }

  @Post(':id/cancel')
  async cancelSale(
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('O motivo do cancelamento é obrigatório.');
    }
    return this.salesService.cancel(id, reason);
  }

  @Put(':id/payments')
  async updatePayments(
    @Param('id') id: string,
    @Body('payments') payments: { method: string; value: number; tPag?: string }[]
  ) {
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      throw new BadRequestException('Nenhum pagamento informado.');
    }
    return this.salesService.updatePayments(id, payments);
  }
}
