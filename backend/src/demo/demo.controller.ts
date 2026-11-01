import { Controller, Post, Get, Body, UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DemoService } from './demo.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

class RegisterDemoDto {
  name: string;
  whatsapp: string;
}

@Controller('demo')
export class DemoController {
  constructor(
    private readonly demoService: DemoService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterDemoDto) {
    if (!body.name || !body.whatsapp) {
      throw new UnauthorizedException('Nome e WhatsApp são obrigatórios');
    }

    const lead = await this.demoService.registerLead(body.name, body.whatsapp);
    const DEMO_TENANT_ID = 'demo-tenant-001';

    const payload = {
      sub: lead.id,
      email: `demo_${lead.id}@demo.teltech.com.br`,
      tenantId: DEMO_TENANT_ID,
      role: 'admin',
      groupId: null,
    };

    // Garante que o operador e caixa demo estejam prontos
    const demoSetup = await this.demoService.ensureDemoOperatorAndRegister();

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: lead.id,
        name: lead.name,
        role: 'admin',
        tenant: 'Adega Modelo',
        termsAccepted: true,
      },
      operator: demoSetup.operator,
      cashRegister: demoSetup.cashRegister,
      expiresIn: 86400,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getDemoStatus(@CurrentUser() user: any) {
    return this.demoService.getDemoStatus(user);
  }
}
