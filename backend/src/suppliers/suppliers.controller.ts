import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  createSupplier(@Request() req: any, @Body() body: any) {
    return this.suppliersService.createSupplier(body);
  }

  @Get()
  getSuppliers(@Request() req: any) {
    return this.suppliersService.getSuppliers();
  }

  @Get(':id')
  getSupplierById(@Request() req: any, @Param('id') id: string) {
    return this.suppliersService.getSupplierById(id);
  }

  @Patch(':id')
  updateSupplier(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.suppliersService.updateSupplier(id, body);
  }

  @Delete(':id')
  deleteSupplier(@Request() req: any, @Param('id') id: string) {
    return this.suppliersService.deleteSupplier(id);
  }

  // --- Supplier Catalog ---

  @Post(':id/products')
  addSupplierProduct(
    @Request() req: any,
    @Param('id') supplierId: string,
    @Body() body: { productId: string; expectedCost?: number }
  ) {
    return this.suppliersService.addSupplierProduct(supplierId, body.productId, body.expectedCost);
  }

  @Delete(':id/products/:productId')
  removeSupplierProduct(
    @Request() req: any,
    @Param('id') supplierId: string,
    @Param('productId') productId: string
  ) {
    return this.suppliersService.removeSupplierProduct(supplierId, productId);
  }
}
