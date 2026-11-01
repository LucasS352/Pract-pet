import { Controller, Get, Post, Delete, Body, Param, UseGuards, Patch, Query, UseInterceptors, UploadedFile, UploadedFiles, Request, BadRequestException } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ProductsService, TenantSettingsDto } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BULK_IMAGE_MAX_BYTES, BULK_IMAGE_MAX_FILES } from './bulk-images.helper';
import { IMAGE_INPUT_BYTES } from '../images/product-image.optimizer';
import { ImageUploadAdmissionInterceptor } from '../images/image-upload.interceptor';

interface AuthUser {
  tenantId: string;
  databaseUrl: string;
  id: string;
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('status') status?: string,
  ) {
    return this.productsService.findAll(
      Number(page || 1), 
      Number(limit || 50),
      search,
      includeInactive === 'true' || status === 'all' || status === 'inactive',
      status,
    );
  }

  @Get('lookup/:barcode')
  lookupBarcode(@Param('barcode') barcode: string) {
    return this.productsService.lookupBarcode(barcode);
  }

  @Get('global-catalog')
  searchGlobalCatalog(@Query('q') query: string) {
    return this.productsService.searchGlobalCatalog(query);
  }

  @Post('sync-catalog-manual')
  async syncCatalogManual() {
    // This requires injecting TenantsService or doing it differently.
    // Wait, ProductsService doesn't have syncMasterCatalogFromTenants, TenantsService does!
    return { error: 'wrong service' };
  }

  @Post()
  create(@Body() body: any) {
    return this.productsService.create(body);
  }

  @Post('upload')
  @UseInterceptors(ImageUploadAdmissionInterceptor, FileInterceptor('file', {
    limits: { fileSize: IMAGE_INPUT_BYTES, files: 1, fields: 0 },
  }))
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    return this.productsService.uploadPhoto(req.user.tenantId, file);
  }

  @Post('bulk-images')
  @UseInterceptors(ImageUploadAdmissionInterceptor, FilesInterceptor('files', BULK_IMAGE_MAX_FILES, {
    limits: { fileSize: BULK_IMAGE_MAX_BYTES, files: BULK_IMAGE_MAX_FILES, fields: 1, fieldSize: 16 * 1024 },
  }))
  async bulkImageUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
    @Body('manifest') manifest?: string,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.productsService.bulkImageUpload(req.user.tenantId, files, manifest);
  }

  @Post('bulk')
  bulkEntry(@Body('items') items: any[]) {
    return this.productsService.bulkEntry(items);
  }

  @Post('add-stock/:id')
  addStock(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Body('costPrice') costPrice?: number,
    @Body('reason') reason?: string,
    @Body('lotNumber') lotNumber?: string,
    @Body('expiresAt') expiresAt?: string,
    @Body('supplierId') supplierId?: string,
  ) {
    return this.productsService.addStock(
      id,
      Number(quantity),
      costPrice !== undefined ? Number(costPrice) : undefined,
      reason,
      lotNumber,
      expiresAt,
      supplierId,
    );
  }

  @Post('lots/register-existing/:id')
  registerExistingLot(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @Body('costPrice') costPrice?: number,
    @Body('lotNumber') lotNumber?: string,
    @Body('expiresAt') expiresAt?: string,
  ) {
    return this.productsService.registerExistingLot(
      id,
      Number(quantity),
      costPrice !== undefined ? Number(costPrice) : undefined,
      lotNumber,
      expiresAt,
    );
  }

  @Patch('lots/:id')
  updateLot(@Param('id') lotId: string, @Body() data: { expiresAt?: Date | null, lotNumber?: string }) {
    return this.productsService.updateLot(lotId, data);
  }

  @Post('lots/:id/split')
  splitLot(
    @Param('id') lotId: string, 
    @Body('splitQty') splitQty: number, 
    @Body('newExpiresAt') newExpiresAt?: Date, 
    @Body('newLotNumber') newLotNumber?: string
  ) {
    return this.productsService.splitLot(lotId, Number(splitQty), newExpiresAt, newLotNumber);
  }

  /** Lê configurações globais do tenant (ex: allowNegativeStock) */
  @Get('settings')
  getSettings(): Promise<TenantSettingsDto> {
    return this.productsService.getSettings();
  }

  /** Salva configurações globais do tenant */
  @Patch('settings')
  saveSettings(@Body() body: TenantSettingsDto): Promise<TenantSettingsDto> {
    return this.productsService.saveSettings(body);
  }

  @Get(':id/composition')
  getComposition(@Param('id') id: string) {
    return this.productsService.getComposition(id);
  }

  /** Lotes com validade próxima (padrão: próximos 30 dias) */
  @Get('lots/expiring')
  getExpiringLots(@Query('days') days?: number) {
    return this.productsService.getExpiringLots(days ? Number(days) : 30);
  }

  /** Lotes já vencidos com estoque restante */
  @Get('lots/expired')
  getExpiredLots() {
    return this.productsService.getExpiredLots();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.productsService.update(id, body);
  }

  @Get(':id/lots')
  getProductLots(@Param('id') id: string) {
    return this.productsService.getProductLots(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  /** Exporta lista de produtos para contagem de inventário */
  @Get('inventory/export')
  inventoryExport(
    @Query('categoryIds') categoryIds?: string,
    @Query('productIds') productIds?: string,
  ) {
    return this.productsService.inventoryExport({
      categoryIds: categoryIds ? categoryIds.split(',').filter(Boolean) : undefined,
      productIds: productIds ? productIds.split(',').filter(Boolean) : undefined,
    });
  }

  /** Importa resultado da contagem física e atualiza o estoque */
  @Post('inventory/import')
  inventoryImport(@Body('items') items: { productId: string; newStock: number }[]) {
    return this.productsService.inventoryImport(items);
  }

  /** Retorna histórico de contagens físicas agrupado por sessão */
  @Get('inventory/history')
  inventoryHistory() {
    return this.productsService.inventoryHistory();
  }
}
