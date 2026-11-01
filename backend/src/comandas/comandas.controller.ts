import { Controller, Get, Post, Body, Param, Query, Request, UseGuards, Headers } from '@nestjs/common';
import { ComandasService } from './comandas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { validateComandaItemKey } from './comanda-item-idempotency';

@Controller('v1/comandas')
@UseGuards(JwtAuthGuard)
export class ComandasController {
  constructor(private readonly comandasService: ComandasService) {}

  @Get()
  async findAll(@Query('status') status?: string) {
    return this.comandasService.findAll(status || 'open');
  }

  @Post()
  async create(
    @Body()
    body: {
      number: string;
      customerName?: string;
      notes?: string;
      responsibleWaiterId?: string;
      waiterId?: string;
    },
  ) {
    return this.comandasService.create(body);
  }

  @Get('assets/:productId')
  availableAssets(@Param('productId') productId: string) { return this.comandasService.availableAssets(productId); }

  @Get('service-rounds')
  serviceRounds() { return this.comandasService.serviceRounds(); }

  @Post(':id/items/:itemId/timer/snooze')
  snooze(@Param('id') id: string, @Param('itemId') itemId: string,
    @Body() body: { extraMinutes: number; expectedDueAt: string }) {
    return this.comandasService.snoozeTimer(id, itemId, body.extraMinutes, body.expectedDueAt);
  }

  @Post(':id/items/:itemId/return-asset')
  returnAsset(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.comandasService.returnAsset(id, itemId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.comandasService.findOne(id);
  }

  @Post(':id/items')
  async addItems(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body()
    body: {
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice?: number;
        notes?: string;
        createdById?: string;
        serveImmediately?: boolean;
        assetNumber?: number;
        modifiers?: Array<{ optionId: string }>;
      }>;
    },
  ) {
    return this.comandasService.addItems(id, body.items, validateComandaItemKey(idempotencyKey));
  }

  @Post(':id/authorize')
  async authorizeAction(@Request() req: any, @Param('id') id: string, @Body() body: { action: string; itemId?: string; pin: string }) {
    return this.comandasService.authorizeAction(id, body, this.actor(req));
  }

  @Post(':id/items/:itemId/remove')
  async removeItem(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { authorizationToken: string; reason: string; quantity?: number; expectedQuantity?: number }) {
    return this.comandasService.removeItem(id, itemId, body.authorizationToken, body.reason, this.actor(req), body.quantity, body.expectedQuantity);
  }

  @Post(':id/request-payment')
  async requestPayment(@Param('id') id: string) {
    return this.comandasService.requestPayment(id);
  }

  @Post(':id/reopen')
  async reopen(@Param('id') id: string) {
    return this.comandasService.reopen(id);
  }

  @Post(':id/close')
  async closeComanda(@Param('id') id: string, @Body() body: { saleId?: string }) {
    return this.comandasService.closeComanda(id, body.saleId);
  }

  @Post(':id/cancel')
  async cancelComanda(@Request() req: any, @Param('id') id: string, @Body() body: { authorizationToken: string; reason: string }) {
    return this.comandasService.cancelComanda(id, body.authorizationToken, body.reason, this.actor(req));
  }

  private actor(req: any) {
    return req.comandaActor || { userId: req.user?.sub, name: req.user?.email || 'Usuário autenticado' };
  }
}

