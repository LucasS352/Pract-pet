import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { PetshopCommissionsService } from './petshop-commissions.service';

@Injectable()
export class PetshopAccessGuard implements CanActivate {
  constructor(private readonly heart: HeartPrismaService, private readonly commissions: PetshopCommissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;
    if (!tenantId || request.user?.role === 'station') {
      throw new ForbiddenException('Acesso ao Pet Shop não permitido.');
    }

    const tenant = await this.heart.tenant.findUnique({
      where: { id: tenantId },
      select: { modulos: true, status: true, databaseUrl: true },
    });
    const modules = (tenant?.modulos && typeof tenant.modulos === 'object')
      ? tenant.modulos as Record<string, unknown>
      : {};

    if (!tenant || tenant.status !== 'active' || modules.petshop === false) {
      throw new ForbiddenException('O módulo Pet Shop não está ativo para esta empresa.');
    }
    const operator = request.headers?.['x-operator-token'] ? await this.commissions.sessionOperator(request, tenant.databaseUrl) : null;
    const restricted = request.user?.role === 'operator' || (operator && !operator.isManager);
    if (restricted) {
      const path = (request.originalUrl || request.url || '').split('?')[0].replace(/^\/api/, '');
      const method = request.method;
      if (path.startsWith('/petshop/reception/') && !operator) throw new ForbiddenException('Identifique o colaborador com PIN para cadastrar na recepção.');
      const allowed = method === 'GET'
        ? path === '/petshop/reception/tutors' || path === '/petshop/tutors/booking-search' || path === '/petshop/tutors/booking-frequent' || path === '/petshop/tutors/booking-directory' || path === '/petshop/appointments/overdue-pickups' || /^\/petshop\/(overview|appointments|pending-reservations|pets|services|stages|taxi-default-fee)$/.test(path) || /^\/petshop\/pets\/[^/]+$/.test(path) || /^\/petshop\/packages\/available\/[^/]+$/.test(path)
        : method === 'POST'
          ? path === '/petshop/reception/registrations' || path === '/petshop/appointments' || path === '/petshop/appointments/batch-taxi-departure' || /^\/petshop\/appointments\/[^/]+\/(receive|checkout|taxi-departure)$/.test(path) || path === '/petshop/uploads/photo' || /^\/petshop\/tutors\/[^/]+\/portal-link$/.test(path)
          : method === 'PATCH' && /^\/petshop\/appointments\/[^/]+(?:\/status)?$/.test(path);
      if (!allowed) throw new ForbiddenException('Acesso restrito ao perfil operacional. Identifique um administrador.');
    }
    return true;
  }
}
