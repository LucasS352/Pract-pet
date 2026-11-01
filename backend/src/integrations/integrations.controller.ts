import { Controller, Post, Body, Param, Request, UnauthorizedException, Get } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { TenantsService } from '../tenants/tenants.service';
import { IfoodService } from './ifood/ifood.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly tenantsService: TenantsService,
    private readonly ifoodService: IfoodService,
  ) {}

  @Post('setup/:tenantId')
  async setupIntegration(
    @Request() req: any,
    @Param('tenantId') tenantId: string,
    @Body() body: { provider: string; credentials: any; settings: any }
  ) {
    const pin = req.headers['x-setup-pin'] as string;
    if (!pin) throw new UnauthorizedException('PIN não fornecido');
    
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');

    return this.integrationsService.upsertIntegration(tenantId, body.provider, body.credentials, body.settings);
  }

  @Post('ifood/sync-catalog/:tenantId')
  async syncCatalog(
    @Request() req: any,
    @Param('tenantId') tenantId: string,
  ) {
    const pin = req.headers['x-setup-pin'] as string;
    if (!pin) throw new UnauthorizedException('PIN não fornecido');
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');

    return this.integrationsService.syncIfoodCatalog(tenantId);
  }
}
