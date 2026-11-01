import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';

@Injectable()
export class PetshopPortalService {
  constructor(private readonly heart: HeartPrismaService, private readonly tenantManager: TenantConnectionManager) {}

  private async session(shopId: string, token: string) {
    if (!token || token.length < 32) throw new UnauthorizedException('Link de acesso inválido.');
    const tenant = await this.heart.tenant.findUnique({ where: { tvPublicId: shopId }, select: { id: true, databaseUrl: true, name: true, nomeFantasia: true, logoUrl: true, status: true, modulos: true } });
    const modules = tenant?.modulos && typeof tenant.modulos === 'object' ? tenant.modulos as Record<string, unknown> : {};
    if (!tenant || tenant.status !== 'active' || modules.petshop !== true) throw new NotFoundException('Pet shop indisponível.');
    const prisma = await this.tenantManager.getTenantClient(tenant.id, tenant.databaseUrl);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const access = await prisma.petPortalAccessToken.findUnique({ where: { tokenHash }, select: { id: true, customerId: true, expiresAt: true, revokedAt: true } });
    if (!access || access.revokedAt || access.expiresAt <= new Date()) throw new UnauthorizedException('Este link expirou ou foi revogado. Solicite um novo link ao pet shop.');
    await prisma.petPortalAccessToken.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
    return { tenant, prisma, customerId: access.customerId };
  }

  async getPortal(shopId: string, token: string) {
    const { tenant, prisma, customerId } = await this.session(shopId, token);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [customer, services, appointments, recentHistory] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: {
        id: true, name: true, phone: true, email: true, photoUrl: true,
        pets: { where: { active: true }, orderBy: { name: 'asc' }, select: {
          id: true, name: true, species: true, breed: true, sex: true, birthDate: true, size: true, weight: true, photoUrl: true,
          vaccinations: { orderBy: [{ nextDueAt: 'asc' }, { appliedAt: 'desc' }], select: { id: true, vaccineName: true, status: true, appliedAt: true, nextDueAt: true, manufacturer: true, clinic: true } },
        } },
      } }),
      prisma.petService.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, durationMinutes: true, price: true, color: true } }),
      prisma.petAppointment.findMany({
        where: {
          customerId,
          status: { notIn: ['cancelled', 'no_show'] },
          OR: [
            { startsAt: { gte: startOfToday } },
            { status: { in: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'] } },
          ],
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
        include: {
          pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } },
          professional: { select: { id: true, name: true } },
          services: true,
        },
      }),
      prisma.petAppointment.findMany({
        where: { customerId, status: 'delivered' },
        orderBy: { startsAt: 'desc' },
        take: 6,
        include: {
          pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } },
          professional: { select: { id: true, name: true } },
          services: true,
        },
      }),
    ]);
    if (!customer) throw new UnauthorizedException('Tutor não encontrado.');
    return { shop: { name: tenant.nomeFantasia || tenant.name, logoUrl: tenant.logoUrl }, customer, services, appointments, recentHistory };
  }

  async requestAppointment(shopId: string, token: string, data: any) {
    const { prisma, customerId } = await this.session(shopId, token);
    const petId = String(data.petId || '');
    const serviceIds: string[] = Array.from(new Set<string>(Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : []));
    const startsAt = new Date(String(data.startsAt || ''));
    if (!petId || !serviceIds.length || Number.isNaN(startsAt.getTime())) throw new BadRequestException('Pet, serviço e horário são obrigatórios.');
    if (startsAt <= new Date()) throw new BadRequestException('Escolha um horário futuro.');
    const [pet, services] = await Promise.all([
      prisma.pet.findFirst({ where: { id: petId, customerId, active: true }, select: { id: true } }),
      prisma.petService.findMany({ where: { id: { in: serviceIds }, active: true } }),
    ]);
    if (!pet || services.length !== serviceIds.length) throw new BadRequestException('Pet ou serviço inválido.');
    const duration = services.reduce((total, item) => total + item.durationMinutes, 0);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const duplicate = await prisma.petAppointment.findFirst({ where: { petId, status: { notIn: ['cancelled', 'no_show'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (duplicate) throw new BadRequestException('Este pet já possui um atendimento nesse horário.');
    return prisma.petAppointment.create({ data: {
      customerId, petId, startsAt, endsAt, status: 'requested', source: 'client_portal', notes: String(data.notes || '').trim() || null,
      services: { create: services.map(service => ({ serviceId: service.id, nameSnapshot: service.name, priceSnapshot: service.price, durationMinutes: service.durationMinutes })) },
    }, include: { pet: true, services: true } });
  }
}
