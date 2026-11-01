import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentMethodsService } from './payment-methods.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, { emitirNfce: boolean }>) {
    return this.service.updateSettings(body);
  }

  @Post()
  create(@Body() body: { name: string; tPag?: string; hasVariablePricing?: boolean; emitirNfce?: boolean }) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; tPag?: string; active?: boolean; hasVariablePricing?: boolean; emitirNfce?: boolean }) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/prices')
  getPrices(@Param('id') id: string) {
    return this.service.getPrices(id);
  }

  @Put(':id/prices')
  upsertPrices(@Param('id') id: string, @Body() body: { prices: { productId: string; price: number }[] }) {
    return this.service.upsertPrices(id, body.prices);
  }
}
