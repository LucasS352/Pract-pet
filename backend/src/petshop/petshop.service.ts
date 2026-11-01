import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { productImageOptimizer } from '../images/product-image.optimizer';
import { createHash, randomBytes } from 'crypto';

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

    const [pets, tutors, products, today, inProgress, vaccinesDue, nextAppointments] = await Promise.all([
      prisma.pet.count({ where: { active: true } }),
      prisma.customer.count({ where: { pets: { some: { active: true } } } }),
      prisma.product.count({ where: { active: true } }),
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
    return { metrics: { pets, tutors, products, today, inProgress, vaccinesDue }, nextAppointments };
  }

  async getMetrics(period: string = 'today', customFrom?: string, customTo?: string) {
    const prisma = await this.prisma();
    const now = new Date();
    let start: Date;
    let end: Date = new Date();

    if (customFrom && customTo) {
      start = new Date(customFrom);
      end = new Date(customTo);
    } else if (period === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'week') {
      start = new Date(now.getTime() - 7 * 86_400_000);
      start.setHours(0, 0, 0, 0);
    } else {
      // today
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const [sales, appointments] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: start, lte: end }, status: { not: 'cancelled' } },
        include: { items: { include: { product: { select: { id: true, name: true } } } } },
      }),
      prisma.petAppointment.findMany({
        where: { startsAt: { gte: start, lte: end }, status: { notIn: ['cancelled', 'no_show'] } },
        include: { services: true, professional: { select: { id: true, name: true } } },
      }),
    ]);

    // Métricas de produtos / PDV
    let productRevenue = 0;
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const sale of sales) {
      productRevenue += Number(sale.total || 0);
      for (const item of sale.items) {
        const pName = item.product?.name || item.productName || 'Produto';
        const current = productMap.get(pName) || { name: pName, quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity || 1);
        current.revenue += Number(item.subtotal || (Number(item.quantity || 1) * Number(item.priceUnit || 0)));
        productMap.set(pName, current);
      }
    }

    // Métricas de serviços / Atendimentos
    let serviceRevenue = 0;
    const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
    const proMap = new Map<string, { name: string; count: number; revenue: number }>();

    for (const app of appointments) {
      let appServiceTotal = 0;
      for (const svc of app.services) {
        const val = Number(svc.priceSnapshot || 0);
        serviceRevenue += val;
        appServiceTotal += val;

        const current = serviceMap.get(svc.nameSnapshot) || { name: svc.nameSnapshot, count: 0, revenue: 0 };
        current.count += 1;
        current.revenue += val;
        serviceMap.set(svc.nameSnapshot, current);
      }

      const proName = app.professional?.name || 'Não atribuído';
      const proCurrent = proMap.get(proName) || { name: proName, count: 0, revenue: 0 };
      proCurrent.count += 1;
      proCurrent.revenue += appServiceTotal;
      proMap.set(proName, proCurrent);
    }

    const totalRevenue = productRevenue + serviceRevenue;
    const totalTransactions = sales.length + appointments.length;
    const averageTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

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
      totals: {
        totalRevenue,
        productRevenue,
        serviceRevenue,
        salesCount: sales.length,
        appointmentsCount: appointments.length,
        totalTransactions,
        averageTicket,
      },
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
      include: { pets: { where: { active: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async createTutor(data: any) {
    const prisma = await this.prisma();
    const phone = requiredText(data.phone, 'Telefone').replace(/\D/g, '');
    if (phone.length < 10) throw new BadRequestException('Informe um telefone válido com DDD.');
    return prisma.customer.create({ data: {
      name: requiredText(data.name, 'Nome'), phone,
      cpfCnpj: optionalText(data.cpfCnpj), address: optionalText(data.address),
      reference: optionalText(data.reference), email: optionalText(data.email), notes: optionalText(data.notes), photoUrl: optionalText(data.photoUrl),
    } });
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
        appointments: { include: { services: true, professional: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' }, take: 30 },
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
      size: optionalText(data.size), weight, color: optionalText(data.color), neutered: data.neutered === undefined ? undefined : Boolean(data.neutered),
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
    return prisma.petService.findMany({ where: includeInactive ? undefined : { active: true }, orderBy: { name: 'asc' } });
  }

  async ensureServiceProductBacking(prisma: any, service: { id: string; name: string; price: number | any; active?: boolean }) {
    let servicosCat = await prisma.category.findFirst({
      where: { name: 'Serviços' },
    });
    if (!servicosCat) {
      servicosCat = await prisma.category.create({
        data: { name: 'Serviços', color: '#0d9488' },
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

    // Se já existe comanda aberta ou aguardando pagamento para este agendamento, promove para waiting_payment se necessário
    const existing = await prisma.comanda.findFirst({
      where: {
        status: { in: ['open', 'waiting_payment'] },
        notes: { contains: appointment.id },
      },
      include: { items: true },
    });

    if (existing) {
      if (existing.status === 'open') {
        await prisma.comanda.update({
          where: { id: existing.id },
          data: { status: 'waiting_payment' },
        });
      }
      return existing;
    }

    // Garante que todos os serviços do agendamento existam como produto no PDV
    for (const svc of appointment.services) {
      await this.ensureServiceProductBacking(prisma, {
        id: svc.serviceId,
        name: svc.nameSnapshot,
        price: Number(svc.priceSnapshot),
        active: true,
      });
    }

    const total = appointment.services.reduce(
      (sum: number, s: any) => sum + Number(s.priceSnapshot || 0),
      0,
    );

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
    const serviceName = appointment.services.map((s: any) => s.nameSnapshot).join(', ').slice(0, 24);
    const compactPayload: Record<string, any> = {
      v: 2,
      a: appointment.id,
      s: serviceName || undefined,
      pr: appointment.professional?.name ? appointment.professional.name.slice(0, 18) : undefined,
      at: appointment.startsAt ? new Date(appointment.startsAt).toISOString().slice(0, 16) : undefined,
    };
    const notesStr = `PET2:${JSON.stringify(compactPayload)}`;
    const safeNotes = notesStr.length <= 180 ? notesStr : `PET2:{"v":2,"a":"${appointment.id}"}`;

    const itemsData = appointment.services.map((svc: any) => ({
      productId: svc.serviceId,
      quantity: new Prisma.Decimal(1),
      unitPrice: new Prisma.Decimal(svc.priceSnapshot),
      totalPrice: new Prisma.Decimal(svc.priceSnapshot),
      notes: `Serviço Pet Shop`.slice(0, 50),
      stockDeducted: true,
      kdsStatus: 'READY',
    }));

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

  async createService(data: any) {
    const prisma = await this.prisma();
    const durationMinutes = Number(data.durationMinutes);
    const price = Number(data.price);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) throw new BadRequestException('Duração deve ficar entre 5 e 720 minutos.');
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('Preço inválido.');
    const svc = await prisma.petService.create({ data: {
      name: requiredText(data.name, 'Nome'), description: optionalText(data.description), durationMinutes, price,
      color: optionalText(data.color) || '#0d9488', active: data.active === undefined ? true : Boolean(data.active),
    } });
    await this.ensureServiceProductBacking(prisma, svc);
    return svc;
  }

  async updateService(id: string, data: any) {
    const prisma = await this.prisma();
    const current = await prisma.petService.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Serviço não encontrado.');
    const durationMinutes = data.durationMinutes === undefined ? undefined : Number(data.durationMinutes);
    const price = data.price === undefined ? undefined : Number(data.price);
    if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720)) throw new BadRequestException('Duração inválida.');
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) throw new BadRequestException('Preço inválido.');
    const updated = await prisma.petService.update({ where: { id }, data: {
      name: data.name === undefined ? undefined : requiredText(data.name, 'Nome'), description: optionalText(data.description),
      durationMinutes, price, color: data.color === undefined ? undefined : requiredText(data.color, 'Cor'), active: data.active === undefined ? undefined : Boolean(data.active),
    } });
    await this.ensureServiceProductBacking(prisma, updated);
    return updated;
  }

  async removeService(id: string) {
    const prisma = await this.prisma();
    const found = await prisma.petService.findUnique({
      where: { id },
      include: { _count: { select: { appointmentItems: true } } },
    });
    if (!found) throw new NotFoundException('Serviço não encontrado.');
    if (found._count.appointmentItems > 0) {
      throw new BadRequestException('Este serviço já possui atendimentos vinculados na agenda. Você pode inativá-lo para mantê-lo fora de novos agendamentos sem perder o histórico.');
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
      include: { pet: true, customer: true, professional: { select: { id: true, name: true } }, services: true },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    });

    // Se houver atendimentos no status 'ready' sem comanda ativa, cria em background
    const readyOnes = appointments.filter((a: any) => a.status === 'ready');
    for (const readyApp of readyOnes) {
      this.ensureComandaForAppointment(prisma, readyApp.id).catch(() => {});
    }

    return appointments;
  }

  async createAppointment(data: any) {
    const prisma = await this.prisma();
    const petId = requiredText(data.petId, 'Pet');
    const serviceIds: string[] = Array.from(new Set<string>(Array.isArray(data.serviceIds) ? data.serviceIds.map(String) : []));
    if (!serviceIds.length) throw new BadRequestException('Selecione pelo menos um serviço.');
    const startsAt = optionalDate(data.startsAt, 'Início');
    if (!startsAt) throw new BadRequestException('Data e hora são obrigatórias.');
    const [pet, services] = await Promise.all([
      prisma.pet.findUnique({ where: { id: petId }, include: { customer: true } }),
      prisma.petService.findMany({ where: { id: { in: serviceIds }, active: true } }),
    ]);
    if (!pet || !pet.active) throw new BadRequestException('Pet inválido.');
    if (services.length !== serviceIds.length) throw new BadRequestException('Um ou mais serviços são inválidos.');
    const totalMinutes = services.reduce((sum, service) => sum + service.durationMinutes, 0);
    const endsAt = new Date(startsAt.getTime() + totalMinutes * 60_000);
    const professionalId = optionalText(data.professionalId) ?? null;

    if (professionalId) {
      const professional = await prisma.operator.findFirst({ where: { id: professionalId, active: true }, select: { id: true } });
      if (!professional) throw new BadRequestException('Profissional inválido.');
      const conflict = await prisma.petAppointment.findFirst({ where: {
        professionalId, status: { notIn: ['cancelled', 'no_show'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      } });
      if (conflict) throw new ConflictException('Este profissional já possui um atendimento nesse horário.');
    }

    return prisma.petAppointment.create({ data: {
      customerId: pet.customerId, petId, professionalId, startsAt, endsAt,
      status: data.status === 'requested' ? 'requested' : 'scheduled', source: data.source || 'internal', notes: optionalText(data.notes),
      services: { create: services.map(service => ({
        serviceId: service.id, nameSnapshot: service.name, priceSnapshot: service.price, durationMinutes: service.durationMinutes,
      })) },
    }, include: { pet: true, customer: true, professional: { select: { id: true, name: true } }, services: true } });
  }

  async updateAppointment(id: string, data: any) {
    const prisma = await this.prisma();
    const current = await prisma.petAppointment.findUnique({
      where: { id },
      include: { services: true },
    });
    if (!current) throw new NotFoundException('Agendamento não encontrado.');

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
            startsAt: { lt: current.endsAt },
            endsAt: { gt: current.startsAt },
          },
        });
        if (conflict) throw new ConflictException(`O profissional ${professional.name} já possui outro atendimento nesse horário.`);
        professionalId = professional.id;
      }
    }

    return prisma.petAppointment.update({
      where: { id },
      data: {
        professionalId,
        notes: data.notes !== undefined ? optionalText(data.notes) : undefined,
      },
      include: { pet: true, customer: true, professional: { select: { id: true, name: true } }, services: true },
    });
  }

  async updateAppointmentStatus(id: string, data: any) {
    const prisma = await this.prisma();
    const current = await prisma.petAppointment.findUnique({
      where: { id },
      select: { id: true, status: true, stagePhotoUrl: true, stageNotes: true, stageHistory: true },
    });
    if (!current) throw new NotFoundException('Agendamento não encontrado.');

    const status = data.status ? requiredText(data.status, 'Status') : current.status;
    if (!APPOINTMENT_STATUSES.has(status)) throw new BadRequestException('Status inválido.');

    const now = new Date();
    const nextPhotoUrl = data.stagePhotoUrl !== undefined ? optionalText(data.stagePhotoUrl) : undefined;
    const nextStageNotes = data.stageNotes !== undefined ? optionalText(data.stageNotes) : undefined;

    const existingHistory = Array.isArray(current.stageHistory) ? (current.stageHistory as any[]) : [];
    const statusChanged = status !== current.status;
    const photoAdded = Boolean(nextPhotoUrl && nextPhotoUrl !== current.stagePhotoUrl);
    const notesAdded = Boolean(nextStageNotes && nextStageNotes !== current.stageNotes);

    const updatedHistory = (statusChanged || photoAdded || notesAdded)
      ? [
          ...existingHistory,
          {
            status,
            at: now.toISOString(),
            photoUrl: nextPhotoUrl !== undefined ? nextPhotoUrl : current.stagePhotoUrl ?? null,
            notes: nextStageNotes !== undefined ? nextStageNotes : null,
          },
        ]
      : existingHistory;

    const updatedAppointment = await prisma.petAppointment.update({
      where: { id },
      data: {
        status,
        professionalId: data.professionalId !== undefined ? (!data.professionalId || data.professionalId === 'none' ? null : String(data.professionalId)) : undefined,
        checkInNotes: optionalText(data.checkInNotes),
        stagePhotoUrl: nextPhotoUrl,
        stageNotes: nextStageNotes,
        stageHistory: updatedHistory,
        checkedInAt: status === 'checked_in' ? now : undefined,
        readyAt: status === 'ready' ? now : undefined,
        completedAt: status === 'delivered' ? now : undefined,
      },
      include: { pet: true, customer: true, professional: { select: { id: true, name: true } }, services: true },
    });

    if (status === 'ready') {
      try {
        await this.ensureComandaForAppointment(prisma, id);
      } catch (comandaErr: any) {
        console.error('[PetshopService] Falha ao criar comanda automática para pronto para buscar:', comandaErr?.message || comandaErr);
      }
    }

    return updatedAppointment;
  }
}
