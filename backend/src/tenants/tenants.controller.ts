import {
  Controller, Get, Post, Patch, Delete, Body, UseGuards, Param, Res,
  UnauthorizedException, ForbiddenException, Request, UseInterceptors,
  UploadedFile, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantsService } from './tenants.service';
import { ProvisionTenantDto } from './provision-tenant.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  private assertTenantAdmin(user: any, tenantId: string) {
    if (!user?.tenantId || user.type || user.station ||
      (user.role !== 'superadmin' && !(user.role === 'admin' && user.tenantId === tenantId))) {
      throw new ForbiddenException('Permissão negada para esta empresa.');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any) {
    if (req.user.role !== 'superadmin') {
      throw new ForbiddenException('Somente a administração da plataforma pode listar empresas SaaS.');
    }
    return this.tenantsService.findAll();
  }

  /** Lista tenants protegida por PIN — usada pelo sys-init sem JWT */
  @Get('setup/list')
  async listByPin(@Request() req: any) {
    const pin = (req.headers['x-setup-pin'] || req.query['pin']) as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.findAll();
  }

  /** Executa migração de banco de dados para os tenants selecionados (protegido por PIN) */
  @Post('setup/migrate')
  async migrateTenants(@Request() req: any, @Body() body: { tenantIds: string[]; includeHeart?: boolean }) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');

    const hasIds = body.tenantIds && Array.isArray(body.tenantIds) && body.tenantIds.length > 0;
    if (!hasIds && !body.includeHeart) {
      throw new BadRequestException('Nenhum banco selecionado para migração.');
    }

    return this.tenantsService.migrateTenants(body.tenantIds || [], body.includeHeart ?? false);
  }

  /**
   * Retorna dados completos do tenant do usuário logado (para tela de configurações)
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req: any) {
    return this.tenantsService.findById(req.user.tenantId);
  }

  /**
   * Atualiza dados textuais da empresa (dados, endereço, NFC-e config)
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req: any, @Body() body: any) {
    if (req.user.role !== 'admin') {
      throw new UnauthorizedException('Somente Gerentes podem alterar configurações da empresa.');
    }
    return this.tenantsService.updateTenant(req.user.tenantId, body);
  }

  /** Atualiza dados do tenant via sys-init (protegido por PIN) */
  @Patch('setup/:id')
  async updateTenantSetup(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.updateTenant(id, body);
  }

  /**
   * Atualiza dados textuais de qualquer empresa (para painel sys-init)
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateTenant(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    this.assertTenantAdmin(req.user, id);
    return this.tenantsService.updateTenant(id, body);
  }

  /**
   * Upload do certificado A1 (.pfx) — salvo como BLOB
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/certificado')
  @UseInterceptors(FileInterceptor('certPfx'))
  async uploadCertificado(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Permissão negada.');
    }
    if (!file) throw new BadRequestException('Arquivo .pfx não enviado.');
    if (!body.certSenha) throw new BadRequestException('Senha do certificado não informada.');

    return this.tenantsService.uploadCertificado(req.user.tenantId, file.buffer, body.certSenha);
  }

  /** Upload de logotipo para White Label via sys-init (protegido por PIN) */
  @Post('setup/:id/logo')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogoSetup(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    return this.tenantsService.uploadLogo(id, file);
  }

  /**
   * Upload de logotipo para White Label
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @Request() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertTenantAdmin(req.user, id);
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    return this.tenantsService.uploadLogo(id, file);
  }

  @Get('uploads/logos/:filename')
  async serveLogo(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const image = await this.tenantsService.getLogoImage(filename);
      if (image) {
        res.setHeader('Content-Type', image.mimeType);
        res.send(image.data);
        return;
      }
    } catch (e) {
      // Fallback para arquivo físico em caso de erro (ex: UUID inválido)
    }

    // Fallback: Busca arquivo físico (Logos antigos)
    const filePath = join(process.cwd(), 'uploads/logos', filename);
    if (!existsSync(filePath)) {
      res.status(404).send('Logo not found');
      return;
    }
    const file = createReadStream(filePath);
    file.pipe(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: any, @Body() body: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Somente superadmins podem criar empresas SaaS');
    }
    return this.tenantsService.create(body);
  }

  /** Endpoint público — protegido por PIN via variável de ambiente */
  @Post('setup')
  async setup(@Body() body: ProvisionTenantDto) {
    return this.tenantsService.provisionTenant(body);
  }

  @Post('setup/validate-pin')
  async validatePin(@Body() body: { pin: string }) {
    const valid = await this.tenantsService.validatePin(body.pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return { valid: true };
  }

  /**
   * Define ou atualiza o PIN de desconto do PDV (apenas admins)
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/discount-pin')
  async setDiscountPin(@Request() req: any, @Body() body: { pin: string }) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Apenas admins podem configurar o PIN de desconto.');
    }
    if (!body.pin || body.pin.length < 4) {
      throw new BadRequestException('O PIN deve ter no mínimo 4 caracteres.');
    }
    return this.tenantsService.setDiscountPin(req.user.tenantId, body.pin);
  }

  /**
   * Verifica se o PIN de desconto informado é válido (usado pelo PDV)
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/verify-discount-pin')
  async verifyDiscountPin(@Request() req: any, @Body() body: { pin: string }) {
    const valid = await this.tenantsService.verifyDiscountPin(req.user.tenantId, body.pin);
    if (!valid) throw new UnauthorizedException('PIN de desconto inválido.');
    return { valid: true };
  }

  /**
   * Define ou atualiza o PIN do Caixa para liberação de auditoria (apenas admins)
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/cashier-pin')
  async setCashierPin(@Request() req: any, @Body() body: { pin: string }) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Apenas admins podem configurar o PIN do Caixa.');
    }
    if (!body.pin || body.pin.length < 4) {
      throw new BadRequestException('O PIN deve ter no mínimo 4 caracteres.');
    }
    return this.tenantsService.setCashierPin(req.user.tenantId, body.pin);
  }

  /**
   * Verifica se o PIN do Caixa informado é válido (usado para desbloquear valores no PDV)
   */
  @UseGuards(JwtAuthGuard)
  @Post('me/verify-cashier-pin')
  async verifyCashierPin(@Request() req: any, @Body() body: { pin: string; registerId: string }) {
    if (!body.registerId || typeof body.registerId !== 'string' || !body.registerId.trim()) {
      throw new BadRequestException('registerId é obrigatório para validação de PIN do Caixa.');
    }

    const result = await this.tenantsService.verifyCashierPin(req.user.tenantId, body.pin);
    if (!result.authorized) {
      throw new ForbiddenException('PIN do Caixa incorreto.');
    }

    const pinAuthToken = this.jwtService.sign(
      {
        type: 'pin_auth',
        authType: result.authType,
        managerOpId: result.managerOpId,
        managerName: result.managerName,
        registerId: body.registerId,
        tenantId: req.user.tenantId,
      },
      { expiresIn: '30m' }
    );

    return { valid: true, pinAuthToken };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteTenant(@Request() req: any, @Param('id') id: string) {
    this.assertTenantAdmin(req.user, id);
    return this.tenantsService.deleteTenant(id);
  }

  /** Exclui tenant via sys-init (protegido por PIN) */
  @Delete('setup/:id')
  async deleteTenantSetup(@Request() req: any, @Param('id') id: string) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.deleteTenant(id);
  }

  // --- CONTROLE DE USUÁRIOS (SYS-INIT) ---
  @Get('setup/:id/users')
  async getTenantUsers(@Request() req: any, @Param('id') id: string) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');

    return this.tenantsService.getTenantUsers(id);
  }

  @Post('setup/:id/users')
  async createTenantUser(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name: string; email: string; password: string; role: string }
  ) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');

    if (!body.name || !body.email || !body.password || !body.role) {
      throw new BadRequestException('Nome, email, senha e perfil são obrigatórios.');
    }
    return this.tenantsService.createTenantUser(id, body);
  }

  @Patch('setup/:id/users/:userId/password')
  async resetUserPassword(@Request() req: any, @Param('id') id: string, @Param('userId') userId: string, @Body() body: { password: string }) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    
    if (!body.password) throw new BadRequestException('A nova senha é obrigatória.');
    return this.tenantsService.resetUserPassword(id, userId, body.password);
  }

  @Patch('setup/:id/users/:userId/pin')
  async resetUserPin(@Request() req: any, @Param('id') id: string, @Param('userId') userId: string, @Body() body: { pin: string }) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    
    if (!body.pin) throw new BadRequestException('O novo PIN é obrigatório.');
    return this.tenantsService.resetUserPin(id, userId, body.pin);
  }

  /** Registra pagamento de mensalidade via sys-init (protegido por PIN) */
  @Post('setup/:id/registrar-pagamento')
  async registrarPagamentoSetup(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.registrarPagamento(id, body?.observacao);
  }

  /** Retorna histórico de pagamentos do tenant via sys-init (protegido por PIN) */
  @Get('setup/:id/payment-history')
  async getPaymentHistory(@Request() req: any, @Param('id') id: string) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.getPaymentHistory(id);
  }

  @Get('setup/:id/categories')
  async getTenantCategories(@Request() req: any, @Param('id') id: string) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN inválido.');
    return this.tenantsService.getTenantCategories(id);
  }

  /** Executa query SQL diretamente em qualquer banco (protegido por PIN do sys-init + PIN exclusivo SQL) */
  @Post('setup/sql')
  async executeSql(
    @Request() req: any,
    @Body() body: { sql: string; tenantId?: string; useHeart?: boolean }
  ) {
    const pin = req.headers['x-setup-pin'] as string;
    const valid = await this.tenantsService.validatePin(pin);
    if (!valid) throw new UnauthorizedException('PIN do sys-init inválido.');

    const sqlPin = req.headers['x-sql-pin'] as string;
    const expectedSqlPin = process.env.SQL_PIN || '43619835';
    if (sqlPin !== expectedSqlPin) throw new UnauthorizedException('PIN do SQL editor inválido.');

    if (!body.sql?.trim()) throw new BadRequestException('Query SQL vazia.');

    return this.tenantsService.executeSqlQuery(body.sql, body.tenantId, body.useHeart);
  }

  @Post('trigger-sync')
  async triggerSync() {
    return this.tenantsService.syncMasterCatalogFromTenants();
  }
}
