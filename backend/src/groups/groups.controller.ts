import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Headers,
  UnauthorizedException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  private checkPin(pin: string | undefined): void {
    if (!pin || pin !== process.env.SETUP_PIN) {
      throw new UnauthorizedException('PIN inválido');
    }
  }

  // ── Group CRUD ────────────────────────────────────────────────────────────

  @Get('setup/list')
  async listGroups(@Headers('x-setup-pin') pin: string) {
    this.checkPin(pin);
    return this.groupsService.listGroups();
  }

  @Post('setup/create')
  async createGroup(
    @Headers('x-setup-pin') pin: string,
    @Body() body: { name: string },
  ) {
    this.checkPin(pin);
    return this.groupsService.createGroup(body.name);
  }

  @Delete('setup/:id')
  async deleteGroup(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.deleteGroup(id);
  }

  // ── Members ───────────────────────────────────────────────────────────────

  @Post('setup/:id/members')
  async addMember(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { tenantId: string; alias?: string },
  ) {
    this.checkPin(pin);
    return this.groupsService.addMember(id, body.tenantId, body.alias);
  }

  @Delete('setup/:id/members/:tenantId')
  async removeMember(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Param('tenantId') tenantId: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.removeMember(id, tenantId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('setup/:id/dashboard')
  async dashboard(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.getDashboard(id, startDate, endDate);
  }

  // ── Stock ─────────────────────────────────────────────────────────────────

  @Get('setup/:id/stock')
  async consolidatedStock(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.getConsolidatedStock(id);
  }

  @Post('setup/:id/stock-entry')
  async stockEntry(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { tenantId: string; productId: string; quantity: number; costPrice?: number },
  ) {
    this.checkPin(pin);
    return this.groupsService.stockEntry(id, body);
  }

  @Post('setup/:id/stock-transfer')
  async stockTransfer(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { fromTenantId: string; toTenantId: string; productId: string; quantity: number },
  ) {
    this.checkPin(pin);
    return this.groupsService.stockTransfer(id, body);
  }

  // ── Products ──────────────────────────────────────────────────────────────

  @Get('setup/:id/products')
  async getProducts(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.getGroupProducts(id);
  }

  @Post('setup/:id/products')
  async createProductAllTenants(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { name: string; priceSell: number; priceCost: number; unit: string; categoryName: string },
  ) {
    this.checkPin(pin);
    return this.groupsService.createProductAllTenants(id, body);
  }

  @Patch('setup/:id/products/price')
  async updatePriceAllTenants(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { productName: string; priceSell: number },
  ) {
    this.checkPin(pin);
    return this.groupsService.updatePriceAllTenants(id, body);
  }

  // ── Group Owner User Management (sys-init) ───────────────────────────────

  @Post('setup/:id/users')
  async createGroupOwner(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Body() body: { name: string; email: string; password: string },
  ) {
    this.checkPin(pin);
    return this.groupsService.createGroupOwnerUser(id, body);
  }

  @Get('setup/:id/users')
  async getGroupUsers(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.getGroupUsers(id);
  }

  @Delete('setup/:id/users/:userId')
  async deleteGroupUser(
    @Headers('x-setup-pin') pin: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    this.checkPin(pin);
    return this.groupsService.deleteGroupUser(id, userId);
  }

  // ── JWT-protected endpoints (group_owner login) ──────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('my/dashboard')
  async myDashboard(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getDashboard(req.user.groupId, startDate, endDate);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/stock')
  async myStock(@Request() req: any) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getConsolidatedStock(req.user.groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/stock-entry')
  async myStockEntry(
    @Request() req: any,
    @Body() body: { tenantId: string; productId: string; quantity: number; costPrice?: number },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.stockEntry(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/stock-transfers')
  async myRecentTransfers(@Request() req: any) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getRecentTransfers(req.user.groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/stock-transfer')
  async myStockTransfer(
    @Request() req: any,
    @Body() body: { fromTenantId: string; toTenantId: string; productId: string; quantity: number },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.stockTransfer(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/products')
  async myProducts(@Request() req: any) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getGroupProducts(req.user.groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/products')
  async myCreateProduct(
    @Request() req: any,
    @Body() body: { name: string; priceSell: number; priceCost: number; unit: string; categoryName: string },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.createProductAllTenants(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('my/products/price')
  async myUpdatePrice(
    @Request() req: any,
    @Body() body: { productName: string; priceSell: number },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.updatePriceAllTenants(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/purchase-forecast')
  async myPurchaseForecast(
    @Request() req: any,
    @Query('daysToForecast') daysToForecast?: string,
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    const days = daysToForecast ? Number(daysToForecast) : 15;
    return this.groupsService.getPurchaseForecast(req.user.groupId, days);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/tenant-detail/:tenantId')
  async myTenantDetail(
    @Request() req: any,
    @Param('tenantId') tenantId: string,
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getTenantDetail(req.user.groupId, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/stock-adjust')
  async myStockAdjust(
    @Request() req: any,
    @Body() body: { tenantId: string; productId: string; newStock: number; expectedStock?: number },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.stockAdjust(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/products-catalog')
  async myProductsCatalog(@Request() req: any) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getProductsCatalog(req.user.groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('my/products/price-per-tenant')
  async myUpdatePricePerTenant(
    @Request() req: any,
    @Body() body: { productName: string; updates: { tenantId: string; productId?: string; priceSell: number; priceCost?: number }[] },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.updatePricePerTenant(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/products/create-in-tenants')
  async myCreateProductInTenants(
    @Request() req: any,
    @Body() body: any,
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.createProductInTenants(req.user.groupId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/products/sync-status')
  async mySyncStatus(@Request() req: any) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.getSyncStatus(req.user.groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/products/sync')
  async mySyncProducts(
    @Request() req: any,
    @Body() body: { products: { name: string; targetTenantIds: string[]; sourceTenantId?: string; sourceProductId?: string }[] },
  ) {
    if (!req.user.groupId) throw new UnauthorizedException('Usuário não pertence a nenhum grupo');
    return this.groupsService.syncProductsToTenants(req.user.groupId, body);
  }
}
