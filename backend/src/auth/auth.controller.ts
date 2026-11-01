import { Controller, Post, Get, Delete, Param, Body, UnauthorizedException, UseGuards } from '@nestjs/common';
import { StationAccessService } from './station-access.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService, private access: StationAccessService) {}

  @Post('station-login')
  stationLogin(@Body() body: { token: string }) { return this.access.exchange(body.token); }

  @UseGuards(JwtAuthGuard)
  @Get('access/config')
  accessConfig(@CurrentUser() user: any) { return this.access.config(user.tenantId); }

  @UseGuards(JwtAuthGuard)
  @Get('access/links')
  accessLinks(@CurrentUser() user: any) { return this.access.list(user); }

  @UseGuards(JwtAuthGuard)
  @Post('access/links')
  createLink(@CurrentUser() user: any, @Body() body: { station: string }) { return this.access.create(user, body.station); }

  @UseGuards(JwtAuthGuard)
  @Delete('access/links/:id')
  revokeLink(@CurrentUser() user: any, @Param('id') id: string) { return this.access.revoke(user, id); }

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('operator-login')
  async operatorLogin(@CurrentUser() user: any, @Body() body: { operatorId: string, pin: string, context?: string }) {
    const context = user.station === 'WAITER' ? 'waiter' : body.context || 'cashier';
    await this.access.assertOperator(user.tenantId, body.operatorId, context);
    return this.authService.validateOperatorPin(user.tenantId, body.operatorId, body.pin, context);
  }

  @UseGuards(JwtAuthGuard)
  @Post('accept-terms')
  async acceptTerms(@CurrentUser() user: any) {
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      throw new UnauthorizedException('Apenas administradores podem aceitar os termos.');
    }
    return this.authService.acceptTerms(user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tenant-status')
  async getTenantStatus(@CurrentUser() user: any) {
    return this.authService.getTenantStatus(user.tenantId);
  }
}
