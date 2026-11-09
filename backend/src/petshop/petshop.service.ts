import { SalesService } from '../sales/sales.service';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { productImageOptimizer } from '../images/product-image.optimizer';
import { createHash, randomBytes } from 'crypto';
import { PetshopPackagesService } from './petshop-packages.service';
import { PetshopWhatsappService } from './petshop-whatsapp.service';
import { PetshopPricingService, DEFAULT_STAGE_DEFINITIONS, PetshopStageItem } from './petshop-pricing.service';
import { PetshopCommissionsService } from './petshop-commissions.service';
import { normalizeTransport, parseAppointmentTransport, serializeAppointmentTransport } from './petshop-transport';

const APPOINTMENT_STATUSES = new Set([
  'requested', 'scheduled', 'checked_in', 'bathing', 'grooming',
  'finishing', 'ready', 'delivered', 'cancelled', 'no_show',
]);

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw new BadRequestException(`${field} é obrigatório.`);
  return text;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  return text || null;
}

function optionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} inválido.`);
  return date;
}

@Injectable()
export class PetshopService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly heart: HeartPrismaService,
    private readonly packages: PetshopPackagesService,
    private readonly whatsapp: PetshopWhatsappService,
    private readonly pricing: PetshopPricingService,
    private readonly commissions: PetshopCommissionsService,
    private readonly sales: SalesService,
  ) {}

  private async prisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async uploadPhoto(file: Express.Multer.File) {
    const optimized = await productImageOptimizer.optimize(file.buffer);
    const image = await this.heart.image.create({
      data: { data: Buffer.from(optimized.data), mimeType: optimized.mimeType },
    });
    return {
      imageUrl: `/api/products/uploads/images/${image.id}`,
      bytes: optimized.data.length,
      width: optimized.width,
      height: optimized.height,
      optimized: true,
    };
  }

  async overview() {
    const prisma = await this.prisma();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const start = new Date(`${day}T00:00:00-03:00`);
    const end = new Date(`${day}T23:59:59.999-03:00`);
    const vaccineLimit = new Date(Date.now() + 30 * 86_400_000);
    const activeStatuses = ['requested', 'scheduled', 'checked_in', 'bathing', 'grooming', 'finishing', 'ready'];

    const [pets, tutors, products, servicesCount, today, inProgress, vaccinesDue, nextAppointments] = await Promise.all([
      prisma.pet.count({ where: { active: true } }),
      prisma.customer.count({ where: { pets: { some: { active: true } } } }),
      prisma.product.count({ where: { active: true } }),
      prisma.petService.count({ where: { active: true } }),
      prisma.petAppointment.count({ where: { startsAt: { gte: start, lte: end }, status: { notIn: ['cancelled', 'no_show'] } } }),
      prisma.petAppointment.count({ where: { status: { in: ['checked_in', 'bathing', 'grooming', 'finishing', 'ready'] } } }),
      prisma.petVaccination.count({ where: { nextDueAt: { lte: vaccineLimit }, status: { not: 'waived' } } }),
      prisma.petAppointment.findMany({
        where: { startsAt: { gte: start, lte: end }, status: { in: activeStatuses } },
        include: { pet: true, customer: true, professional: { select: { id: true, name: true } }, services: true },
        orderBy: { startsAt: 'asc' },
        take: 12,
      }),
    ]);
    return { metrics: { pets, tutors, products, services: servicesCount, today, inProgress, vaccinesDue }, nextAppointments };
  }

  async getMetrics(period: string = 'today', customFrom?: string, customTo?: string) {
    const prisma = await this.prisma();
    const now = new Date();
    let start: Date;
    let end: Date = new Date();
    let prevStart: Date;
    let prevEnd: Date;

    if (customFrom && customTo) {
      start = new Date(`${customFrom}T00:00:00`);
      end = new Date(`${customTo}T23:59:59.999`);
      const durationMs = end.getTime() - start.getTime();
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - durationMs);
    } else if (period === 'yesterday') {
      const y = new Date(now.getTime() - 86_400_000);
      start = new Date(y);
      start.setHours(0, 0, 0, 0);
      end = new Date(y);
      end.setHours(23, 59, 59, 999);

      const beforeY = new Date(now.getTime() - 2 * 86_400_000);
      prevStart = new Date(beforeY);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(beforeY);
      prevEnd.setHours(23, 59, 59, 999);
    } else if (period === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    } else if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 23, 59, 59, 999);
    } else if (period === 'year') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'week') {
      start = new Date(now.getTime() - 7 * 86_400_000);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      prevStart = new Date(now.getTime() - 14 * 86_400_000);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(now.getTime() - 7 * 86_400_000);
      prevEnd.setHours(23, 59, 59, 999);
    } else {
      // today
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const y = new Date(now.getTime() - 86_400_000);
      prevStart = new Date(y);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(y);
      prevEnd.setHours(23, 59, 59, 999);
    }

    // 1. Busca transações do período selecionado
    const [sales, appointments, soldPackages] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: start, lte: end }, status: { not: 'cancelled' } },
        include: { items: { include: { product: { select: { id: true, name: true } } } } },
      }),
      prisma.petAppointment.findMany({
        where: { startsAt: { gte: start, lte: end }, status: { notIn: ['cancelled', 'no_show'] } },
        include: { services: true, professional: { select: { id: true, name: true } } },
      }),
      prisma.customerPetPackage.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: { not: 'cancelled' },
          paymentStatus: 'paid',
          saleId: null,
        },
        select: { finalPrice: true },
      }).catch(() => []),
    ]);

    // 2. Busca totais do período anterior para o comparativo
    const [prevSales, prevPackages] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: prevStart, lte: prevEnd }, status: { not: 'cancelled' } },
        select: { total: true },
      }),
      prisma.customerPetPackage.findMany({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          status: { not: 'cancelled' },
          paymentStatus: 'paid',
          saleId: null,
        },
        select: { finalPrice: true },
      }).catch(() => []),
    ]);

    let prevRevenue = 0;
    for (const s of prevSales) prevRevenue += Number(s.total || 0);
    for (const p of prevPackages) prevRevenue += Number(p.finalPrice || 0);
    // Appointments describe work, not cash received. Their receipts are already Sales.

    // Sale is the cash source of truth. Split its origin only for display.
    let productRevenue = 0;
    let serviceRevenue = 0;
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const sale of sales) {
      if (sale.source === 'petshop') {
        serviceRevenue += Number(sale.total || 0);
        continue;
      }
      productRevenue += Number(sale.total || 0);
      for (const item of sale.items) {
        const pName = item.product?.name || item.productName || 'Produto';
        const current = productMap.get(pName) || { name: pName, quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity || 1);
        current.revenue += Number(item.subtotal || (Number(item.quantity || 1) * Number(item.priceUnit || 0)));
        productMap.set(pName, current);
      }
    }

    // Métricas de serviços / Atendimentos (desconta valor já coberto por pacote para evitar duplicidade de faturamento)
    let packageCoveredSessionsCount = 0;
    const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
    const proMap = new Map<string, { name: string; count: number; revenue: number }>();

    for (const app of appointments) {
      let appServiceTotal = 0;
      for (const svc of app.services) {
        const isCoveredByPkg = svc.coverageStatus === 'reserved' || svc.coverageStatus === 'consumed';
        if (isCoveredByPkg) {
          packageCoveredSessionsCount += 1;
        }
        const rawVal = Number(svc.priceSnapshot || 0);
        // Keep service volume for operational rankings; do not add scheduled work to cash revenue.
        appServiceTotal += rawVal;

        const current = serviceMap.get(svc.nameSnapshot) || { name: svc.nameSnapshot, count: 0, revenue: 0 };
        current.count += 1;
        current.revenue += rawVal;
        serviceMap.set(svc.nameSnapshot, current);
      }

      const proName = app.professional?.name || 'Não atribuído';
      const proCurrent = proMap.get(proName) || { name: proName, count: 0, revenue: 0 };
      proCurrent.count += 1;
      proCurrent.revenue += appServiceTotal;
      proMap.set(proName, proCurrent);
    }

    // Receita de pacotes contratados e pagos no período
    let packageRevenue = 0;
    for (const p of soldPackages) {
      packageRevenue += Number(p.finalPrice || 0);
    }

    const totalRevenue = productRevenue + serviceRevenue + packageRevenue;
    const totalTransactions = sales.length + soldPackages.length;
    const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const vsPreviousPeriod = prevRevenue > 0
      ? Number((((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
      : null;

    // Horários e Dias Mais Movimentados
    const byHour: Record<number, number> = {};
    for (let h = 0; h < 24; h++) byHour[h] = 0;

    const byDayOfWeek: Record<number, { day: string; count: number; revenue: number }> = {
      0: { day: 'Dom', count: 0, revenue: 0 },
      1: { day: 'Seg', count: 0, revenue: 0 },
      2: { day: 'Ter', count: 0, revenue: 0 },
      3: { day: 'Qua', count: 0, revenue: 0 },
      4: { day: 'Qui', count: 0, revenue: 0 },
      5: { day: 'Sex', count: 0, revenue: 0 },
      6: { day: 'Sáb', count: 0, revenue: 0 },
    };

    for (const sale of sales) {
      const saleDate = new Date(sale.createdAt);
      const brDate = new Date(saleDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const val = Number(sale.total || 0);

      const hour = brDate.getHours();
      byHour[hour] = (byHour[hour] || 0) + val;

      const dow = brDate.getDay();
      byDayOfWeek[dow].count += 1;
      byDayOfWeek[dow].revenue += val;
    }

    for (const app of appointments) {
      const appDate = new Date(app.startsAt);
      const brDate = new Date(appDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      let appVal = 0;
      for (const svc of app.services) {
        const rawVal = Number(svc.priceSnapshot || 0);
        appVal += rawVal;
      }

      const hour = brDate.getHours();
      byHour[hour] = (byHour[hour] || 0) + appVal;

      const dow = brDate.getDay();
      byDayOfWeek[dow].count += 1;
      byDayOfWeek[dow].revenue += appVal;
    }

    const topServices = Array.from(serviceMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const professionals = Array.from(proMap.values())
      .sort((a, b) => b.count - a.count);

    return {
      period,
      start: start.toISOString(),
      end: end.toISOString(),
      previousPeriod: {
        start: prevStart.toISOString(),
        end: prevEnd.toISOString(),
        revenue: prevRevenue,
        vsPreviousPeriod,
      },
      totals: {
        totalRevenue,
        productRevenue,
        serviceRevenue,
        packageSalesRevenue: packageRevenue,
        packageCoveredSessionsCount,
        salesCount: sales.length,
        appointmentsCount: appointments.length,
        totalTransactions,
        averageTicket,
      },
      byHour,
      byDayOfWeek: Object.values(byDayOfWeek),
      topServices,
      topProducts,
      professionals,
    };
  }

  async listTutors(search?: string) {
    const prisma = await this.prisma();
    const query = String(search ?? '').trim();
    return prisma.customer.findMany({
      where: query ? { OR: [{ name: { contains: query } }, { phone: { contains: query } }, { cpfCnpj: { contains: query } }] } : undefined,
      include: {
        pets: { where: { active: true }, orderBy: { name: 'asc' } },
        petPackages: {
          where: { status: 'active' },
          include: { items: true, pet: { select: { id: true, name: true } } },
          orderBy: { expiresAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  private tutorData(data: any) {
    const phone = requiredText(data?.phone, 'Telefone').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) throw new BadRequestException('Informe um telefone válido com DDD.');
    return {
      name: requiredText(data?.name, 'Nome'), phone,
      cpfCnpj: optionalText(data?.cpfCnpj), address: optionalText(data?.address),
      reference: optionalText(data?.reference), email: optionalText(data?.email), notes: optionalText(data?.notes), photoUrl: optionalText(data?.photoUrl),
      whatsappOptIn: data?.whatsappOptIn === undefined ? true : Boolean(data.whatsappOptIn),
    };
  }

  async createTutor(data: any) {
    const prisma = await this.prisma();
    return prisma.customer.create({ data: this.tutorData(data) }).catch(error => {
      if (error?.code === 'P2002') throw new ConflictException('Já existe um tutor com este telefone ou documento. Localize o cadastro existente.');
      throw error;
    });
  }

  async findReceptionTutor(phoneInput: string) {
    const phone = requiredText(phoneInput, 'Telefone').replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) throw new BadRequestException('Informe o telefone completo com DDD.');
    const prisma = await this.prisma();
    return prisma.customer.findUnique({ where: { phone }, select: { id: true, name: true, phone: true } });
  }

  async registerReception(body: any) {
    const prisma = await this.prisma();
    const customerId = body?.customerId ? requiredText(body.customerId, 'Tutor') : null;
    const tutorData = customerId ? null : this.tutorData(body?.tutor);
    if (customerId && !body?.pet) throw new BadRequestException('Informe o pet a cadastrar para este tutor.');
    const petData = body?.pet ? this.petData({ ...body.pet, name: requiredText(body.pet.name, 'Nome do pet'), species: requiredText(body.pet.species, 'Espécie') }) : null;
    if (petData && !['dog', 'cat', 'bird', 'other'].includes(petData.species)) throw new BadRequestException('Espécie inválida.');
    try {
      return await prisma.$transaction(async tx => {
        const tutor = customerId ? await tx.customer.findUnique({ where: { id: customerId } }) : await tx.customer.create({ data: tutorData! });
        if (!tutor) throw new BadRequestException('Tutor não encontrado.');
        const pet = petData ? await tx.pet.create({ data: { ...petData, customerId: tutor.id }, include: { customer: true } }) : null;
        return { tutor: { id: tutor.id, name: tutor.name, phone: tutor.phone }, pet };
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Já existe um tutor com este telefone ou documento. Use Buscar por telefone para aproveitar o cadastro.');
      throw error;
    }
  }

  async updateTutor(id: string, data: any) {
    const prisma = await this.prisma();
    const exists = await prisma.customer.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Tutor não encontrado.');
    const phone = data.phone === undefined ? undefined : requiredText(data.phone, 'Telefone').replace(/\D/g, '');
    return prisma.customer.update({ where: { id }, data: {
      name: data.name === undefined ? undefined : requiredText(data.name, 'Nome'), phone,
      cpfCnpj: optionalText(data.cpfCnpj), address: optionalText(data.address), reference: optionalText(data.reference),
      email: optionalText(data.email), notes: optionalText(data.notes), photoUrl: optionalText(data.photoUrl),
      whatsappOptIn: data.whatsappOptIn === undefined ? undefined : Boolean(data.whatsappOptIn),
    } });
  }

  async createPortalLink(customerId: string, rotate = false) {
    const prisma = await this.prisma();
    const { tenantId } = this.tenantContext.get();
    const [customer, tenant] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true } }),
      this.heart.tenant.findUnique({ where: { id: tenantId }, select: { tvPublicId: true, nomeFantasia: true, name: true } }),
    ]);
    if (!customer) throw new NotFoundException('Tutor não encontrado.');
    if (!tenant?.tvPublicId) throw new BadRequestException('Identificador público da empresa não configurado. Abra as configurações da empresa e tente novamente.');

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await prisma.$transaction([
      ...(rotate ? [prisma.petPortalAccessToken.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
      prisma.petPortalAccessToken.create({ data: { customerId, tokenHash, expiresAt } }),
    ]);
    return {
      path: `/cliente-pet/${tenant.tvPublicId}#token=${token}`,
      expiresAt,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      shopName: tenant.nomeFantasia || tenant.name,
    };
  }

  async listPets(search?: string, customerId?: string) {
    const prisma = await this.prisma();
    const query = String(search ?? '').trim();
    return prisma.pet.findMany({
      where: {
        active: true,
        ...(customerId ? { customerId } : {}),
        ...(query ? { OR: [{ name: { contains: query } }, { breed: { contains: query } }, { customer: { name: { contains: query } } }] } : {}),
      },
      include: {
        customer: true,
        vaccinations: { orderBy: [{ nextDueAt: 'asc' }, { appliedAt: 'desc' }], take: 5 },
        petPackages: {
          where: { status: 'active' },
          include: { items: true },
          orderBy: { expiresAt: 'asc' },
        },
        _count: { select: { appointments: true } },
      },
      orderBy: { name: 'asc' },
      take: 300,
    });
  }

  async getPet(id: string) {
    const prisma = await this.prisma();
    const pet = await prisma.pet.findUnique({
      where: { id },
      include: {
        customer: true,
        vaccinations: { orderBy: [{ nextDueAt: 'asc' }, { appliedAt: 'desc' }] },
        petPackages: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        },
        appointments: {
          include: {
            services: {
              include: {
                customerPackage: { select: { id: true, planNameSnapshot: true } },
              },
            },
            professional: { select: { id: true, name: true } },
          },
          orderBy: { startsAt: 'desc' },
          take: 30,
        },
      },
    });
    if (!pet) throw new NotFoundException('Pet não encontrado.');
    return pet;
  }

  async createPet(data: any) {
    const prisma = await this.prisma();
    const customerId = requiredText(data.customerId, 'Tutor');
    const tutor = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!tutor) throw new BadRequestException('Tutor inválido.');
    return prisma.pet.create({ data: this.petData(data, customerId), include: { customer: true } });
  }

  async updatePet(id: string, data: any) {
    const prisma = await this.prisma();
    const pet = await prisma.pet.findUnique({ where: { id }, select: { id: true } });
    if (!pet) throw new NotFoundException('Pet não encontrado.');
    return prisma.pet.update({ where: { id }, data: this.petData(data), include: { customer: true } });
  }

  private petData(data: any, forcedCustomerId?: string): any {
    const weight = data.weight === undefined || data.weight === '' ? (data.weight === undefined ? undefined : null) : Number(data.weight);
    if (weight !== undefined && weight !== null && (!Number.isFinite(weight) || weight <= 0)) throw new BadRequestException('Peso inválido.');
    return {
      customerId: forcedCustomerId ?? data.customerId ?? undefined,
      name: data.name === undefined ? undefined : requiredText(data.name, 'Nome do pet'),
      species: data.species === undefined ? undefined : requiredText(data.species, 'Espécie'),
      breed: optionalText(data.breed), sex: optionalText(data.sex), birthDate: optionalDate(data.birthDate, 'Nascimento'),
      size: optionalText(data.size), coatType: optionalText(data.coatType), weight, color: optionalText(data.color), neutered: data.neutered === undefined ? undefined : Boolean(data.neutered),
      microchip: optionalText(data.microchip), photoUrl: optionalText(data.photoUrl), allergies: optionalText(data.allergies),
      behavior: optionalText(data.behavior), notes: optionalText(data.notes), active: data.active === undefined ? undefined : Boolean(data.active),
    };
  }

  async addVaccination(petId: string, data: any) {
    const prisma = await this.prisma();
    const pet = await prisma.pet.findUnique({ where: { id: petId }, select: { id: true } });
    if (!pet) throw new NotFoundException('Pet não encontrado.');
    return prisma.petVaccination.create({ data: {
      petId, vaccineName: requiredText(data.vaccineName, 'Vacina'), status: data.status || 'applied',
      appliedAt: optionalDate(data.appliedAt, 'Data da aplicação'), nextDueAt: optionalDate(data.nextDueAt, 'Próxima dose'),
      batchNumber: optionalText(data.batchNumber), manufacturer: optionalText(data.manufacturer), clinic: optionalText(data.clinic),
      professional: optionalText(data.professional), notes: optionalText(data.notes), proofUrl: optionalText(data.proofUrl),
    } });
  }

  async updateVaccination(id: string, data: any) {
    const prisma = await this.prisma();
    const found = await prisma.petVaccination.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Vacina não encontrada.');
    return prisma.petVaccination.update({
      where: { id },
      data: {
        vaccineName: data.vaccineName === undefined ? undefined : requiredText(data.vaccineName, 'Vacina'),
        status: data.status === undefined ? undefined : data.status,
        appliedAt: data.appliedAt === undefined ? undefined : optionalDate(data.appliedAt, 'Data da aplicação'),
        nextDueAt: data.nextDueAt === undefined ? undefined : optionalDate(data.nextDueAt, 'Próxima dose'),
        batchNumber: data.batchNumber === undefined ? undefined : optionalText(data.batchNumber),
        manufacturer: data.manufacturer === undefined ? undefined : optionalText(data.manufacturer),
        clinic: data.clinic === undefined ? undefined : optionalText(data.clinic),
        professional: data.professional === undefined ? undefined : optionalText(data.professional),
        notes: data.notes === undefined ? undefined : optionalText(data.notes),
        proofUrl: data.proofUrl === undefined ? undefined : optionalText(data.proofUrl),
      },
    });
  }

  async removeVaccination(id: string) {
    const prisma = await this.prisma();
    const found = await prisma.petVaccination.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('Vacina não encontrada.');
    await prisma.petVaccination.delete({ where: { id } });
    return { success: true };
  }

  async listServices(includeInactive = false) {
    const prisma = await this.prisma();
    const services = await prisma.petService.findMany({
      where: includeInactive ? undefined : { active: true },
      include: {
        pricingRules: {
          orderBy: [{ size: 'asc' }, { coatType: 'asc' }],
        },
        comboItems: {
          include: {
            componentService: {
              include: {
                pricingRules: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            appointmentItems: true,
            includedInCombos: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const componentsMap = new Map<string, any>(services.map(s => [s.id, s]));

    return services.map(svc => {
      const range = this.pricing.calculatePriceRange(svc, componentsMap);
      return {
        ...svc,
        customStages: (svc as any).customStages || this.pricing.suggestStages(svc.name, svc.category),
        priceRange: range,
      };
    });
  }

  async getService(id: string) {
    const prisma = await this.prisma();
    const svc = await prisma.petService.findUnique({
      where: { id },
      include: {
        pricingRules: {
          orderBy: [{ size: 'asc' }, { coatType: 'asc' }],
        },
        comboItems: {
          include: {
            componentService: {
              include: {
                pricingRules: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            appointmentItems: true,
            includedInCombos: true,
          },
        },
      },
    });
    if (!svc) throw new NotFoundException('Serviço não encontrado.');

    const range = this.pricing.calculatePriceRange(svc);
    return {
      ...svc,
      customStages: (svc as any).customStages || this.pricing.suggestStages(svc.name, svc.category),
      priceRange: range,
    };
  }

  async calculateServicePrice(id: string, criteria: any) {
    const prisma = await this.prisma();
    const svc = await prisma.petService.findUnique({
      where: { id },
      include: {
        pricingRules: true,
        comboItems: {
          include: {
            componentService: {
              include: {
                pricingRules: true,
              },
            },
          },
        },
      },
    });
    if (!svc) throw new NotFoundException('Serviço não encontrado.');

    let species = criteria?.species;
    let size = criteria?.size;
    let coatType = criteria?.coatType;

    if (criteria?.petId) {
      const pet = await prisma.pet.findUnique({
        where: { id: String(criteria.petId) },
        select: { id: true, name: true, species: true, size: true, coatType: true },
      });
      if (pet) {
        if (!species) species = pet.species;
        if (!size) size = pet.size;
        if (!coatType) coatType = pet.coatType;
      }
    }

    const resolution = this.pricing.resolvePriceAndDuration(svc, { species, size, coatType });
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      serviceType: svc.serviceType,
      criteria: { species, size, coatType },
      ...resolution,
    };
  }

  async ensureServiceProductBacking(prisma: any, service: { id: string; name: string; price: number | any; active?: boolean }) {
    let servicosCat = await prisma.category.findFirst({
      where: { name: 'Serviços' },
    });
    if (!servicosCat) {
      servicosCat = await prisma.category.create({
        data: { name: 'Serviços' },
      });
    }

    return prisma.product.upsert({
      where: { id: service.id },
      update: {
        name: service.name,
        priceSell: new Prisma.Decimal(service.price),
        active: service.active !== false,
        categoryId: servicosCat.id,
      },
      create: {
        id: service.id,
        name: service.name,
        priceSell: new Prisma.Decimal(service.price),
        priceCost: new Prisma.Decimal(0),
        stock: new Prisma.Decimal(99999),
        unit: 'SV',
        active: service.active !== false,
        categoryId: servicosCat.id,
        emiteNfce: false,
      },
    });
  }

  async ensureComandaForAppointment(prisma: any, appointmentId: string) {
    const appointment = await prisma.petAppointment.findUnique({
      where: { id: appointmentId },
      include: {
        pet: true,
        customer: true,
        professional: { select: { id: true, name: true } },
        services: true,
      },
    });

    if (!appointment) return null;

    // Filtra apenas os serviços com saldo avulso, sem componentes de combo.
    const payableServices = appointment.services.filter(
      (svc: any) =>
        svc.coverageStatus !== 'reserved' &&
        svc.coverageStatus !== 'consumed' &&
        svc.comboParentId === null &&
        Number(svc.priceSnapshot) > Number(svc.coveredAmount || 0),
    );

    const transport = parseAppointmentTransport(appointment.checkInNotes);
    const transportFee = transport && !transport.coveredByPackage ? Number(transport.fee) : 0;
    const taxiProductId = 'petshop-taxi-dog-fee';
    const serviceNote = 'Serviço Pet Shop';
    const taxiNote = 'Táxi Dog Pet Shop';
    const payableLines = payableServices.map((svc: any) => ({
      productId: svc.serviceId,
      name: svc.nameSnapshot,
      price: new Prisma.Decimal(svc.priceSnapshot).sub(new Prisma.Decimal(svc.coveredAmount || 0)).toDecimalPlaces(2),
      notes: serviceNote,
    }));
    if (transportFee > 0) {
      payableLines.push({ productId: taxiProductId, name: 'Táxi Dog', price: new Prisma.Decimal(transportFee).toDecimalPlaces(2), notes: taxiNote });
    }

    // Um atendimento coberto por pacote ainda pode ter Táxi Dog avulso.
    if (payableLines.length === 0) {
      return null;
    }

    const expectedTotal = payableLines.reduce((sum, line) => sum.add(line.price), new Prisma.Decimal(0));
    const itemData = (line: typeof payableLines[number]) => ({
      productId: line.productId,
      quantity: new Prisma.Decimal(1),
      unitPrice: line.price,
      totalPrice: line.price,
      notes: line.notes,
      stockDeducted: true,
      kdsStatus: 'READY',
    });

    // Se já existe comanda aberta ou aguardando pagamento para este agendamento, promove para waiting_payment se necessário
    const existing = await prisma.comanda.findFirst({
      where: {
        status: { in: ['open', 'waiting_payment'] },
        notes: { contains: appointment.id },
      },
      include: { items: true },
    });

    if (existing) {
      const activeItems = existing.items.filter((item: any) => item.status === 'active');
      const autoItems = activeItems.filter((item: any) => item.notes === serviceNote || item.notes === taxiNote);
      const manualItems = activeItems.filter((item: any) => item.notes !== serviceNote && item.notes !== taxiNote);
      const itemKey = (productId: string, price: any, quantity: any) => `${productId}:${new Prisma.Decimal(price).toFixed(2)}:${new Prisma.Decimal(quantity).toFixed(3)}`;
      const currentKeys = autoItems.map((item: any) => itemKey(item.productId, item.totalPrice, item.quantity)).sort();
      const expectedKeys = payableLines.map(line => itemKey(line.productId, line.price, 1)).sort();
      const changed = currentKeys.length !== expectedKeys.length || currentKeys.some((key: string, index: number) => key !== expectedKeys[index]);

      if (changed) {
        for (const line of payableLines) {
          await this.ensureServiceProductBacking(prisma, { id: line.productId, name: line.name, price: line.price, active: true });
        }
        if (autoItems.length) {
          await prisma.comandaItem.updateMany({
            where: { id: { in: autoItems.map((item: any) => item.id) } },
            data: { status: 'removed', removedAt: new Date(), removalReason: 'Atendimento atualizado antes do pagamento' },
          });
        }
        await prisma.comandaItem.createMany({ data: payableLines.map(line => ({ comandaId: existing.id, ...itemData(line) })) });
      }
      const total = manualItems.reduce((sum: Prisma.Decimal, item: any) => sum.add(new Prisma.Decimal(item.totalPrice)), expectedTotal);
      return prisma.comanda.update({
        where: { id: existing.id },
        data: { status: 'waiting_payment', total },
        include: { items: true },
      });
    }

    // Garante que todos os serviços cobráveis do agendamento existam como produto no PDV
    for (const line of payableLines) {
      await this.ensureServiceProductBacking(prisma, {
        id: line.productId,
        name: line.name,
        price: line.price,
        active: true,
      });
    }

    const total = expectedTotal;

    const petName = (appointment.pet?.name || 'Pet').trim();
    let baseNumber = `Atendimento: ${petName}`;
    if (baseNumber.length > 40) baseNumber = baseNumber.slice(0, 40);

    const conflicting = await prisma.comanda.findFirst({
      where: {
        number: baseNumber,
        status: { in: ['open', 'waiting_payment'] },
      },
    });

    let finalNumber = baseNumber;
    if (conflicting) {
      const shortId = appointment.id.slice(0, 4).toUpperCase();
      finalNumber = `${baseNumber} #${shortId}`;
    }

    // Protocolo compacto PET2 que NUNCA excede os 191 caracteres da coluna notes do MySQL
    const serviceName = payableServices.map((s: any) => s.nameSnapshot).join(', ').slice(0, 24);
    const compactPayload: Record<string, any> = {
      v: 2,
      a: appointment.id,
      s: serviceName || undefined,
      pr: appointment.professional?.name ? appointment.professional.name.slice(0, 18) : undefined,
      at: appointment.startsAt ? new Date(appointment.startsAt).toISOString().slice(0, 16) : undefined,
    };
    const notesStr = `PET2:${JSON.stringify(compactPayload)}`;
    const safeNotes = notesStr.length <= 180 ? notesStr : `PET2:{"v":2,"a":"${appointment.id}"}`;

    const itemsData = payableLines.map(itemData);

    const customerName = `${appointment.customer?.name || 'Tutor'} · ${appointment.pet?.name || 'Pet'}`;

    try {
      return await prisma.comanda.create({
        data: {
          number: finalNumber,
          customerName: customerName.slice(0, 100),
          notes: safeNotes,
          status: 'waiting_payment',
          total: new Prisma.Decimal(total),
          items: itemsData.length > 0 ? { create: itemsData } : undefined,
        },
        include: { items: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2000' || String(err?.message || '').includes('notes')) {
        return await prisma.comanda.create({
          data: {
            number: finalNumber,
            customerName: customerName.slice(0, 100),
            notes: `PET2:{"v":2,"a":"${appointment.id}"}`,
            status: 'waiting_payment',
            total: new Prisma.Decimal(total),
            items: itemsData.length > 0 ? { create: itemsData } : undefined,
          },
          include: { items: true },
        });
      }
      throw err;
    }
  }

  async getTenantStages(): Promise<PetshopStageItem[]> {
    const prisma = await this.prisma();
    try {
      const row = await prisma.tenantSettings.findUnique({
        where: { id: 'petshop_stages' },
      });
      const config = (row?.paymentMethodsConfig as any) || {};
      if (Array.isArray(config.stages) && config.stages.length > 0) {
        return this.pricing.normalizeStages(config.stages);
      }
    } catch {}
    return this.pricing.getDefaultStageDefinitions();
  }

  async updateTenantStages(body: any, req?: any): Promise<PetshopStageItem[]> {
    const prisma = await this.prisma();
    const userRole = req?.user?.role;
    if (req?.user?.type || !['admin', 'superadmin'].includes(userRole)) {
      throw new ForbiddenException('Apenas administradores podem configurar as etapas do Pet Shop.');
    }

    const rawList = Array.isArray(body) ? body : body?.stages;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new BadRequestException('A lista de etapas deve ser um array não vazio.');
    }

    const validated = this.pricing.validateStages(rawList);
    const normalized = this.pricing.normalizeStages(validated);
    if (normalized.some(stage => stage.key === 'checked_in' && stage.trackProfessional)) throw new BadRequestException('Check-in não é uma execução comissionável.');
    const requestedRules = Array.isArray(body?.commissionRules) ? body.commissionRules : [];
    const generalRules = new Map<string, { kind: string; value: Prisma.Decimal }>();
    for (const row of requestedRules) {
      const stageKey = String(row?.stageKey || '');
      const kind = String(row?.kind || 'NONE').toUpperCase();
      const rawValue = String(row?.value ?? '0').trim();
      if (!normalized.some(stage => stage.key === stageKey && stage.trackProfessional)) throw new BadRequestException('Regra de etapa não rastreada.');
      if (!['NONE', 'PERCENT', 'FIXED'].includes(kind) || !/^\d+(\.\d{1,4})?$/.test(rawValue)) throw new BadRequestException('Regra de comissão inválida.');
      const value = new Prisma.Decimal(rawValue);
      if ((kind === 'NONE' && !value.isZero()) || (kind === 'PERCENT' && value.gt(100)) || (kind === 'FIXED' && value.decimalPlaces() > 2)) throw new BadRequestException('Valor de comissão inválido.');
      if (generalRules.has(stageKey)) throw new BadRequestException('Etapa duplicada nas regras.');
      generalRules.set(stageKey, { kind, value });
    }

    await prisma.$transaction(async tx => {
      await tx.tenantSettings.upsert({
        where: { id: 'petshop_stages' },
        update: { paymentMethodsConfig: { stages: normalized } as any },
        create: { id: 'petshop_stages', paymentMethodsConfig: { stages: normalized } as any },
      });
      for (const stage of normalized.filter(s => s.trackProfessional)) {
        const existing = await tx.petCommissionRule.findFirst({ where: { stageKey: stage.key, serviceId: null, operatorId: null, active: true } });
        const requested = generalRules.get(stage.key);
        if (existing && requested && (existing.kind !== requested.kind || !existing.value.eq(requested.value))) {
          await tx.petCommissionRule.update({ where: { id: existing.id }, data: { active: false } });
        }
        if (!existing || (requested && (existing.kind !== requested.kind || !existing.value.eq(requested.value)))) {
          const latest = await tx.petCommissionRule.findFirst({ where: { stageKey: stage.key, serviceId: null, operatorId: null }, orderBy: { version: 'desc' } });
          await tx.petCommissionRule.create({ data: { scopeKey: `${stage.key}:*:*`, stageKey: stage.key, kind: requested?.kind || 'NONE', value: requested?.value || new Prisma.Decimal(0), version: (latest?.version || 0) + 1, createdById: req.user.id } });
        }
      }
    });

    return normalized;
  }

  async createService(data: any) {
    const prisma = await this.prisma();
    const name = requiredText(data.name, 'Nome do serviço');
    const serviceType = data.serviceType === 'COMBO' ? 'COMBO' : 'INDIVIDUAL';
    const category = optionalText(data.category) || 'Higiene e Estética';
    const targetSpecies = optionalText(data.targetSpecies) || 'all';
    const color = optionalText(data.color) || '#0d9488';
    const active = data.active === undefined ? true : Boolean(data.active);
    const description = optionalText(data.description);

    let price = Number(data.price || 0);
    let durationMinutes = Number(data.durationMinutes || 60);

    let comboPricingType: string | null = null;
    let comboDiscountValue: number | null = null;
    let comboItemsData: any[] = [];

    let customStages: any = undefined;
    if (data.customStages !== undefined && data.customStages !== null) {
      if (Array.isArray(data.customStages) && data.customStages.length > 0) {
        customStages = this.pricing.validateStages(data.customStages);
      }
    } else {
      customStages = this.pricing.suggestStages(name, category);
    }

    if (serviceType === 'COMBO') {
      comboPricingType = data.comboPricingType || 'FIXED_PRICE';
      comboDiscountValue = data.comboDiscountValue !== undefined ? Number(data.comboDiscountValue) : 0;
      if (!Array.isArray(data.comboItems) || data.comboItems.length === 0) {
        throw new BadRequestException('Um combo deve conter pelo menos um serviço individual.');
      }

      const componentIds = data.comboItems.map((ci: any) => String(ci.componentServiceId || ci.serviceId));
      const components = await prisma.petService.findMany({
        where: { id: { in: componentIds } },
      });
      const compMap = new Map<string, any>(components.map(c => [c.id, c]));

      this.pricing.validateComboComposition(data.comboItems, compMap);

      comboItemsData = data.comboItems.map((ci: any, idx: number) => ({
        componentServiceId: String(ci.componentServiceId || ci.serviceId),
        quantity: Math.max(1, Number(ci.quantity || 1)),
        order: Number(ci.order ?? idx),
      }));

      // Se durationMinutes não foi especificado explicitamente, calcula da soma dos componentes
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5) {
        const sumDuration = data.comboItems.reduce((acc: number, ci: any) => {
          const comp = compMap.get(String(ci.componentServiceId || ci.serviceId));
          return acc + (Number(comp?.durationMinutes || 30) * Math.max(1, Number(ci.quantity || 1)));
        }, 0);
        durationMinutes = Math.max(15, sumDuration);
      }
    } else {
      if (!Number.isFinite(price) || price < 0) throw new BadRequestException('Preço inválido.');
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) {
        throw new BadRequestException('Duração deve ficar entre 5 e 720 minutos.');
      }
    }

    const pricingRulesData = Array.isArray(data.pricingRules)
      ? data.pricingRules.map((r: any) => ({
          species: optionalText(r.species) || 'all',
          size: optionalText(r.size) || 'all',
          coatType: optionalText(r.coatType) || 'all',
          price: new Prisma.Decimal(Math.max(0, Number(r.price || 0))),
          durationMinutes: Number(r.durationMinutes) > 0 ? Number(r.durationMinutes) : null,
          label: optionalText(r.label),
        }))
      : [];

    const svc = await prisma.$transaction(async tx => {
      const created = await tx.petService.create({
        data: {
          name,
          description,
          serviceType,
          category,
          targetSpecies,
          durationMinutes,
          price: new Prisma.Decimal(price),
          color,
          active,
          comboPricingType,
          comboDiscountValue: comboDiscountValue !== null ? new Prisma.Decimal(comboDiscountValue) : null,
          customStages: customStages || undefined,
          pricingRules: pricingRulesData.length > 0 ? { create: pricingRulesData } : undefined,
          comboItems: comboItemsData.length > 0 ? { create: comboItemsData } : undefined,
        },
        include: {
          pricingRules: true,
          comboItems: {
            include: { componentService: true },
          },
        },
      });

      return created;
    });

    await this.ensureServiceProductBacking(prisma, svc);
    return svc;
  }

  async updateService(id: string, data: any) {
    const prisma = await this.prisma();
    const current = await prisma.petService.findUnique({
      where: { id },
      include: { comboItems: true, pricingRules: true },
    });
    if (!current) throw new NotFoundException('Serviço não encontrado.');

    const name = data.name !== undefined ? requiredText(data.name, 'Nome do serviço') : current.name;
    const category = data.category !== undefined ? optionalText(data.category) || 'Higiene e Estética' : current.category;
    const targetSpecies = data.targetSpecies !== undefined ? optionalText(data.targetSpecies) || 'all' : current.targetSpecies;
    const color = data.color !== undefined ? optionalText(data.color) || '#0d9488' : current.color;
    const active = data.active !== undefined ? Boolean(data.active) : current.active;
    const description = data.description !== undefined ? optionalText(data.description) : current.description;
    const serviceType = data.serviceType !== undefined ? (data.serviceType === 'COMBO' ? 'COMBO' : 'INDIVIDUAL') : current.serviceType;

    let price = data.price !== undefined ? Number(data.price) : Number(current.price);
    let durationMinutes = data.durationMinutes !== undefined ? Number(data.durationMinutes) : current.durationMinutes;

    let comboPricingType = current.comboPricingType;
    let comboDiscountValue = current.comboDiscountValue ? Number(current.comboDiscountValue) : null;
    let comboItemsData: any[] | null = null;

    let customStages = (current as any).customStages;
    if (data.customStages !== undefined) {
      if (Array.isArray(data.customStages) && data.customStages.length > 0) {
        customStages = this.pricing.validateStages(data.customStages);
      } else if (data.customStages === null) {
        customStages = this.pricing.suggestStages(name, category);
      }
    }

    if (serviceType === 'COMBO') {
      if (data.comboPricingType !== undefined) comboPricingType = data.comboPricingType;
      if (data.comboDiscountValue !== undefined) comboDiscountValue = Number(data.comboDiscountValue);

      if (Array.isArray(data.comboItems)) {
        const componentIds = data.comboItems.map((ci: any) => String(ci.componentServiceId || ci.serviceId));
        const components = await prisma.petService.findMany({
          where: { id: { in: componentIds } },
        });
        const compMap = new Map<string, any>(components.map(c => [c.id, c]));

        this.pricing.validateComboComposition(data.comboItems, compMap);

        comboItemsData = data.comboItems.map((ci: any, idx: number) => ({
          componentServiceId: String(ci.componentServiceId || ci.serviceId),
          quantity: Math.max(1, Number(ci.quantity || 1)),
          order: Number(ci.order ?? idx),
        }));
      }
    }

    const updated = await prisma.$transaction(async tx => {
      await tx.petService.update({
        where: { id },
        data: {
          name,
          category,
          targetSpecies,
          color,
          active,
          description,
          serviceType,
          price: new Prisma.Decimal(price),
          durationMinutes,
          comboPricingType,
          comboDiscountValue: comboDiscountValue !== null ? new Prisma.Decimal(comboDiscountValue) : null,
          customStages: customStages !== undefined ? customStages : undefined,
        },
      });

      if (Array.isArray(data.pricingRules)) {
        await tx.petServicePricingRule.deleteMany({ where: { serviceId: id } });
        if (data.pricingRules.length > 0) {
          await tx.petServicePricingRule.createMany({
            data: data.pricingRules.map((r: any) => ({
              serviceId: id,
              species: optionalText(r.species) || 'all',
              size: optionalText(r.size) || 'all',
              coatType: optionalText(r.coatType) || 'all',
              price: new Prisma.Decimal(Math.max(0, Number(r.price || 0))),
              durationMinutes: Number(r.durationMinutes) > 0 ? Number(r.durationMinutes) : null,
              label: optionalText(r.label),
            })),
          });
        }
      }

      if (comboItemsData !== null) {
        await tx.petServiceComboItem.deleteMany({ where: { comboServiceId: id } });
        if (comboItemsData.length > 0) {
          await tx.petServiceComboItem.createMany({
            data: comboItemsData.map(ci => ({
              comboServiceId: id,
              componentServiceId: ci.componentServiceId,
              quantity: ci.quantity,
              order: ci.order,
            })),
          });
        }
      }

      return tx.petService.findUniqueOrThrow({
        where: { id },
        include: {
          pricingRules: true,
          comboItems: { include: { componentService: true } },
        },
      });
    });

    await this.ensureServiceProductBacking(prisma, updated);
    return updated;
  }

  async removeService(id: string) {
    const prisma = await this.prisma();
    const found = await prisma.petService.findUnique({
      where: { id },
      include: {
        _count: { select: { appointmentItems: true } },
        includedInCombos: {
          include: {
            comboService: { select: { id: true, name: true, active: true } },
          },
        },
      },
    });
    if (!found) throw new NotFoundException('Serviço não encontrado.');

    if (found._count.appointmentItems > 0) {
      throw new BadRequestException(
        'Este serviço já possui atendimentos vinculados na agenda. Você pode inativá-lo para mantê-lo fora de novos agendamentos sem perder o histórico.',
      );
    }

    const activeCombosUsingThis = found.includedInCombos.filter(c => c.comboService?.active);
    if (activeCombosUsingThis.length > 0) {
      const comboNames = activeCombosUsingThis.map(c => `"${c.comboService.name}"`).join(', ');
      throw new BadRequestException(
        `Este serviço faz parte da composição dos combos ativos: ${comboNames}. Remova-o dos combos ou inative o serviço antes de excluí-lo.`,
      );
    }

    await prisma.petService.delete({ where: { id } });
    await prisma.product.updateMany({ where: { id }, data: { active: false } });
    return { success: true };
  }

  async listAppointments(from?: string, to?: string) {
    const prisma = await this.prisma();
    const now = new Date();
    const start = from ? optionalDate(from, 'Data inicial')! : new Date(now.getTime() - 7 * 86_400_000);
    const end = to ? optionalDate(to, 'Data final')! : new Date(now.getTime() + 31 * 86_400_000);
    if (!start || !end || start >= end) throw new BadRequestException('Período da agenda inválido.');
    const appointments = await prisma.petAppointment.findMany({
      where: { startsAt: { gte: start, lte: end } },
      include: {
        pet: true,
        customer: true,
        professional: { select: { id: true, name: true } },
        services: {
          include: {
            service: true,
            customerPackage: {
              select: { id: true, planNameSnapshot: true, expiresAt: true, status: true },
            },
            customerPackageItem: {
              select: {
                id: true,
                totalQuantity: true,
                usedQuantity: true,
                reservedQuantity: true,
                availableQuantity: true,
              },
            },
            comboParent: true,
            comboComponents: true,
          },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    });

    return appointments.map((apt: any) => ({
      ...apt,
      transport: parseAppointmentTransport(apt.checkInNotes),
      resolvedStages: this.pricing.resolveAppointmentStages(apt),
    }));
  }

  async createAppointment(data: any) {
    const prisma = await this.prisma();
    const { userId } = this.tenantContext.get();
    const petId = requiredText(data.petId, 'Pet');
    const serviceIds: string[] = Array.from(new Set<string>(Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : []));
    if (!serviceIds.length) throw new BadRequestException('Selecione pelo menos um serviço.');
    const startsAt = optionalDate(data.startsAt, 'Início');
    if (!startsAt) throw new BadRequestException('Data e hora são obrigatórias.');
    const [pet, services] = await Promise.all([
      prisma.pet.findUnique({ where: { id: petId }, include: { customer: true } }),
      prisma.petService.findMany({
        where: { id: { in: serviceIds }, active: true },
        include: {
          pricingRules: true,
          comboItems: {
            include: {
              componentService: {
                include: { pricingRules: true },
              },
            },
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);
    if (!pet || !pet.active) throw new BadRequestException('Pet inválido.');
    if (services.length !== serviceIds.length) throw new BadRequestException('Um ou mais serviços são inválidos.');

    const petChar = { species: pet.species, size: pet.size, coatType: pet.coatType };
    let totalMinutes = 0;

    interface PlannedAppService {
      serviceId: string;
      nameSnapshot: string;
      priceSnapshot: Prisma.Decimal;
      commissionWeightSnapshot: Prisma.Decimal;
      durationMinutes: number;
      isCombo: boolean;
      comboParentIdx?: number;
    }

    const plannedServices: PlannedAppService[] = [];

    for (const service of services) {
      const resolved = this.pricing.resolvePriceAndDuration(service, petChar);
      totalMinutes += resolved.durationMinutes;

      if (service.serviceType === 'COMBO') {
        const comboIdx = plannedServices.length;
        plannedServices.push({
          serviceId: service.id,
          nameSnapshot: service.name,
          priceSnapshot: new Prisma.Decimal(resolved.price),
          commissionWeightSnapshot: new Prisma.Decimal(resolved.price),
          durationMinutes: resolved.durationMinutes,
          isCombo: true,
        });

        // Adiciona os serviços componentes do combo para controle operacional e relatórios
        const items = Array.isArray(service.comboItems) ? service.comboItems : [];
        for (const ci of items) {
          const comp = ci.componentService;
          const qty = Math.max(1, Number(ci.quantity || 1));
          const compResolved = this.pricing.resolvePriceAndDuration(comp, petChar);

          for (let q = 0; q < qty; q++) {
            plannedServices.push({
              serviceId: comp.id,
              nameSnapshot: `${comp.name} (Combo: ${service.name})`,
              priceSnapshot: new Prisma.Decimal(0),
              commissionWeightSnapshot: new Prisma.Decimal(compResolved.price),
              durationMinutes: compResolved.durationMinutes,
              isCombo: false,
              comboParentIdx: comboIdx,
            });
          }
        }
      } else {
        const sizeLabel = resolved.matchedRule?.label || (resolved.matchedRule?.size && resolved.matchedRule.size !== 'all' ? `Porte ${resolved.matchedRule.size}` : null);
        const nameWithVariant = sizeLabel ? `${service.name} (${sizeLabel})` : service.name;
        plannedServices.push({
          serviceId: service.id,
          nameSnapshot: nameWithVariant,
          priceSnapshot: new Prisma.Decimal(resolved.price),
          commissionWeightSnapshot: new Prisma.Decimal(resolved.price),
          durationMinutes: resolved.durationMinutes,
          isCombo: false,
        });
      }
    }

    const endsAt = new Date(startsAt.getTime() + totalMinutes * 60_000);
    const transport = normalizeTransport(data.transport);
    const professionalId = optionalText(data.professionalId) ?? null;

    if (professionalId) {
      const professional = await prisma.operator.findFirst({ where: { id: professionalId, active: true }, select: { id: true } });
      if (!professional) throw new BadRequestException('Profissional inválido.');
      const conflict = await prisma.petAppointment.findFirst({ where: {
        professionalId, status: { notIn: ['cancelled', 'no_show'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      } });
      if (conflict) throw new ConflictException('Este profissional já possui um atendimento nesse horário.');
    }

    const packageSelections: Record<string, string> =
      data.packageSelections && typeof data.packageSelections === 'object'
        ? data.packageSelections
        : {};

    const stagesLists: any[][] = [];
    for (const service of services) {
      if ((service as any).customStages && Array.isArray((service as any).customStages) && (service as any).customStages.length > 0) {
        try {
          stagesLists.push(this.pricing.validateStages((service as any).customStages));
          continue;
        } catch {}
      }
      stagesLists.push(this.pricing.suggestStages(service.name, service.category));
    }
    const resolvedStages = this.pricing.consolidateStages(stagesLists);

    let operatorName: string | null = null;
    if (userId) {
      try {
        const op = await prisma.operator.findUnique({ where: { id: userId }, select: { name: true } });
        if (op) operatorName = op.name;
      } catch {}
    }

    const initialStatus = data.status === 'requested' ? 'requested' : 'scheduled';
    const initialHistory = [
      {
        status: initialStatus,
        at: new Date().toISOString(),
        userId: userId || null,
        userName: operatorName || null,
      },
    ];

    const created = await prisma.$transaction(async tx => {
      const app = await tx.petAppointment.create({
        data: {
          customerId: pet.customerId,
          petId,
          professionalId,
          startsAt,
          endsAt,
          status: initialStatus,
          source: data.source || 'internal',
          notes: optionalText(data.notes),
          checkInNotes: serializeAppointmentTransport(transport),
          customStages: resolvedStages,
          stageHistory: initialHistory,
        },
      });

      const insertedServices: any[] = [];
      for (const planned of plannedServices) {
        const comboParentId = planned.comboParentIdx !== undefined ? insertedServices[planned.comboParentIdx]?.id : null;
        const inserted = await tx.petAppointmentService.create({
          data: {
            appointmentId: app.id,
            serviceId: planned.serviceId,
            nameSnapshot: planned.nameSnapshot,
            priceSnapshot: planned.priceSnapshot,
            commissionWeightSnapshot: planned.commissionWeightSnapshot,
            durationMinutes: planned.durationMinutes,
            isCombo: planned.isCombo,
            comboParentId: comboParentId || null,
          },
        });
        insertedServices.push(inserted);
      }

      if (Object.keys(packageSelections).length > 0) {
        await this.packages.reserveSessionsForAppointmentInTx(tx, {
          appointmentId: app.id,
          petId,
          customerId: pet.customerId,
          startsAt,
          packageSelections,
          actor: { userId, operatorId: data.operatorId, name: data.operatorName },
        });
      }

      return tx.petAppointment.findUnique({
        where: { id: app.id },
        include: {
          pet: true,
          customer: true,
          professional: { select: { id: true, name: true } },
          services: {
            include: {
              customerPackage: {
                select: { id: true, planNameSnapshot: true, expiresAt: true, status: true },
              },
              customerPackageItem: {
                select: {
                  id: true,
                  totalQuantity: true,
                  usedQuantity: true,
                  reservedQuantity: true,
                  availableQuantity: true,
                },
              },
            },
          },
        },
      });
    });

    if (created && created.status === 'scheduled') {
      this.whatsapp.enqueueAppointmentEvent('APPOINTMENT_CONFIRMED', created.id).catch(() => {});
    }

    return {
      ...created,
      transport,
      resolvedStages,
    };
  }

  async updateAppointment(id: string, data: any) {
    const prisma = await this.prisma();
    const { userId } = this.tenantContext.get();
    const current = await prisma.petAppointment.findUnique({
      where: { id },
      include: {
        pet: true,
        customer: true,
        services: {
          include: {
            service: true,
            customerPackage: true,
            customerPackageItem: true,
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Agendamento não encontrado.');

    let startsAt = current.startsAt;
    let endsAt = current.endsAt;
    let rescheduled = false;

    if (data.startsAt !== undefined && data.startsAt !== null) {
      const nextStartsAt = new Date(data.startsAt);
      if (isNaN(nextStartsAt.getTime())) throw new BadRequestException('Data e horário de início inválidos.');

      let nextEndsAt: Date;
      if (data.endsAt !== undefined && data.endsAt !== null) {
        nextEndsAt = new Date(data.endsAt);
        if (isNaN(nextEndsAt.getTime())) throw new BadRequestException('Data e horário de término inválidos.');
      } else {
        const totalDurationMinutes = current.services.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
        const originalDurationMs = current.endsAt.getTime() - current.startsAt.getTime();
        const durationMs = totalDurationMinutes > 0 ? totalDurationMinutes * 60_000 : (originalDurationMs > 0 ? originalDurationMs : 60 * 60_000);
        nextEndsAt = new Date(nextStartsAt.getTime() + durationMs);
      }

      if (nextEndsAt <= nextStartsAt) {
        throw new BadRequestException('O horário de término deve ser posterior ao horário de início.');
      }

      if (nextStartsAt.getTime() !== current.startsAt.getTime() || nextEndsAt.getTime() !== current.endsAt.getTime()) {
        rescheduled = true;
        startsAt = nextStartsAt;
        endsAt = nextEndsAt;
      }
    }

    let professionalId = current.professionalId;
    if (data.professionalId !== undefined) {
      if (!data.professionalId || data.professionalId === 'none' || data.professionalId === '') {
        professionalId = null;
      } else {
        const professional = await prisma.operator.findFirst({
          where: { id: String(data.professionalId), active: true },
          select: { id: true, name: true },
        });
        if (!professional) throw new BadRequestException('Profissional inválido.');

        const conflict = await prisma.petAppointment.findFirst({
          where: {
            id: { not: id },
            professionalId: professional.id,
            status: { notIn: ['cancelled', 'no_show'] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });
        if (conflict) throw new ConflictException(`O profissional ${professional.name} já possui outro atendimento nesse horário.`);
        professionalId = professional.id;
      }
    } else if (rescheduled && professionalId) {
      const conflict = await prisma.petAppointment.findFirst({
        where: {
          id: { not: id },
          professionalId,
          status: { notIn: ['cancelled', 'no_show'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (conflict) throw new ConflictException(`O profissional responsável já possui outro atendimento nesse novo horário.`);
    }

    // Remoção de serviço extra
    if (data.removeAppointmentServiceId) {
      await prisma.petAppointmentService.deleteMany({
        where: {
          id: String(data.removeAppointmentServiceId),
          appointmentId: id,
        },
      });
    }

    // Adição de serviços extras
    if (Array.isArray(data.addServices) && data.addServices.length > 0) {
      for (const item of data.addServices) {
        const svcId = String(item.serviceId);
        const svc = await prisma.petService.findUnique({ where: { id: svcId } });
        if (svc) {
          const petChar = {
            species: current.pet?.species,
            size: current.pet?.size,
            coatType: current.pet?.coatType,
          };
          const resolved = this.pricing.resolvePriceAndDuration(svc, petChar);
          const price = item.priceSnapshot !== undefined ? Number(item.priceSnapshot) : resolved.price;
          await prisma.petAppointmentService.create({
            data: {
              appointmentId: id,
              serviceId: svc.id,
              nameSnapshot: svc.name,
              priceSnapshot: price,
              durationMinutes: resolved.durationMinutes,
              coverageStatus: 'none',
            },
          });
        }
      }
    }

    // Atualiza status se foi reagendado a partir de cancelado ou se enviado explicitamente
    let newStatus = current.status;
    if (data.status && APPOINTMENT_STATUSES.has(data.status)) {
      newStatus = data.status;
    } else if (rescheduled && (current.status === 'cancelled' || current.status === 'no_show')) {
      newStatus = 'scheduled';
    }

    // Histórico de alterações
    let updatedHistory = Array.isArray(current.stageHistory) ? [...(current.stageHistory as any[])] : [];
    if (rescheduled) {
      let operatorName: string | null = null;
      if (userId) {
        try {
          const op = await prisma.operator.findUnique({ where: { id: userId }, select: { name: true } });
          if (op) operatorName = op.name;
        } catch {}
      }

      const prevStr = current.startsAt.toLocaleDateString('pt-BR') + ' às ' + current.startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const nextStr = startsAt.toLocaleDateString('pt-BR') + ' às ' + startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const reasonNotes = data.rescheduleReason || data.notes || `Reagendado de ${prevStr} para ${nextStr}`;

      updatedHistory.push({
        status: newStatus,
        label: `Reagendado para ${nextStr}`,
        at: new Date().toISOString(),
        notes: reasonNotes,
        userId: userId || null,
        userName: operatorName || null,
        rescheduledFrom: current.startsAt.toISOString(),
        rescheduledTo: startsAt.toISOString(),
      });
    }

    // Tratar atualização de transporte se fornecido
    let checkInNotes = current.checkInNotes;
    if (data.transport !== undefined) {
      const existingTransport = parseAppointmentTransport(current.checkInNotes);
      const mergedTransport = data.transport ? { ...(existingTransport || {}), ...data.transport } : null;
      checkInNotes = serializeAppointmentTransport(mergedTransport);
    }

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        status: newStatus,
        professionalId,
        notes: data.notes !== undefined ? optionalText(data.notes) : undefined,
        checkInNotes,
        stageHistory: updatedHistory,
      },
      include: {
        pet: true,
        customer: true,
        professional: { select: { id: true, name: true } },
        services: {
          include: {
            service: true,
            customerPackage: {
              select: { id: true, planNameSnapshot: true, expiresAt: true, status: true },
            },
            customerPackageItem: {
              select: {
                id: true,
                totalQuantity: true,
                usedQuantity: true,
                reservedQuantity: true,
                availableQuantity: true,
              },
            },
            comboParent: true,
            comboComponents: true,
          },
        },
      },
    });

    return {
      ...updated,
      resolvedStages: this.pricing.resolveAppointmentStages(updated),
    };
  }

  async receivePayment(id: string, body: any, req: any) {
    const actor = req.headers?.['x-operator-token'] ? await this.commissions.sessionOperator(req) : null;
    if (req.user.role === 'operator' && !actor) throw new ForbiddenException('Identifique o colaborador com PIN.');
    const payments = Array.isArray(body.payments) ? body.payments : [{ method: body.method }];
    if (!payments.length || payments.some(p => !['dinheiro', 'pix', 'credito', 'debito'].includes(p.method))) throw new BadRequestException('Forma de pagamento inválida.');
    const comanda = await this.prepareCheckout(id);
    if (!comanda) throw new BadRequestException('Atendimento sem valor avulso. Utilize Concluir (Pacote).');
    const resolvedPayments = payments.map(p => ({ method: p.method, value: body.payments ? Number(p.value) : Number(comanda.total) }));
    if (resolvedPayments.some(p => !Number.isFinite(p.value) || p.value <= 0) || !new Prisma.Decimal(comanda.total).eq(resolvedPayments.reduce((sum, p) => sum.plus(p.value), new Prisma.Decimal(0)))) throw new BadRequestException('A soma dos pagamentos deve ser igual ao total.');
    return this.sales.checkout({
      idempotencyKey: `petshop-receipt:${id}`, source: 'petshop', comandaId: comanda.id,
      petshopAppointmentId: id, operatorId: actor?.id, items: [], extraItems: [],
      payments: resolvedPayments, emitirNfce: false,
    }, true);
  }

  async pendingReservations() {
    const prisma = await this.prisma();
    return prisma.petAppointment.findMany({ where: { status: 'requested' }, include: {
      pet: true, customer: true, services: true, professional: { select: { id: true, name: true } },
    }, orderBy: { startsAt: 'asc' } });
  }

  async prepareCheckout(id: string) {
    const prisma = await this.prisma();
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM pet_appointments WHERE id = ${id} FOR UPDATE`;
      const appointment = await tx.petAppointment.findUnique({ where: { id } });
      if (!appointment) throw new NotFoundException('Atendimento não encontrado.');
      if (appointment.status === 'delivered' || appointment.completedAt) throw new ConflictException('Atendimento já cobrado e concluído.');
      if (appointment.status !== 'ready') throw new BadRequestException('Conclua os cuidados antes de cobrar.');
      return this.ensureComandaForAppointment(tx, id);
    });
  }

  async updateAppointmentStatus(id: string, data: any, req?: any) {
    const prisma = await this.prisma();
    const { userId } = this.tenantContext.get();
    const current = await prisma.petAppointment.findUnique({
      where: { id },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Agendamento não encontrado.');

    let operatorName: string | null = null;
    if (userId) {
      try {
        const op = await prisma.operator.findUnique({ where: { id: userId }, select: { name: true } });
        if (op) operatorName = op.name;
      } catch {}
    }

    const resolvedStages = this.pricing.resolveAppointmentStages(current);
    const resolvedKeys = resolvedStages.map((s: any) => (typeof s === 'string' ? s : s.key));
    const status = data.status ? requiredText(data.status, 'Status') : current.status;
    if (!APPOINTMENT_STATUSES.has(status) && !resolvedKeys.includes(status)) {
      throw new BadRequestException('Status inválido.');
    }
    if (['delivered', 'cancelled', 'no_show'].includes(current.status) || current.completedAt) {
      throw new ConflictException('Atendimento finalizado. Não é permitido reabrir ou cobrar novamente.');
    }
    if (status === 'delivered') {
      if (current.status !== 'ready') throw new BadRequestException('Conclua os cuidados antes da retirada.');
      const payable = current.services.some(s => !s.comboParentId && !['reserved', 'consumed'].includes(s.coverageStatus) && Number(s.priceSnapshot) > Number(s.coveredAmount || 0));
      const transport = parseAppointmentTransport(current.checkInNotes);
      const taxiPayable = transport && !transport.coveredByPackage && transport.fee > 0;
      if (payable || taxiPayable) throw new BadRequestException('Há serviços ou Táxi Dog a cobrar. Finalize o pagamento na Agenda.');
    }

    const getStageLabel = (stKey: string) => {
      const match = resolvedStages.find((s: any) => (typeof s === 'string' ? s : s.key) === stKey);
      if (match && typeof match === 'object' && match.label) return match.label;
      const def = DEFAULT_STAGE_DEFINITIONS.find(d => d.key === stKey);
      return def?.label || (stKey.startsWith('custom_') ? stKey.replace(/^custom_/, '') : stKey);
    };

    const now = new Date();
    const nextPhotoUrl = data.stagePhotoUrl !== undefined ? optionalText(data.stagePhotoUrl) : undefined;
    const nextStageNotes = data.cancelReason !== undefined
      ? optionalText(data.cancelReason)
      : data.stageNotes !== undefined
        ? optionalText(data.stageNotes)
        : undefined;

    const existingHistory = Array.isArray(current.stageHistory) ? (current.stageHistory as any[]) : [];
    const statusChanged = status !== current.status;
    const configuredStages = await this.getTenantStages();
    const trackedStage = configuredStages.find(s => s.key === status && s.trackProfessional);
    const actor = req?.headers?.['x-operator-token'] || (statusChanged && trackedStage)
      ? await this.commissions.sessionOperator(req) : null;
    const photoAdded = Boolean(nextPhotoUrl && nextPhotoUrl !== current.stagePhotoUrl);
    const notesAdded = Boolean(nextStageNotes && nextStageNotes !== current.stageNotes);

    let updatedHistory = existingHistory;
    if (statusChanged || photoAdded || notesAdded) {
      const newEntries: any[] = [];
      if (statusChanged) {
        // Identifica e registra etapas puladas no fluxo para auditoria completa
        const skipped = this.pricing.getSkippedStages(current.status, status, resolvedStages);
        for (const skippedItem of skipped) {
          const skippedKey = typeof skippedItem === 'string' ? skippedItem : skippedItem.key;
          const skippedLabel = typeof skippedItem === 'object' && skippedItem.label ? skippedItem.label : getStageLabel(skippedKey);
          newEntries.push({
            status: skippedKey,
            label: skippedLabel,
            at: now.toISOString(),
            skipped: true,
            reason: 'Etapa ignorada no fluxo para avançar diretamente',
            userId: actor?.id || userId || null,
            userName: actor?.name || operatorName || req?.user?.email || null,
          });
        }
      }

      newEntries.push({
        status,
        label: getStageLabel(status),
        at: now.toISOString(),
        photoUrl: nextPhotoUrl !== undefined ? nextPhotoUrl : null,
        notes: nextStageNotes !== undefined ? nextStageNotes : null,
        userId: actor?.id || userId || null,
        userName: actor?.name || operatorName || req?.user?.email || null,
        skipped: false,
      });

      updatedHistory = [...existingHistory, ...newEntries];
    }

    let consumedInfo: Array<{
      customerPackageId: string;
      remainingAvailable: number;
    }> = [];

    const updatedAppointment = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM pet_appointments WHERE id = ${id} FOR UPDATE`;
      const locked = await tx.petAppointment.findUnique({ where: { id }, select: { status: true, updatedAt: true } });
      if (locked?.status !== current.status || locked?.updatedAt.getTime() !== current.updatedAt.getTime()) throw new ConflictException('Atendimento alterado por outra sessão. Atualize a agenda.');
      // Efetiva consumo de sessão do pacote somente quando o serviço é concluído (ready ou delivered)
      if (status === 'ready' || status === 'delivered') {
        const res = await this.packages.consumeReservedSessionsForAppointmentInTx(tx, id, {
          userId,
          operatorId: data.operatorId,
          name: data.operatorName,
        });
        consumedInfo = res.consumedItems;
      }

      // Se o agendamento for cancelado ou falta (no_show) antes do consumo, libera as sessões reservadas
      if (status === 'cancelled' || status === 'no_show') {
        const cancelReasonNotes = data.cancelReason || data.stageNotes || `Atendimento marcado como ${status}`;
        await this.packages.releaseReservedSessionsForAppointmentInTx(
          tx,
          id,
          cancelReasonNotes,
          {
            userId,
            operatorId: data.operatorId,
            name: data.operatorName,
          },
        );
        await this.commissions.reverseAppointmentInTx(tx, id, req?.user?.id || userId || 'system', cancelReasonNotes);

        // Cancela comandas abertas ou aguardando pagamento geradas para este agendamento
        const openComandas = await tx.comanda.findMany({
          where: {
            status: { in: ['open', 'waiting_payment'] },
            notes: { contains: id },
          },
        });
        for (const cmd of openComandas) {
          await tx.comanda.update({
            where: { id: cmd.id },
            data: {
              status: 'cancelled',
              notes: `${cmd.notes || ''} [Comanda cancelada junto ao agendamento ${id}]`.trim(),
            },
          });
        }
      }

      if (actor && statusChanged && trackedStage) {
        const execution = await tx.petAppointment.findUnique({ where: { id }, include: { services: { include: { service: true, customerPackageItem: true } } } });
        if (execution) await this.commissions.recordExecution(tx, execution, status, actor.id, now);
      }

      return tx.petAppointment.update({
        where: { id },
        data: {
          status,
          customStages: (current as any).customStages || resolvedStages,
          professionalId:
            data.professionalId !== undefined
              ? !data.professionalId || data.professionalId === 'none'
                ? null
                : String(data.professionalId)
              : undefined,
          checkInNotes: data.checkInNotes === undefined ? undefined : parseAppointmentTransport(current.checkInNotes)
            ? JSON.stringify({ transport: parseAppointmentTransport(current.checkInNotes), notes: optionalText(data.checkInNotes) })
            : optionalText(data.checkInNotes),
          stagePhotoUrl: nextPhotoUrl,
          stageNotes: nextStageNotes,
          stageHistory: updatedHistory,
          checkedInAt: status === 'checked_in' && !current.checkedInAt ? now : undefined,
          readyAt: status === 'ready' && !current.readyAt ? now : undefined,
          completedAt: status === 'delivered' ? now : undefined,
        },
        include: {
          pet: true,
          customer: true,
          professional: { select: { id: true, name: true } },
          services: {
            include: {
              customerPackage: {
                select: { id: true, planNameSnapshot: true, expiresAt: true, status: true },
              },
              customerPackageItem: {
                select: {
                  id: true,
                  totalQuantity: true,
                  usedQuantity: true,
                  reservedQuantity: true,
                  availableQuantity: true,
                },
              },
            },
          },
        },
      });
    });

    if (status === 'ready') {
      try {
        await this.prepareCheckout(id);
      } catch (comandaErr: any) {
        console.error('[PetshopService] Falha ao criar comanda automática para pronto para buscar:', comandaErr?.message || comandaErr);
      }
      if (statusChanged) {
        this.whatsapp.enqueueAppointmentEvent('PET_READY', id).catch(() => {});
      }
    }

    if (status === 'scheduled' && statusChanged) {
      this.whatsapp.enqueueAppointmentEvent('APPOINTMENT_CONFIRMED', id).catch(() => {});
    }

    if (data.notifyTutor === true && nextPhotoUrl && status !== 'ready') {
      this.whatsapp.enqueueStagePhoto(id).catch(() => {});
    }

    // Se algum pacote consumido atingiu a última sessão ou zerou, dispara alerta de renovação
    for (const item of consumedInfo) {
      if (item.remainingAvailable <= 1) {
        this.whatsapp
          .enqueuePackageLastSessionAlert({
            customerPackageId: item.customerPackageId,
            remainingAvailable: item.remainingAvailable,
          })
          .catch(() => {});
      }
    }

    return {
      ...updatedAppointment,
      resolvedStages,
    };
  }
}
