import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post('auto-from-low-stock')
  createAutoFromLowStock(@Body() body: { items: { productId: string; supplierId: string; quantity: number; expectedCost: number }[] }) {
    return this.purchaseOrdersService.createOrdersFromLowStock(body.items);
  }

  @Post()
  createPurchaseOrder(@Request() req: any, @Body() body: { supplierId: string; items: any[] }) {
    return this.purchaseOrdersService.createPurchaseOrder(body.supplierId, body.items);
  }

  @Post('packagings')
  createPackaging(@Request() req: any, @Body() body: { name: string; multiplier: number }) {
    return this.purchaseOrdersService.createPackaging(body.name, body.multiplier);
  }

  @Get('packagings/all')
  getPackagings(@Request() req: any) {
    return this.purchaseOrdersService.getPackagings();
  }

  @Delete('packagings/:packagingId')
  deletePackaging(@Request() req: any, @Param('packagingId') packagingId: string) {
    return this.purchaseOrdersService.deletePackaging(packagingId);
  }

  @Get()
  getPurchaseOrders(@Request() req: any) {
    return this.purchaseOrdersService.getPurchaseOrders();
  }

  @Get(':id')
  getPurchaseOrderById(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.getPurchaseOrderById(id);
  }

  @Patch(':id/status')
  updateStatus(@Request() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    return this.purchaseOrdersService.updateStatus(id, body.status);
  }

  @Post(':id/receive')
  receivePurchaseOrder(@Request() req: any, @Param('id') id: string, @Body() body: { items: any[] }) {
    return this.purchaseOrdersService.receivePurchaseOrder(id, body.items);
  }

  @Delete(':id')
  deletePurchaseOrder(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.deletePurchaseOrder(id);
  }

  @Patch(':id/items/:itemId')
  updateItemQuantity(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { quantity: number }) {
    return this.purchaseOrdersService.updateItemQuantity(id, itemId, body.quantity);
  }

  @Delete(':id/items/:itemId')
  deleteOrderItem(@Request() req: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.purchaseOrdersService.deleteOrderItem(id, itemId);
  }
}
