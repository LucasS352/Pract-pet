import { Injectable, UnauthorizedException } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { StationAccessService } from './station-access.service';

@Injectable()
export class AuthService {
  constructor(
    private heartPrisma: HeartPrismaService,
    private jwtService: JwtService,
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService,
    private access: StationAccessService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.heartPrisma.user.findUnique({
      where: { email },
      include: { tenant: true, group: { include: { members: { include: { tenant: { select: { id: true, databaseUrl: true } } } } } } },
    });

    if (user && await bcrypt.compare(pass, user.password)) {
      if (!user.active) {
        throw new UnauthorizedException('Sua conta foi inativada pelo administrador.');
      }
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async validateOperatorPin(tenantId: string, operatorId: string, pin: string, context = 'cashier'): Promise<any> {
    const { databaseUrl } = this.tenantContext.get();
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    const operator = await prisma.operator.findFirst({
      where: { id: operatorId, active: true },
    });

    if (!operator || !operator.pin) {
      throw new UnauthorizedException('Operador inválido ou PIN não configurado.');
    }

    if (await bcrypt.compare(pin, operator.pin)) {
      const operatorToken = context === 'waiter' ? this.access.signWaiterSession(tenantId, operator as { id: string; pin: string }) : this.jwtService.sign(
        {
          type: 'op',
          opId: operator.id,
          tenantId,
          context,
        },
        { expiresIn: '30m' }
      );

      return {
        id: operator.id,
        name: operator.name,
        role: 'operator',
        isManager: Boolean(operator.isManager),
        jobTitle: operator.jobTitle ?? null,
        operatorToken,
      };
    }
    throw new UnauthorizedException('PIN incorreto.');
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenant.id,
      role: user.role,
      groupId: user.groupId ?? null,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        groupId: user.groupId ?? null,
        tenant: user.tenant.name,
        modules: user.tenant.modulos ?? {},
        termsAccepted: !!user.tenant.termsAcceptedAt
      }
    };
  }

  async acceptTerms(tenantId: string) {
    await this.heartPrisma.tenant.update({
      where: { id: tenantId },
      data: { termsAcceptedAt: new Date() }
    });
    return { success: true };
  }

  async getTenantStatus(tenantId: string) {
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        status: true,
        mensalidadeVencimento: true,
        mensalidadeValor: true,
        name: true,
      },
    });

    if (!tenant) return { status: 'unknown', diasAtraso: 0, vencimento: null };

    const { mensalidadeVencimento, status, mensalidadeValor, name } = tenant;

    if (!mensalidadeVencimento) {
      return { status, diasAtraso: 0, vencimento: null, valor: mensalidadeValor, nome: name };
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(mensalidadeVencimento);
    venc.setHours(0, 0, 0, 0);

    const diffMs = hoje.getTime() - venc.getTime();
    const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return {
      status,
      diasAtraso,         // negativo = dias até vencer | 0 = vence hoje | positivo = dias em atraso
      vencimento: mensalidadeVencimento,
      valor: mensalidadeValor,
      nome: name,
    };
  }
}
