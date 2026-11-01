import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';

@Injectable()
export class PetshopAccessGuard implements CanActivate {
  constructor(private readonly heart: HeartPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;
    if (!tenantId || request.user?.role === 'station') {
      throw new ForbiddenException('Acesso ao Pet Shop não permitido.');
    }

    const tenant = await this.heart.tenant.findUnique({
      where: { id: tenantId },
      select: { modulos: true, status: true },
    });
    const modules = (tenant?.modulos && typeof tenant.modulos === 'object')
      ? tenant.modulos as Record<string, unknown>
      : {};

    if (!tenant || tenant.status !== 'active' || modules.petshop === false) {
      throw new ForbiddenException('O módulo Pet Shop não está ativo para esta empresa.');
    }
    return true;
  }
}
