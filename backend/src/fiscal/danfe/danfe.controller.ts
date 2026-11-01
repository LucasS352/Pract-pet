import { Controller, Post, Get, Param, Body, UseGuards, Request, Res, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DanfeService } from './danfe.service';
import { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('v1/fiscal/nfce')
export class DanfeController {
  constructor(private readonly danfeService: DanfeService) {}

  @Post(':saleId/cancelar')
  async cancelarNfce(
    @Param('saleId') saleId: string,
    @Body('motivo') motivo: string,
    @Request() req: any,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.danfeService.cancelarNfce(saleId, motivo || 'Cancelamento solicitado pelo emitente', userId);
  }

  @Get(':saleId/status')
  async consultarStatus(
    @Param('saleId') saleId: string,
    @Request() req: any,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.danfeService.consultarStatus(saleId, userId);
  }

  @Get(':saleId/danfe')
  async gerarDanfe(
    @Param('saleId') saleId: string,
    @Res() res: Response,
  ) {
    try {
      const pdfBase64 = await this.danfeService.gerarDanfe(saleId);
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=danfe_${saleId}.pdf`,
        'Content-Length': pdfBuffer.length,
      });

      res.end(pdfBuffer);
    } catch (error: any) {
      res.status(HttpStatus.BAD_GATEWAY).json({ message: error.message });
    }
  }
}
