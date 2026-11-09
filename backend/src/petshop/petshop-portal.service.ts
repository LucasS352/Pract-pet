import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { PetshopPricingService } from './petshop-pricing.service';
import { PetshopPackagesService } from './petshop-packages.service';
import { normalizeTransport, serializeAppointmentTransport } from './petshop-transport';

@Injectable()
export class PetshopPortalService {
  constructor(
    private readonly heart: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
    private readonly pricing: PetshopPricingService,
    private readonly packages: PetshopPackagesService,
  ) {}

  private parseTransport(checkInNotes?: string | null) {
    if (!checkInNotes || !checkInNotes.trim().startsWith('{')) return null;
    try {
      const parsed = JSON.parse(checkInNotes);
      if (parsed && typeof parsed === 'object' && parsed.transport && parsed.transport.enabled) {
        return parsed.transport;
      }
    } catch {}
    return null;
  }

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

    const [customer, rawServices, appointments, recentHistory, packages] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          reference: true,
          photoUrl: true,
          pets: {
            where: { active: true },
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              species: true,
              breed: true,
              sex: true,
              birthDate: true,
              size: true,
              coatType: true,
              weight: true,
              photoUrl: true,
              vaccinations: {
                orderBy: [{ nextDueAt: 'asc' }, { appliedAt: 'desc' }],
                select: {
                  id: true,
                  vaccineName: true,
                  status: true,
                  appliedAt: true,
                  nextDueAt: true,
                  manufacturer: true,
                  clinic: true,
                },
              },
            },
          },
        },
      }),
      prisma.petService.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          serviceType: true,
          category: true,
          durationMinutes: true,
          price: true,
          color: true,
          pricingRules: true,
        },
      }),
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
          pet: { select: { id: true, name: true, species: true, breed: true, size: true, coatType: true, photoUrl: true } },
          professional: { select: { id: true, name: true } },
          services: true,
        },
      }),
      prisma.petAppointment.findMany({
        where: { customerId, status: 'delivered' },
        orderBy: { startsAt: 'desc' },
        take: 6,
        include: {
          pet: { select: { id: true, name: true, species: true, breed: true, size: true, coatType: true, photoUrl: true } },
          professional: { select: { id: true, name: true } },
          services: true,
        },
      }),
      prisma.customerPetPackage.findMany({
        where: { customerId, status: 'active' },
        include: {
          pet: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);
    if (!customer) throw new UnauthorizedException('Tutor não encontrado.');

    const componentsMap = new Map<string, any>(rawServices.map(s => [s.id, s]));
    const services = rawServices.map(svc => ({
      ...svc,
      priceRange: this.pricing.calculatePriceRange(svc, componentsMap),
    }));

    return {
      shop: {
        name: tenant.nomeFantasia || tenant.name,
        logoUrl: tenant.logoUrl,
        modulos: tenant.modulos && typeof tenant.modulos === 'object' ? tenant.modulos : {},
      },
      customer,
      services,
      packages,
      appointments: appointments.map(a => ({ ...a, transport: this.parseTransport(a.checkInNotes) })),
      recentHistory: recentHistory.map(a => ({ ...a, transport: this.parseTransport(a.checkInNotes) })),
    };
  }

  async requestAppointment(shopId: string, token: string, data: any) {
    const { prisma, customerId } = await this.session(shopId, token);
    const petId = String(data.petId || '');
    const serviceIds: string[] = Array.from(new Set<string>(Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : []));
    const startsAt = new Date(String(data.startsAt || ''));
    if (!petId || !serviceIds.length || Number.isNaN(startsAt.getTime())) throw new BadRequestException('Pet, serviço e horário são obrigatórios.');
    if (startsAt <= new Date()) throw new BadRequestException('Escolha um horário futuro.');
    const [pet, services] = await Promise.all([
      prisma.pet.findFirst({ where: { id: petId, customerId, active: true }, select: { id: true, species: true, size: true, coatType: true } }),
      prisma.petService.findMany({ where: { id: { in: serviceIds }, active: true }, include: { pricingRules: true } }),
    ]);
    if (!pet || services.length !== serviceIds.length) throw new BadRequestException('Pet ou serviço inválido.');
    const petChar = { species: pet.species, size: pet.size, coatType: pet.coatType };
    const resolvedServices = services.map(service => {
      const res = this.pricing.resolvePriceAndDuration(service, petChar);
      return {
        serviceId: service.id,
        nameSnapshot: service.name,
        priceSnapshot: res.price,
        durationMinutes: res.durationMinutes,
      };
    });
    const duration = resolvedServices.reduce((total, item) => total + item.durationMinutes, 0);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const transport = normalizeTransport(data.transport);
    // Serialize bookings for the same pet, including requests served by different API instances.
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM pets WHERE id = ${petId} FOR UPDATE`;
      const duplicate = await tx.petAppointment.findFirst({ where: { petId, status: { notIn: ['cancelled', 'no_show'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (duplicate) throw new BadRequestException('Este pet já possui um atendimento nesse horário.');
      return tx.petAppointment.create({
      data: {
        customerId,
        petId,
        startsAt,
        endsAt,
        status: 'requested',
        source: 'client_portal',
        notes: String(data.notes || '').trim() || null,
        checkInNotes: serializeAppointmentTransport(transport),
        services: { create: resolvedServices },
      },
      include: { pet: true, services: true },
      });
    });
  }

  async cancelAppointment(shopId: string, token: string, appointmentId: string, reason?: string) {
    const { prisma, customerId } = await this.session(shopId, token);
    const appointment = await prisma.petAppointment.findFirst({
      where: { id: appointmentId, customerId },
      include: { pet: true },
    });

    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');

    if (['delivered', 'cancelled', 'no_show'].includes(appointment.status)) {
      throw new BadRequestException('Este agendamento já foi finalizado ou cancelado.');
    }

    if (['checked_in', 'bathing', 'grooming', 'finishing', 'ready'].includes(appointment.status)) {
      throw new BadRequestException('O pet já está sob cuidados da equipe. Entre em contato diretamente com o pet shop para alterações.');
    }

    const cancelNotes = String(reason || 'Cancelado pelo tutor na Área do Cliente').trim();
    const existingHistory = Array.isArray(appointment.stageHistory) ? (appointment.stageHistory as any[]) : [];
    const updatedHistory = [
      ...existingHistory,
      {
        status: 'cancelled',
        label: 'Cancelado pelo Tutor (Área do Cliente)',
        at: new Date().toISOString(),
        notes: cancelNotes,
      },
    ];

    return prisma.$transaction(async tx => {
      await this.packages.releaseReservedSessionsForAppointmentInTx(
        tx,
        appointmentId,
        cancelNotes,
        { userId: customerId, name: 'Tutor (Área do Cliente)' },
      );

      const updated = await tx.petAppointment.update({
        where: { id: appointmentId },
        data: {
          status: 'cancelled',
          stageNotes: cancelNotes,
          stageHistory: updatedHistory,
        },
      });

      return {
        success: true,
        message: 'Agendamento cancelado com sucesso. Se havia sessão de pacote reservada, ela foi disponibilizada novamente em seu saldo.',
        appointment: updated,
      };
    });
  }

  async rescheduleAppointment(shopId: string, token: string, appointmentId: string, data: any) {
    const { prisma, customerId } = await this.session(shopId, token);
    const appointment = await prisma.petAppointment.findFirst({
      where: { id: appointmentId, customerId },
      include: { pet: true, services: true },
    });

    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');

    if (['delivered', 'cancelled', 'no_show'].includes(appointment.status)) {
      throw new BadRequestException('Não é possível reagendar um agendamento já finalizado ou cancelado.');
    }

    if (['checked_in', 'bathing', 'grooming', 'finishing', 'ready'].includes(appointment.status)) {
      throw new BadRequestException('O atendimento já está em andamento. Fale com a equipe do pet shop pelo WhatsApp.');
    }

    const nextStartsAt = new Date(String(data.startsAt || ''));
    if (isNaN(nextStartsAt.getTime()) || nextStartsAt <= new Date()) {
      throw new BadRequestException('Escolha uma data e horário futuros válidos.');
    }

    const durationMs = appointment.endsAt.getTime() - appointment.startsAt.getTime();
    const nextEndsAt = new Date(nextStartsAt.getTime() + (durationMs > 0 ? durationMs : 60 * 60_000));

    const petId = appointment.petId;
    const rescheduleReason = String(data.reason || 'Reagendado pelo tutor via portal').trim();

    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM pets WHERE id = ${petId} FOR UPDATE`;
      const duplicate = await tx.petAppointment.findFirst({
        where: {
          id: { not: appointmentId },
          petId,
          status: { notIn: ['cancelled', 'no_show'] },
          startsAt: { lt: nextEndsAt },
          endsAt: { gt: nextStartsAt },
        },
      });
      if (duplicate) throw new BadRequestException('Você já possui outro agendamento para este pet nesse horário.');

      const prevStr = appointment.startsAt.toLocaleDateString('pt-BR') + ' às ' + appointment.startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const nextStr = nextStartsAt.toLocaleDateString('pt-BR') + ' às ' + nextStartsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const existingHistory = Array.isArray(appointment.stageHistory) ? (appointment.stageHistory as any[]) : [];
      const updatedHistory = [
        ...existingHistory,
        {
          status: 'rescheduled',
          label: `Reagendado para ${nextStr}`,
          at: new Date().toISOString(),
          notes: rescheduleReason,
          rescheduledFrom: appointment.startsAt.toISOString(),
          rescheduledTo: nextStartsAt.toISOString(),
        },
      ];

      const updated = await tx.petAppointment.update({
        where: { id: appointmentId },
        data: {
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
          stageHistory: updatedHistory,
        },
      });

      return {
        success: true,
        message: 'Horário reagendado com sucesso!',
        appointment: updated,
      };
    });
  }
}
