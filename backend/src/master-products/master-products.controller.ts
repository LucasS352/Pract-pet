import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MasterProductsService } from './master-products.service';

/**
 * MasterProductsController
 *
 * GET /api/master-products/lookup/:ean
 *   → Busca no cache local, depois na Cosmos API (com token do tenant).
 *   → Nunca retorna 404. Usa { found: false } para EANs desconhecidos.
 *
 * GET /api/master-products/count
 *   → Estatísticas da base mestre para diagnóstico.
 */
@UseGuards(JwtAuthGuard)
@Controller('master-products')
export class MasterProductsController {
  constructor(private readonly masterProductsService: MasterProductsService) {}

  @Get('lookup/:ean')
  lookupByEan(@Param('ean') ean: string, @Request() req: any) {
    // Passa o tenantId para que o service possa buscar o token Cosmos do cliente
    const tenantId = req.user?.tenantId;
    return this.masterProductsService.lookupByEan(ean, tenantId);
  }

  @Get('count')
  getCount() {
    return this.masterProductsService.getCount();
  }
}
