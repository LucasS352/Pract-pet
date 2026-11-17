import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { hasTaxiDropoff, hasTaxiPickup, type TaxiMode } from './petshop-transport';
import { allocatePackagePayments, contractMetadata, moneyCents, normalizePackagePayments, receiptNotes } from './package-receipts';
import { readTaxiDefaultFee } from './taxi-default-fee';
import { PetshopCommissionsService } from './petshop-commissions.service';

const VALID_SPECIES = new Set(['all', 'dog', 'cat']);
const VALID_SIZES = new Set(['all', 'small', 'medium', 'large', 'giant']);
const VALID_COAT_TYPES = new Set(['all', 'short', 'medium', 'long', 'double']);

export function normalizePetSize(size?: string | null): string {
  if (!size) return 'all';
  const s = size.trim().toLowerCase();
  if (s === 'p' || s === 'pequeno' || s === 'small' || s === 'mini') return 'small';
  if (s === 'm' || s === 'medio' || s === 'médio' || s === 'medium') return 'medium';
  if (s === 'g' || s === 'grande' || s === 'large') return 'large';
  if (s === 'gg' || s === 'gigante' || s === 'giant') return 'giant';
  return VALID_SIZES.has(s) ? s : 'all';
}

export function normalizeCoatType(coat?: string | null): string {
  if (!coat) return 'all';
  const c = coat.trim().toLowerCase();
  if (c === 'curto' || c === 'short' || c === 'pelo curto') return 'short';
  if (c === 'medio' || c === 'médio' || c === 'medium' || c === 'pelo medio') return 'medium';
  if (c === 'longo' || c === 'long' || c === 'pelo longo') return 'long';
  if (c === 'duplo' || c === 'double' || c === 'pelagem dupla') return 'double';
  return VALID_COAT_TYPES.has(c) ? c : 'all';
}

export function normalizeSpecies(species?: string | null): string {
  if (!species) return 'all';
  const sp = species.trim().toLowerCase();
  if (sp === 'dog' || sp === 'cao' || sp === 'cão' || sp === 'cachorro') return 'dog';
  if (sp === 'cat' || sp === 'gato' || sp === 'felino') return 'cat';
  return VALID_SPECIES.has(sp) ? sp : 'all';
}

export interface PackageActor {
  userId?: string;
  operatorId?: string;
  name?: string;
}

@Injectable()
export class PetshopPackagesService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly commissions?: PetshopCommissionsService,
  ) {}

  private async prisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  // ===========================================================================
  // 1. CATÁLOGO DE PLANOS E PRECIFICAÇÃO VARIÁVEL
  // ===========================================================================

  async listPlans(includeInactive = false) {
    const prisma = await this.prisma();
    return prisma.petPackagePlan.findMany({
      where: includeInactive ? undefined : { active: true },
      include: {
        items: {
          include: {
            service: {
              select: { id: true, name: true, price: true, durationMinutes: true, color: true },
            },
          },
        },
        pricingRules: {
          orderBy: [{ species: 'asc' }, { size: 'asc' }, { coatType: 'asc' }],
        },
        _count: {
          select: { contracts: true },
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createPlan(data: any) {
    const prisma = await this.prisma();
    const name = String(data?.name ?? '').trim();
    if (!name) throw new BadRequestException('O nome do pacote é obrigatório.');

    const basePrice = Number(data?.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new BadRequestException('Informe um preço base válido.');
    }

    const validityDays = Number(data?.validityDays ?? 30);
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
      throw new BadRequestException('A validade do pacote deve estar entre 1 e 3650 dias.');
    }

    const rawItems = Array.isArray(data?.items) ? data.items : [];
    if (!rawItems.length) {
      throw new BadRequestException('Adicione pelo menos um serviço ao pacote.');
    }

    const consolidatedItems = new Map<string, number>();
    for (const item of rawItems) {
      const serviceId = String(item?.serviceId ?? '').trim();
      const qty = Number(item?.quantity ?? 1);
      if (!serviceId) throw new BadRequestException('Serviço inválido nos itens do pacote.');
      if (!Number.isInteger(qty) || qty < 1 || qty > 500) {
        throw new BadRequestException('A quantidade de sessões por serviço deve ser entre 1 e 500.');
      }
      consolidatedItems.set(serviceId, (consolidatedItems.get(serviceId) || 0) + qty);
    }

    const serviceIds = Array.from(consolidatedItems.keys());
    const foundServices = await prisma.petService.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });
    if (foundServices.length !== serviceIds.length) {
      throw new BadRequestException('Um ou mais serviços selecionados não existem.');
    }

    const pricingRules = this.validatePricingRules(data?.pricingRules);

    return prisma.petPackagePlan.create({
      data: {
        name,
        description: data?.description ? String(data.description).trim() : null,
        basePrice: new Prisma.Decimal(basePrice),
        validityDays,
        allowSharedPets: Boolean(data?.allowSharedPets),
        active: data?.active === undefined ? true : Boolean(data.active),
        items: {
          create: Array.from(consolidatedItems.entries()).map(([serviceId, quantity]) => ({
            serviceId,
            quantity,
          })),
        },
        pricingRules: pricingRules.length
          ? {
              create: pricingRules.map(rule => ({
                species: rule.species,
                size: rule.size,
                coatType: rule.coatType,
                price: new Prisma.Decimal(rule.price),
                label: rule.label,
              })),
            }
          : undefined,
      },
      include: {
        items: { include: { service: true } },
        pricingRules: true,
        _count: { select: { contracts: true } },
      },
    });
  }

  async updatePlan(id: string, data: any) {
    const prisma = await this.prisma();
    const existing = await prisma.petPackagePlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plano de pacote não encontrado.');

    const name = data?.name !== undefined ? String(data.name).trim() : existing.name;
    if (!name) throw new BadRequestException('O nome do pacote é obrigatório.');

    const basePrice =
      data?.basePrice !== undefined ? Number(data.basePrice) : Number(existing.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new BadRequestException('Preço base inválido.');
    }

    const validityDays =
      data?.validityDays !== undefined ? Number(data.validityDays) : existing.validityDays;
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
      throw new BadRequestException('Validade inválida.');
    }

    let itemsToReplace: Array<{ serviceId: string; quantity: number }> | undefined;
    if (Array.isArray(data?.items)) {
      if (!data.items.length) {
        throw new BadRequestException('O pacote deve conter pelo menos um serviço.');
      }
      const map = new Map<string, number>();
      for (const item of data.items) {
        const serviceId = String(item?.serviceId ?? '').trim();
        const qty = Number(item?.quantity ?? 1);
        if (!serviceId || !Number.isInteger(qty) || qty < 1 || qty > 500) {
          throw new BadRequestException('Itens do pacote inválidos.');
        }
        map.set(serviceId, (map.get(serviceId) || 0) + qty);
      }
      const serviceIds = Array.from(map.keys());
      const foundServices = await prisma.petService.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true },
      });
      if (foundServices.length !== serviceIds.length) {
        throw new BadRequestException('Serviço não encontrado.');
      }
      itemsToReplace = Array.from(map.entries()).map(([serviceId, quantity]) => ({
        serviceId,
        quantity,
      }));
    }

    const pricingRules =
      data?.pricingRules !== undefined ? this.validatePricingRules(data.pricingRules) : undefined;

    return prisma.$transaction(async tx => {
      if (itemsToReplace) {
        await tx.petPackagePlanItem.deleteMany({ where: { packagePlanId: id } });
        await tx.petPackagePlanItem.createMany({
          data: itemsToReplace.map(item => ({
            packagePlanId: id,
            serviceId: item.serviceId,
            quantity: item.quantity,
          })),
        });
      }

      if (pricingRules !== undefined) {
        await tx.petPackagePricingRule.deleteMany({ where: { packagePlanId: id } });
        if (pricingRules.length > 0) {
          await tx.petPackagePricingRule.createMany({
            data: pricingRules.map(rule => ({
              packagePlanId: id,
              species: rule.species,
              size: rule.size,
              coatType: rule.coatType,
              price: new Prisma.Decimal(rule.price),
              label: rule.label,
            })),
          });
        }
      }

      return tx.petPackagePlan.update({
        where: { id },
        data: {
          name,
          description:
            data?.description !== undefined
              ? data.description
                ? String(data.description).trim()
                : null
              : undefined,
          basePrice: new Prisma.Decimal(basePrice),
          validityDays,
          allowSharedPets:
            data?.allowSharedPets !== undefined ? Boolean(data.allowSharedPets) : undefined,
          active: data?.active !== undefined ? Boolean(data.active) : undefined,
        },
        include: {
          items: { include: { service: true } },
          pricingRules: true,
          _count: { select: { contracts: true } },
        },
      });
    });
  }

  async removePlan(id: string) {
    const prisma = await this.prisma();
    const plan = await prisma.petPackagePlan.findUnique({
      where: { id },
      include: { _count: { select: { contracts: true } } },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    if (plan._count.contracts > 0) {
      await prisma.petPackagePlan.update({
        where: { id },
        data: { active: false },
      });
      return {
        success: true,
        inactivated: true,
        message: 'Este plano já possui contratos vinculados e foi inativado para preservar o histórico.',
      };
    }
    await prisma.petPackagePlan.delete({ where: { id } });
    return { success: true, inactivated: false };
  }

  private validatePricingRules(rawRules: any): Array<{
    species: string;
    size: string;
    coatType: string;
    price: number;
    label: string | null;
  }> {
    if (!Array.isArray(rawRules)) return [];
    const seen = new Set<string>();
    const validated: Array<{
      species: string;
      size: string;
      coatType: string;
      price: number;
      label: string | null;
    }> = [];

    for (const r of rawRules) {
      const species = normalizeSpecies(r?.species);
      const size = normalizePetSize(r?.size);
      const coatType = normalizeCoatType(r?.coatType);
      const price = Number(r?.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new BadRequestException('Preço inválido na regra de precificação por porte/pelagem.');
      }
      const key = `${species}:${size}:${coatType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      validated.push({
        species,
        size,
        coatType,
        price,
        label: r?.label ? String(r.label).trim() : null,
      });
    }
    return validated;
  }

  /**
   * Resolve o preço sugerido de um plano para um pet específico (ou combinação de porte/pelagem/espécie)
   */
  async simulatePrice(query: {
    planId: string;
    petId?: string;
    species?: string;
    size?: string;
    coatType?: string;
  }) {
    const prisma = await this.prisma();
    const plan = await prisma.petPackagePlan.findUnique({
      where: { id: query.planId },
      include: {
        items: { include: { service: true } },
        pricingRules: true,
      },
    });
    if (!plan) throw new NotFoundException('Plano de pacote não encontrado.');

    let species = normalizeSpecies(query.species);
    let size = normalizePetSize(query.size);
    let coatType = normalizeCoatType(query.coatType);

    if (query.petId) {
      const pet = await prisma.pet.findUnique({ where: { id: query.petId } });
      if (pet) {
        species = normalizeSpecies(pet.species);
        size = normalizePetSize(pet.size);
        coatType = normalizeCoatType(pet.coatType);
      }
    }

    const match = this.findBestPricingRule(plan.pricingRules, species, size, coatType);
    const suggestedPrice = match ? Number(match.price) : Number(plan.basePrice);
    const regularTotal = plan.items.reduce(
      (sum, item) => sum + Number(item.service?.price || 0) * item.quantity,
      0,
    );

    return {
      planId: plan.id,
      planName: plan.name,
      basePrice: Number(plan.basePrice),
      suggestedPrice,
      regularStandaloneTotal: regularTotal,
      estimatedSavings: Math.max(0, regularTotal - suggestedPrice),
      matchedRule: match
        ? {
            id: match.id,
            species: match.species,
            size: match.size,
            coatType: match.coatType,
            price: Number(match.price),
            label: match.label,
          }
        : null,
      criteriaUsed: { species, size, coatType },
    };
  }

  private findBestPricingRule(
    rules: Array<{
      id: string;
      species: string;
      size: string;
      coatType: string;
      price: any;
      label: string | null;
    }>,
    species: string,
    size: string,
    coatType: string,
  ) {
    let bestRule: (typeof rules)[0] | null = null;
    let bestScore = -1;

    for (const rule of rules) {
      const speciesMatch = rule.species === 'all' || rule.species === species;
      const sizeMatch = rule.size === 'all' || rule.size === size;
      const coatMatch = rule.coatType === 'all' || rule.coatType === coatType;

      if (!speciesMatch || !sizeMatch || !coatMatch) continue;

      let score = 0;
      if (rule.size === size && size !== 'all') score += 4;
      if (rule.coatType === coatType && coatType !== 'all') score += 2;
      if (rule.species === species && species !== 'all') score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    return bestRule;
  }

  // ===========================================================================
  // 2. CONTRATAÇÃO, VINCULAÇÃO E CONSULTA DE PACOTES DE CLIENTES
  // ===========================================================================

  private serializeContractNotes(
    userNotes?: string | null,
    transport?: any,
    packageGroup?: {
      id: string;
      mode: 'shared' | 'per_pet';
      petIds: string[];
      petNames: string[];
      totalGroupPrice?: number;
    } | null,
    allowedPetIds?: string[] | null,
  ): string | null {
    const cleanNotes = userNotes ? String(userNotes).trim() : '';
    const hasTransport = Boolean(transport && transport.enabled);
    const hasGroup = Boolean(packageGroup && packageGroup.id);
    const hasAllowed = Array.isArray(allowedPetIds) && allowedPetIds.length > 0;

    if (hasTransport || hasGroup || hasAllowed) {
      const payload: Record<string, any> = {
        userNotes: cleanNotes || null,
      };
      if (hasTransport) {
        const street = transport.street ? String(transport.street).trim() : '';
        const neighborhood = transport.neighborhood ? String(transport.neighborhood).trim() : '';
        const composed = [street, neighborhood].filter(Boolean).join(' - ');
        const effectiveAddress = composed || (transport.address ? String(transport.address).trim() : null);

        payload.transport = {
          enabled: true,
          mode: ['round_trip', 'pickup_only', 'dropoff_only'].includes(transport.mode) ? transport.mode : 'round_trip',
          fee: Math.max(0, Number(transport.fee ?? 40)),
          street: street || null,
          neighborhood: neighborhood || null,
          reference: transport.reference ? String(transport.reference).trim() : null,
          notes: transport.notes ? String(transport.notes).trim() : null,
          address: effectiveAddress,
        };
      } else {
        payload.transport = null;
      }
      if (hasGroup) payload.packageGroup = packageGroup;
      if (hasAllowed) payload.allowedPetIds = allowedPetIds;
      return JSON.stringify(payload);
    }
    return cleanNotes || null;
  }

  private enrichContractTransport<T extends { notes?: string | null }>(
    contract: T,
  ): T & {
    transport?: any;
    receipt?: { receivedAt: string; payments: Array<{ method: string; amount: number }> };
    packageGroup?: {
      id: string;
      mode: 'shared' | 'per_pet';
      petIds: string[];
      petNames: string[];
      totalGroupPrice?: number;
    } | null;
    allowedPetIds?: string[] | null;
  } {
    if (!contract) return contract;
    const raw = contract.notes;
    if (raw && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          ('transport' in parsed || 'packageGroup' in parsed || 'allowedPetIds' in parsed || 'receipt' in parsed)
        ) {
          return {
            ...contract,
            notes: parsed.userNotes || null,
            transport: parsed.transport || null,
            receipt: parsed.receipt || null,
            packageGroup: parsed.packageGroup || null,
            allowedPetIds: Array.isArray(parsed.allowedPetIds) ? parsed.allowedPetIds : null,
          };
        }
      } catch {}
    }
    return { ...contract, transport: null, packageGroup: null, allowedPetIds: null };
  }

  private async expireOverdueContracts(prisma: any) {
    const now = new Date();
    await prisma.customerPetPackage.updateMany({
      where: {
        status: 'active',
        expiresAt: { lt: now },
      },
      data: {
        status: 'expired',
      },
    });
  }

  async listContracts(filters?: {
    customerId?: string;
    petId?: string;
    status?: string;
    search?: string;
  }) {
    const prisma = await this.prisma();
    await this.expireOverdueContracts(prisma);

    const where: any = {};
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.petId) {
      where.OR = [{ petId: filters.petId }, { isShared: true }];
    }
    if (filters?.status && filters.status !== 'all') {
      where.status = filters.status;
    }
    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { planNameSnapshot: { contains: q } },
            { customer: { name: { contains: q } } },
            { pet: { name: { contains: q } } },
          ],
        },
      ];
    }

    const rows = await prisma.customerPetPackage.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, address: true, reference: true } },
        pet: {
          select: {
            id: true,
            name: true,
            species: true,
            breed: true,
            size: true,
            coatType: true,
            photoUrl: true,
          },
        },
        items: {
          include: {
            service: { select: { id: true, name: true, color: true, durationMinutes: true } },
          },
        },
        ledgerEvents: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          include: {
            pet: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return rows.map((r: any) => this.enrichContractTransport(r));
  }

  async getContractById(id: string) {
    const prisma = await this.prisma();
    await this.expireOverdueContracts(prisma);
    const contract = await prisma.customerPetPackage.findUnique({
      where: { id },
      include: {
        customer: true,
        pet: true,
        items: { include: { service: true } },
        ledgerEvents: {
          orderBy: { createdAt: 'desc' },
          include: {
            pet: { select: { id: true, name: true } },
            appointment: { select: { id: true, startsAt: true, status: true } },
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato de pacote não encontrado.');
    const scheduledAppointments = await prisma.petAppointment.findMany({
      where: {
        services: {
          some: {
            customerPackageId: id,
            coverageStatus: { in: ['reserved', 'consumed'] },
          },
        },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        updatedAt: true,
        stageHistory: true,
        pet: { select: { id: true, name: true } },
        services: {
          where: {
            customerPackageId: id,
            coverageStatus: { in: ['reserved', 'consumed'] },
          },
          select: { id: true, nameSnapshot: true, coverageStatus: true, customerPackageItemId: true },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    return { ...this.enrichContractTransport(contract), scheduledAppointments };
  }

  /**
   * Busca pacotes ativos e dentro da validade que podem ser utilizados por um pet em determinada data
   */
  async getAvailablePackagesForPet(petId: string, referenceDateStr?: string) {
    const prisma = await this.prisma();
    await this.expireOverdueContracts(prisma);

    const pet = await prisma.pet.findUnique({
      where: { id: petId },
      select: { id: true, name: true, customerId: true },
    });
    if (!pet) throw new NotFoundException('Pet não encontrado.');

    const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
    const checkDate = Number.isNaN(refDate.getTime()) ? new Date() : refDate;

    const contracts = await prisma.customerPetPackage.findMany({
      where: {
        customerId: pet.customerId,
        status: 'active',
        paymentStatus: 'paid',
        expiresAt: { gte: checkDate },
        OR: [{ petId: pet.id }, { isShared: true }, { petId: null }],
      },
      include: {
        pet: { select: { id: true, name: true } },
        items: {
          include: {
            service: { select: { id: true, name: true, price: true, durationMinutes: true } },
          },
        },
      },
      orderBy: { expiresAt: 'asc' },
    });

    return contracts
      .map((c: any) => this.enrichContractTransport(c))
      .filter((c: any) => {
        if (!c.isShared || !Array.isArray(c.allowedPetIds) || !c.allowedPetIds.length) return true;
        return c.allowedPetIds.includes(pet.id);
      });
  }

  async assertTransportCoverageForReservationsInTx(
    tx: any,
    reservations: Array<{ customerPackageId: string }>,
    mode: TaxiMode,
  ) {
    if (!reservations.length) throw new BadRequestException('O transporte gratuito exige uma sessão de pacote reservada neste agendamento.');
    const ids = [...new Set(reservations.map(item => item.customerPackageId))];
    const contracts = await tx.customerPetPackage.findMany({
      where: { id: { in: ids } },
      select: { id: true, notes: true },
    });
    const covered = contracts.some((contract: any) => {
      const transport = this.enrichContractTransport(contract).transport;
      const packageMode = transport?.mode as TaxiMode | undefined;
      return transport?.enabled && packageMode &&
        (!hasTaxiPickup(mode) || hasTaxiPickup(packageMode)) &&
        (!hasTaxiDropoff(mode) || hasTaxiDropoff(packageMode));
    });
    if (!covered) throw new BadRequestException('O pacote reservado não cobre esta modalidade de Táxi Dog.');
  }

  private async scheduleSessionsForContractInTx(
    tx: any,
    params: {
      contractId: string;
      customerId: string;
      defaultPetId: string | null;
      validPetIdsSet: Set<string>;
      plan: any;
      scheduledSessions: Array<{
        startsAt: string;
        petId?: string;
        serviceIds?: string[];
        professionalId?: string;
        completed?: boolean;
        stageOperators?: Record<string, string>;
      }>;
      transportMeta: any;
      actor?: PackageActor;
    },
  ) {
    if (!params.scheduledSessions.length) return;
    const professionals = [...new Set(params.scheduledSessions.map(s => s.professionalId).filter(id => id && id !== 'none'))].sort();
    for (const id of professionals) {
      const rows: any[] = await tx.$queryRaw(Prisma.sql`SELECT id FROM operators WHERE id = ${id} AND active = 1 FOR UPDATE`);
      if (!rows.length) throw new BadRequestException('Profissional inválido para a sessão.');
    }
    const remainingCountByService = new Map<string, number>();
    for (const pi of params.plan.items) {
      remainingCountByService.set(pi.serviceId, Number(pi.quantity));
    }

    for (let idx = 0; idx < params.scheduledSessions.length; idx++) {
      const sess = params.scheduledSessions[idx];
      if (!sess?.startsAt) throw new BadRequestException(`Informe a data da sessão ${idx + 1}.`);
      const sessStart = new Date(String(sess.startsAt));
      if (Number.isNaN(sessStart.getTime())) throw new BadRequestException(`Data inválida na sessão ${idx + 1}.`);

      const sessPetId = sess.petId ? String(sess.petId).trim() : params.defaultPetId;
      if (!sessPetId) throw new BadRequestException(`Selecione o pet da sessão ${idx + 1}.`);
      if (params.validPetIdsSet.size > 0 && !params.validPetIdsSet.has(sessPetId)) {
        throw new BadRequestException('O pet selecionado na sessão não pertence ao contrato.');
      }

      let sessionServiceIds: string[] = [];
      if (Array.isArray(sess.serviceIds) && sess.serviceIds.length > 0) {
        sessionServiceIds = [...new Set(sess.serviceIds)];
        if (sessionServiceIds.some(sid => (remainingCountByService.get(sid) || 0) <= 0)) {
          throw new BadRequestException(`Serviço sem saldo na sessão ${idx + 1}.`);
        }
      } else {
        for (const pi of params.plan.items) {
          if ((remainingCountByService.get(pi.serviceId) || 0) > 0) {
            sessionServiceIds = [pi.serviceId];
            break;
          }
        }
      }

      if (!sessionServiceIds.length) throw new BadRequestException(`A sessão ${idx + 1} excede o saldo ou contém um serviço inválido.`);

      const chosenServices = params.plan.items
        .filter((pi: any) => sessionServiceIds.includes(pi.serviceId))
        .map((pi: any) => pi.service);
      if (!chosenServices.length) continue;

      const totalDuration = chosenServices.reduce(
        (sum: number, s: any) => sum + Math.max(15, Number(s.durationMinutes || 60)),
        0,
      );
      const sessEnd = new Date(sessStart.getTime() + totalDuration * 60_000);

      const appointmentCheckInNotes = params.transportMeta
        ? JSON.stringify({
            transport: {
              enabled: true,
              mode: params.transportMeta.mode,
              fee: 0,
              coveredByPackage: true,
              street: params.transportMeta.street,
              neighborhood: params.transportMeta.neighborhood,
              reference: params.transportMeta.reference,
              notes: params.transportMeta.notes,
              address: params.transportMeta.address,
            },
          })
        : null;

      const isSessionCompleted = Boolean(sess.completed);
      if (isSessionCompleted && sessStart > new Date()) throw new BadRequestException('Uma sessão futura não pode ser marcada como concluída.');
      if (sess.professionalId && sess.professionalId !== 'none' && !isSessionCompleted) {
        const conflict = await tx.petAppointment.findFirst({ where: {
          professionalId: sess.professionalId, status: { notIn: ['cancelled', 'no_show'] },
          startsAt: { lt: sessEnd }, endsAt: { gt: sessStart },
        } });
        if (conflict) throw new ConflictException(`O profissional já possui atendimento no horário da sessão ${idx + 1}.`);
      }
      const createdAppt = await tx.petAppointment.create({
        data: {
          petId: sessPetId,
          customerId: params.customerId,
          professionalId: sess.professionalId && sess.professionalId !== 'none' ? String(sess.professionalId) : null,
          startsAt: sessStart,
          endsAt: sessEnd,
          status: isSessionCompleted ? 'delivered' : 'scheduled',
          checkedInAt: isSessionCompleted ? sessStart : null,
          readyAt: isSessionCompleted ? sessEnd : null,
          completedAt: isSessionCompleted ? sessEnd : null,
          notes: `Sessão ${idx + 1} do pacote ${params.plan.name}`,
          checkInNotes: appointmentCheckInNotes,
          services: {
            create: chosenServices.map((svc: any) => ({
              serviceId: svc.id,
              nameSnapshot: svc.name,
              priceSnapshot: svc.price,
              durationMinutes: svc.durationMinutes || 60,
              isCombo: svc.serviceType === 'COMBO',
            })),
          },
        },
      });

      const packageSelections: Record<string, string> = {};
      for (const sid of sessionServiceIds) {
        packageSelections[sid] = params.contractId;
        remainingCountByService.set(sid, Math.max(0, (remainingCountByService.get(sid) || 0) - 1));
      }

      await this.reserveSessionsForAppointmentInTx(tx, {
        appointmentId: createdAppt.id,
        petId: sessPetId,
        customerId: params.customerId,
        startsAt: sessStart,
        packageSelections,
        allowPendingPayment: true,
        actor: params.actor,
      });

      if (isSessionCompleted) {
        await this.consumeReservedSessionsForAppointmentInTx(tx, createdAppt.id, params.actor);
        if (this.commissions) {
          const execution = await tx.petAppointment.findUnique({
            where: { id: createdAppt.id },
            include: {
              pet: { select: { size: true } },
              services: { include: { service: true, customerPackageItem: true } },
            },
          });
          if (execution) {
            const stageOps =
              sess.stageOperators && typeof sess.stageOperators === 'object'
                ? sess.stageOperators
                : sess.professionalId && sess.professionalId !== 'none'
                  ? {
                      bathing: String(sess.professionalId),
                      grooming: String(sess.professionalId),
                      finishing: String(sess.professionalId),
                    }
                  : {};
            for (const [stgKey, opId] of Object.entries(stageOps)) {
              if (opId && opId !== 'none') {
                await this.commissions.recordExecution(tx, execution, stgKey, String(opId), sessStart);
              }
            }
          }
        }
      }
    }
  }

  async createContract(data: any, actor?: PackageActor) {
    const prisma = await this.prisma();
    const customerId = String(data?.customerId ?? '').trim();
    const packagePlanId = String(data?.packagePlanId ?? '').trim();
    if (!customerId) throw new BadRequestException('Selecione o tutor.');
    if (!packagePlanId) throw new BadRequestException('Selecione o plano de pacote.');

    const [customer, plan] = await Promise.all([
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.petPackagePlan.findUnique({
        where: { id: packagePlanId },
        include: {
          items: { include: { service: true } },
          pricingRules: true,
        },
      }),
    ]);

    if (!customer) throw new NotFoundException('Tutor não encontrado.');
    if (!plan || !plan.active) throw new BadRequestException('Plano de pacote inválido ou inativo.');
    if (!plan.items.length) throw new BadRequestException('Este plano não possui serviços configurados.');

    const rawPetIds: string[] = Array.isArray(data?.petIds)
      ? Array.from(new Set(data.petIds.map((id: any) => String(id || '').trim()).filter(Boolean)))
      : [];
    const singlePetId = data?.petId ? String(data.petId).trim() : null;
    const requestedPetIds = rawPetIds.length > 0 ? rawPetIds : singlePetId ? [singlePetId] : [];
    const isSharedInput = Boolean(data?.isShared);

    if (!isSharedInput && requestedPetIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos um pet vinculado ao pacote ou marque como pacote compartilhado.');
    }

    const selectedPets = requestedPetIds.length
      ? await prisma.pet.findMany({ where: { id: { in: requestedPetIds }, customerId } })
      : [];
    if (requestedPetIds.length !== selectedPets.length) {
      throw new BadRequestException('Um ou mais pets selecionados não pertencem ao tutor informado.');
    }
    const petById = new Map<string, any>(selectedPets.map((p: any) => [p.id, p]));
    const orderedPets = requestedPetIds.map(id => petById.get(id)).filter(Boolean);

    const multiPetMode: 'shared' | 'per_pet' =
      orderedPets.length >= 2 && data?.multiPetMode === 'per_pet' ? 'per_pet' : 'shared';

    const transportEnabled = Boolean(data?.transport?.enabled);
    const transportFee = transportEnabled ? moneyCents(data?.transport?.fee ?? await readTaxiDefaultFee(prisma), 'Taxa de transporte') / 100 : 0;
    if (!Number.isFinite(transportFee) || transportFee < 0) {
      throw new BadRequestException('Taxa de transporte inválida.');
    }

    const customerAddressInput = data?.customerAddress !== undefined
      ? String(data.customerAddress || '').trim()
      : data?.transport?.address !== undefined
        ? String(data.transport.address || '').trim()
        : undefined;
    const customerReferenceInput = data?.customerReference !== undefined
      ? String(data.customerReference || '').trim()
      : data?.transport?.reference !== undefined
        ? String(data.transport.reference || '').trim()
        : undefined;

    const effectiveAddress = customerAddressInput || customer.address || '';
    if (transportEnabled && !effectiveAddress) {
      throw new BadRequestException('Informe o endereço do cliente para contratar pacote com Táxi Dog / Transporte.');
    }

    const validityDays =
      data?.validityDays !== undefined ? Number(data.validityDays) : plan.validityDays;
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
      throw new BadRequestException('Validade inválida.');
    }

    const startDate = data?.startDate ? new Date(String(data.startDate)) : new Date();
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Data de início inválida.');
    }

    const billingMode = data?.billingMode === 'comanda' ? 'comanda' : 'paid';
    const paymentStatus = billingMode === 'comanda' ? 'pending' : (data?.paymentStatus === 'pending' ? 'pending' : 'paid');
    const paymentMethod = data?.paymentMethod ? String(data.paymentMethod).trim() : (billingMode === 'comanda' ? 'comanda' : 'pix');
    const totalSessionsInPlan = plan.items.reduce((sum, item) => sum + item.quantity, 0);

    const streetInput = data?.transport?.street !== undefined
      ? String(data.transport.street || '').trim()
      : undefined;
    const neighborhoodInput = data?.transport?.neighborhood !== undefined
      ? String(data.transport.neighborhood || '').trim()
      : undefined;
    const notesInput = data?.transport?.notes !== undefined
      ? String(data.transport.notes || '').trim()
      : undefined;

    const baseTransportMeta = transportEnabled
      ? {
          enabled: true,
          mode: ['round_trip', 'pickup_only', 'dropoff_only'].includes(data?.transport?.mode)
            ? data.transport.mode
            : 'round_trip',
          fee: transportFee,
          street: streetInput || (effectiveAddress.includes(' - ') ? effectiveAddress.split(' - ')[0] : effectiveAddress),
          neighborhood: neighborhoodInput || (effectiveAddress.includes(' - ') ? effectiveAddress.split(' - ').slice(1).join(' - ') : null),
          reference: customerReferenceInput || customer.reference || null,
          notes: notesInput || null,
          address: effectiveAddress,
        }
      : null;

    const computeExpiresAt = (sessionsList: Array<{ startsAt?: string }>) => {
      let exp = new Date(startDate.getTime() + validityDays * 86_400_000);
      exp.setHours(23, 59, 59, 999);
      for (const s of sessionsList) {
        if (s?.startsAt) {
          const sd = new Date(String(s.startsAt));
          if (!Number.isNaN(sd.getTime()) && sd.getTime() > exp.getTime()) {
            exp = new Date(sd.getTime() + 7 * 86_400_000);
            exp.setHours(23, 59, 59, 999);
          }
        }
      }
      return exp;
    };

    const perPetConfigsMap = new Map<string, any>();
    if (Array.isArray(data?.perPetConfigs)) {
      for (const cfg of data.perPetConfigs) {
        if (cfg?.petId) perPetConfigsMap.set(String(cfg.petId), cfg);
      }
    }

    // Caso A: Modo 'per_pet' com 2+ pets — cria contratos vinculados sob um único packageGroup
    if (multiPetMode === 'per_pet' && orderedPets.length >= 2) {
      const groupId = randomUUID();
      const petIdsList = orderedPets.map((p: any) => p.id);
      const petNamesList = orderedPets.map((p: any) => p.name);

      const perPetSpecs = orderedPets.map((petItem: any, idx: number) => {
        const cfg = perPetConfigsMap.get(petItem.id) || {};
        const sp = normalizeSpecies(petItem.species || data?.species);
        const sz = normalizePetSize(petItem.size || data?.size);
        const ct = normalizeCoatType(petItem.coatType || data?.coatType);
        const matchedRule = this.findBestPricingRule(plan.pricingRules, sp, sz, ct);
        const defaultPrice = matchedRule ? Number(matchedRule.price) : Number(plan.basePrice);
        const rawBase =
          cfg.customPrice !== undefined && cfg.customPrice !== '' && cfg.customPrice !== null
            ? Number(cfg.customPrice)
            : data?.customPrice !== undefined && data?.customPrice !== '' && data?.customPrice !== null
              ? Number(data.customPrice)
              : defaultPrice;
        if (!Number.isFinite(rawBase) || rawBase < 0) {
          throw new BadRequestException(`Valor base inválido para o pet ${petItem.name}.`);
        }
        moneyCents(rawBase, 'Valor do pacote');
        const petTransportFee = idx === 0 ? transportFee : 0;
        const petDiscount =
          cfg.discountAmount !== undefined
            ? Number(cfg.discountAmount || 0)
            : idx === 0
              ? Number(data?.discountAmount ?? 0)
              : 0;
        if (!Number.isFinite(petDiscount) || petDiscount < 0 || petDiscount > rawBase + petTransportFee) {
          throw new BadRequestException(`Valor de desconto inválido para o pet ${petItem.name}.`);
        }
        moneyCents(petDiscount, 'Desconto');
        const petFinalPrice = moneyCents(Number((rawBase + petTransportFee - petDiscount).toFixed(2)), 'Total') / 100;
        const petSessions = Array.isArray(cfg.scheduledSessions)
          ? cfg.scheduledSessions
          : Array.isArray(data?.scheduledSessions)
            ? data.scheduledSessions.map((s: any) => ({ ...s, petId: petItem.id }))
            : [];
        return {
          pet: petItem,
          species: sp,
          size: sz,
          coatType: ct,
          basePriceSnapshot: rawBase,
          transportFee: petTransportFee,
          discountAmount: petDiscount,
          finalPrice: petFinalPrice,
          scheduledSessions: petSessions,
          expiresAt: computeExpiresAt(petSessions),
          transportMeta: baseTransportMeta ? { ...baseTransportMeta, fee: petTransportFee } : null,
        };
      });

      const totalGroupPrice = Number(
        perPetSpecs.reduce((sum, spec) => sum + spec.finalPrice, 0).toFixed(2),
      );

      const groupPayments = paymentStatus === 'paid' ? normalizePackagePayments(data?.payments, totalGroupPrice, paymentMethod) : [];
      const allocations = paymentStatus === 'paid' ? allocatePackagePayments(groupPayments, perPetSpecs.map(s => s.finalPrice)) : [];
      const receivedAt = new Date().toISOString();
      const groupMeta = {
        id: groupId,
        mode: 'per_pet' as const,
        petIds: petIdsList,
        petNames: petNamesList,
        totalGroupPrice,
      };

      const createdContracts = await prisma.$transaction(async tx => {
        const customerHadNoAddress = !customer.address || customer.address.trim().length === 0;
        const shouldSaveToCustomer =
          data?.saveAddressToCustomer === true ||
          (customerHadNoAddress && data?.saveAddressToCustomer !== false && Boolean(effectiveAddress));

        if (shouldSaveToCustomer && (customerAddressInput !== undefined || customerReferenceInput !== undefined)) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              ...(customerAddressInput !== undefined ? { address: customerAddressInput || null } : {}),
              ...(customerReferenceInput !== undefined ? { reference: customerReferenceInput || null } : {}),
            },
          });
        }

        const createdIds: string[] = [];
        for (const [specIndex, spec] of perPetSpecs.entries()) {
          const createdContract = await tx.customerPetPackage.create({
            data: {
              customerId,
              packagePlanId: plan.id,
              petId: spec.pet.id,
              isShared: false,
              planNameSnapshot: plan.name,
              speciesSnapshot: spec.species,
              sizeSnapshot: spec.size,
              coatTypeSnapshot: spec.coatType,
              basePriceSnapshot: new Prisma.Decimal(spec.basePriceSnapshot + spec.transportFee),
              discountAmount: new Prisma.Decimal(spec.discountAmount),
              finalPrice: new Prisma.Decimal(spec.finalPrice),
              validityDays,
              startDate,
              expiresAt: spec.expiresAt,
              status: 'active',
              paymentStatus,
              paymentMethod: paymentStatus === 'paid' ? (allocations[specIndex].length > 1 ? 'mixed' : allocations[specIndex][0]?.method || paymentMethod) : paymentMethod,
              createdByOperatorId: actor?.operatorId || actor?.userId || null,
              createdByOperatorName: actor?.name || null,
              notes: paymentStatus === 'paid'
                ? receiptNotes(this.serializeContractNotes(data?.notes, spec.transportMeta, groupMeta, [spec.pet.id]), { receivedAt, payments: allocations[specIndex] })
                : this.serializeContractNotes(data?.notes, spec.transportMeta, groupMeta, [spec.pet.id]),
            },
          });
          createdIds.push(createdContract.id);

          for (const planItem of plan.items) {
            const unitValue = totalSessionsInPlan > 0
              ? new Prisma.Decimal(spec.finalPrice).div(totalSessionsInPlan).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
              : new Prisma.Decimal(0);

            const createdItem = await tx.customerPetPackageItem.create({
              data: {
                customerPackageId: createdContract.id,
                serviceId: planItem.serviceId,
                serviceNameSnapshot: planItem.service.name,
                unitValueSnapshot: unitValue,
                totalQuantity: planItem.quantity,
                reservedQuantity: 0,
                usedQuantity: 0,
                availableQuantity: planItem.quantity,
              },
            });

            await tx.customerPetPackageLedger.create({
              data: {
                idempotencyKey: `create:${createdContract.id}:${planItem.serviceId}`,
                customerPackageId: createdContract.id,
                customerPackageItemId: createdItem.id,
                petId: spec.pet.id,
                eventType: 'CONTRACT_CREATED',
                quantityDelta: planItem.quantity,
                balanceAfter: planItem.quantity,
                usedAfter: 0,
                reservedAfter: 0,
                operatorId: actor?.operatorId || actor?.userId || null,
                operatorName: actor?.name || null,
                reason: `Contratação do pacote ${plan.name} (Grupo ${petNamesList.join(', ')})`,
              },
            });
          }

          await this.scheduleSessionsForContractInTx(tx, {
            contractId: createdContract.id,
            customerId,
            defaultPetId: spec.pet.id,
            validPetIdsSet: new Set([spec.pet.id]),
            plan,
            scheduledSessions: spec.scheduledSessions,
            transportMeta: spec.transportMeta,
            actor,
          });
        }

        if (billingMode === 'comanda' && totalGroupPrice > 0 && createdIds.length > 0) {
          const comanda = await this.createComandaForPackageContract(tx, {
            contractId: createdIds[0],
            planId: plan.id,
            planName: plan.name,
            customerName: customer.name,
            petName: petNamesList.join(', '),
            finalPrice: totalGroupPrice,
          });
          await tx.customerPetPackage.updateMany({
            where: { id: { in: createdIds } },
            data: { comandaId: comanda.id },
          });
        }

        return tx.customerPetPackage.findMany({
          where: { id: { in: createdIds } },
          include: {
            customer: true,
            pet: true,
            items: { include: { service: true } },
            ledgerEvents: true,
          },
          orderBy: { createdAt: 'asc' },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

      const enrichedList = createdContracts.map((c: any) => this.enrichContractTransport(c));
      return {
        ...enrichedList[0],
        groupContracts: enrichedList,
      };
    }

    // Caso B: Contrato único (1 pet OU pacote compartilhado dividido entre N pets)
    const primaryPet = orderedPets[0] || null;
    const isShared = orderedPets.length >= 2 ? true : isSharedInput;
    const species = normalizeSpecies(data?.species || primaryPet?.species);
    const size = normalizePetSize(data?.size || primaryPet?.size);
    const coatType = normalizeCoatType(data?.coatType || primaryPet?.coatType);

    const matchedRule = this.findBestPricingRule(plan.pricingRules, species, size, coatType);
    const defaultPrice = matchedRule ? Number(matchedRule.price) : Number(plan.basePrice);

    const basePriceSnapshot =
      data?.customPrice !== undefined && data?.customPrice !== '' && data?.customPrice !== null
        ? Number(data.customPrice)
        : defaultPrice;

    if (!Number.isFinite(basePriceSnapshot) || basePriceSnapshot < 0) {
      throw new BadRequestException('Valor base do contrato inválido.');
    }

    const discountAmount = Number(data?.discountAmount ?? 0);
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > basePriceSnapshot + transportFee) {
      throw new BadRequestException('Valor de desconto inválido.');
    }

    moneyCents(basePriceSnapshot, 'Valor do pacote');
    moneyCents(discountAmount, 'Desconto');
    const finalPrice = moneyCents(Number((basePriceSnapshot + transportFee - discountAmount).toFixed(2)), 'Total') / 100;
    const payments = paymentStatus === 'paid' ? normalizePackagePayments(data?.payments, finalPrice, paymentMethod) : [];
    const scheduledSessions: Array<{
      startsAt: string;
      petId?: string;
      serviceIds?: string[];
      professionalId?: string;
      completed?: boolean;
      stageOperators?: Record<string, string>;
    }> = Array.isArray(data?.scheduledSessions) ? data.scheduledSessions : [];

    const expiresAt = computeExpiresAt(scheduledSessions);
    const allowedPetIds = orderedPets.length > 0 ? orderedPets.map((p: any) => p.id) : null;
    const sharedGroupMeta =
      orderedPets.length >= 2
        ? {
            id: randomUUID(),
            mode: 'shared' as const,
            petIds: orderedPets.map((p: any) => p.id),
            petNames: orderedPets.map((p: any) => p.name),
            totalGroupPrice: finalPrice,
          }
        : null;

    const validPetIdsSet = new Set(
      orderedPets.length > 0 ? orderedPets.map((p: any) => p.id) : [],
    );

    const resultContract = await prisma.$transaction(async tx => {
      const customerHadNoAddress = !customer.address || customer.address.trim().length === 0;
      const shouldSaveToCustomer =
        data?.saveAddressToCustomer === true ||
        (customerHadNoAddress && data?.saveAddressToCustomer !== false && Boolean(effectiveAddress));

      if (shouldSaveToCustomer && (customerAddressInput !== undefined || customerReferenceInput !== undefined)) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            ...(customerAddressInput !== undefined ? { address: customerAddressInput || null } : {}),
            ...(customerReferenceInput !== undefined ? { reference: customerReferenceInput || null } : {}),
          },
        });
      }

      const createdContract = await tx.customerPetPackage.create({
        data: {
          customerId,
          packagePlanId: plan.id,
          petId: orderedPets.length === 1 && !isShared ? primaryPet.id : null,
          isShared,
          planNameSnapshot: plan.name,
          speciesSnapshot: species,
          sizeSnapshot: size,
          coatTypeSnapshot: coatType,
          basePriceSnapshot: new Prisma.Decimal(basePriceSnapshot + transportFee),
          discountAmount: new Prisma.Decimal(discountAmount),
          finalPrice: new Prisma.Decimal(finalPrice),
          validityDays,
          startDate,
          expiresAt,
          status: 'active',
          paymentStatus,
          paymentMethod: paymentStatus === 'paid' ? (payments.length > 1 ? 'mixed' : payments[0]?.method || paymentMethod) : paymentMethod,
          createdByOperatorId: actor?.operatorId || actor?.userId || null,
          createdByOperatorName: actor?.name || null,
          notes: paymentStatus === 'paid'
            ? receiptNotes(this.serializeContractNotes(data?.notes, baseTransportMeta, sharedGroupMeta, allowedPetIds), { receivedAt: new Date().toISOString(), payments })
            : this.serializeContractNotes(data?.notes, baseTransportMeta, sharedGroupMeta, allowedPetIds),
        },
      });

      for (const planItem of plan.items) {
        const unitValue = totalSessionsInPlan > 0
          ? new Prisma.Decimal(finalPrice).div(totalSessionsInPlan).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          : new Prisma.Decimal(0);

        const createdItem = await tx.customerPetPackageItem.create({
          data: {
            customerPackageId: createdContract.id,
            serviceId: planItem.serviceId,
            serviceNameSnapshot: planItem.service.name,
            unitValueSnapshot: unitValue,
            totalQuantity: planItem.quantity,
            reservedQuantity: 0,
            usedQuantity: 0,
            availableQuantity: planItem.quantity,
          },
        });

        await tx.customerPetPackageLedger.create({
          data: {
            idempotencyKey: `create:${createdContract.id}:${planItem.serviceId}`,
            customerPackageId: createdContract.id,
            customerPackageItemId: createdItem.id,
            petId: orderedPets.length === 1 && !isShared ? primaryPet.id : null,
            eventType: 'CONTRACT_CREATED',
            quantityDelta: planItem.quantity,
            balanceAfter: planItem.quantity,
            usedAfter: 0,
            reservedAfter: 0,
            operatorId: actor?.operatorId || actor?.userId || null,
            operatorName: actor?.name || null,
            reason: `Contratação do pacote ${plan.name}`,
          },
        });
      }

      if (scheduledSessions.length > 0 && (primaryPet || orderedPets.length > 0)) {
        await this.scheduleSessionsForContractInTx(tx, {
          contractId: createdContract.id,
          customerId,
          defaultPetId: primaryPet?.id || null,
          validPetIdsSet,
          plan,
          scheduledSessions,
          transportMeta: baseTransportMeta,
          actor,
        });
      }

      if (billingMode === 'comanda' && finalPrice > 0) {
        const petLabel = orderedPets.length >= 2
          ? orderedPets.map((p: any) => p.name).join(', ')
          : primaryPet?.name || 'Compartilhado';
        const comanda = await this.createComandaForPackageContract(tx, {
          contractId: createdContract.id,
          planId: plan.id,
          planName: plan.name,
          customerName: customer.name,
          petName: petLabel,
          finalPrice,
        });
        await tx.customerPetPackage.update({
          where: { id: createdContract.id },
          data: { comandaId: comanda.id },
        });
      }

      return tx.customerPetPackage.findUnique({
        where: { id: createdContract.id },
        include: {
          customer: true,
          pet: true,
          items: { include: { service: true } },
          ledgerEvents: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return this.enrichContractTransport(resultContract as any);
  }

  private async createComandaForPackageContract(
    tx: any,
    params: {
      contractId: string;
      planId: string;
      planName: string;
      customerName: string;
      petName: string;
      finalPrice: number;
    },
  ) {
    let cat = await tx.category.findFirst({ where: { name: 'Pacotes Pet' } });
    if (!cat) {
      cat = await tx.category.create({ data: { name: 'Pacotes Pet' } });
    }

    const backingProductId = `pkg-${params.planId}`.slice(0, 36);
    await tx.product.upsert({
      where: { id: backingProductId },
      update: {
        name: `Pacote: ${params.planName}`,
        priceSell: new Prisma.Decimal(params.finalPrice),
        active: true,
      },
      create: {
        id: backingProductId,
        name: `Pacote: ${params.planName}`,
        categoryId: cat.id,
        priceCost: new Prisma.Decimal(0),
        priceSell: new Prisma.Decimal(params.finalPrice),
        stock: new Prisma.Decimal(99999),
        unit: 'UN',
        active: true,
        emiteNfce: false,
      },
    });

    const shortCode = params.contractId.slice(0, 4).toUpperCase();
    const number = `Pacote: ${params.petName}`.slice(0, 32) + ` #${shortCode}`;
    const safeNotes = `PKG1:${JSON.stringify({ v: 1, c: params.contractId })}`;

    return tx.comanda.create({
      data: {
        number,
        customerName: `${params.customerName} · ${params.petName}`.slice(0, 100),
        notes: safeNotes,
        status: 'waiting_payment',
        total: new Prisma.Decimal(params.finalPrice),
        items: {
          create: [
            {
              productId: backingProductId,
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(params.finalPrice),
              totalPrice: new Prisma.Decimal(params.finalPrice),
              notes: `Contratação ${params.planName}`.slice(0, 50),
              stockDeducted: true,
              kdsStatus: 'READY',
            },
          ],
        },
      },
    });
  }

  async confirmContractPayment(contractId: string, body: { paymentMethod?: string; payments?: unknown; saleId?: string; confirmGroup?: boolean }) {
    const prisma = await this.prisma();
    if (body?.saleId) throw new BadRequestException('Recebimentos pelo PDV devem ser confirmados no Caixa.');
    const initial = await prisma.customerPetPackage.findUnique({ where: { id: contractId } });
    if (!initial) throw new NotFoundException('Contrato não encontrado.');
    if (initial.status === 'cancelled') throw new BadRequestException('Contrato cancelado.');
    if (initial.comandaId && contractMetadata(initial.notes).packageGroup?.mode === 'per_pet' && body?.confirmGroup === false) {
      throw new BadRequestException('Confirme o grupo completo para quitar sua comanda única.');
    }
    await prisma.$transaction(async tx => {
      // Serialize family confirmations before locking its individual contracts.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM customers WHERE id = ${initial.customerId} FOR UPDATE`);
      const group = contractMetadata(initial.notes).packageGroup;
      const members = await tx.customerPetPackage.findMany({ where: group?.mode === 'per_pet' && body?.confirmGroup !== false
        ? { customerId: initial.customerId, notes: { contains: group.id }, status: { not: 'cancelled' } }
        : { id: contractId }, orderBy: { id: 'asc' }, include: { items: true } });
      // Checkout locks the comanda before its packages: keep the same lock order.
      for (const id of [...new Set(members.map(m => m.comandaId).filter(Boolean))].sort()) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM comandas WHERE id = ${id} FOR UPDATE`);
      }
      for (const member of members) await tx.$queryRaw(Prisma.sql`SELECT id FROM customer_pet_packages WHERE id = ${member.id} FOR UPDATE`);
      const contracts = await tx.customerPetPackage.findMany({ where: { id: { in: members.map(m => m.id) } }, orderBy: { id: 'asc' }, include: { items: true } });
      if (contracts.some(c => c.status === 'cancelled')) throw new BadRequestException('Contrato cancelado.');
      const pending = contracts.filter(c => c.paymentStatus === 'pending');
      if (!pending.length) return; // Already received: preserve its date and methods.
      const total = pending.reduce((sum, c) => sum + moneyCents(Number(c.finalPrice)), 0) / 100;
      const payments = normalizePackagePayments(body?.payments, total, body?.paymentMethod || 'pix');
      const allocations = allocatePackagePayments(payments, pending.map(c => Number(c.finalPrice)));
      const receivedAt = new Date();
      for (const [index, contract] of pending.entries()) {
        const item = contract.items[0];
        if (!item) throw new BadRequestException('Contrato sem itens de saldo.');
        await tx.customerPetPackage.update({ where: { id: contract.id }, data: {
          paymentStatus: 'paid', paymentMethod: allocations[index].length > 1 ? 'mixed' : allocations[index][0]?.method || 'pix',
          notes: receiptNotes(contract.notes, { receivedAt: receivedAt.toISOString(), payments: allocations[index] }),
        } });
        await tx.customerPetPackageLedger.create({ data: {
          idempotencyKey: `payment:${contract.id}`, customerPackageId: contract.id, customerPackageItemId: item.id,
          eventType: 'PAYMENT_RECEIVED', quantityDelta: 0, balanceAfter: item.availableQuantity,
          usedAfter: item.usedQuantity, reservedAfter: item.reservedQuantity, createdAt: receivedAt,
          reason: 'Recebimento confirmado diretamente no Pet Shop',
        } });
        // Prevent a second charge through the old pending checkout.
        if (contract.comandaId) await tx.comanda.updateMany({ where: { id: contract.comandaId, status: { in: ['open', 'waiting_payment'] }, saleId: null }, data: { status: 'cancelled' } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return this.getContractById(contractId);
  }

  // ===========================================================================
  // 3. CONTROLE TRANSACIONAL DE SESSÕES (RESERVA, CONSUMO, LIBERAÇÃO E ESTORNO)
  // ===========================================================================

  /**
   * Reserva sessões de pacotes ao agendar um atendimento.
   * Utiliza lock pessimista FOR UPDATE na linha do item de saldo para impedir saldo negativo.
   */
  async reserveSessionsForAppointmentInTx(
    tx: any,
    params: {
      appointmentId: string;
      petId: string;
      customerId: string;
      startsAt: Date;
      packageSelections: Record<string, string>; // { [serviceId]: customerPackageId }
      allowPendingPayment?: boolean; // Somente para sessões criadas na própria transação do contrato.
      actor?: PackageActor;
    },
  ) {
    const entries = Object.entries(params.packageSelections || {}).filter(
      ([, pkgId]) => Boolean(pkgId && pkgId !== 'none'),
    );
    if (!entries.length) return [];

    const reservedResults: Array<{
      serviceId: string;
      customerPackageId: string;
      customerPackageItemId: string;
    }> = [];

    for (const [serviceId, customerPackageId] of entries) {
      const idempotencyKey = `reserve:${params.appointmentId}:${serviceId}`;
      const existingLedger = await tx.customerPetPackageLedger.findUnique({
        where: { idempotencyKey },
      });
      if (existingLedger) continue;

      const appSvc = await tx.petAppointmentService.findFirst({
        where: { appointmentId: params.appointmentId, serviceId },
      });
      if (!appSvc) throw new BadRequestException('O serviço do pacote não pertence ao agendamento.');

      const contractRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, customerId, petId, isShared, status, paymentStatus, expiresAt, planNameSnapshot, notes
                   FROM customer_pet_packages
                   WHERE id = ${customerPackageId}
                   FOR UPDATE`,
      );
      if (!contractRows.length) {
        throw new NotFoundException('Pacote selecionado não encontrado.');
      }
      const contract = contractRows[0];

      if (contract.customerId !== params.customerId) {
        throw new BadRequestException('Este pacote pertence a outro tutor.');
      }
      if (!contract.isShared && contract.petId && contract.petId !== params.petId) {
        throw new BadRequestException(
          `O pacote "${contract.planNameSnapshot}" é exclusivo de outro pet e não está marcado como compartilhado.`,
        );
      }
      if (contract.isShared) {
        const enrichedMeta = this.enrichContractTransport(contract);
        if (
          Array.isArray(enrichedMeta.allowedPetIds) &&
          enrichedMeta.allowedPetIds.length > 0 &&
          !enrichedMeta.allowedPetIds.includes(params.petId)
        ) {
          throw new BadRequestException(
            `O pacote "${contract.planNameSnapshot}" está restrito a outros pets deste tutor.`,
          );
        }
      }
      if (contract.status !== 'active') {
        throw new BadRequestException(`O pacote "${contract.planNameSnapshot}" não está ativo (status: ${contract.status}).`);
      }
      if (contract.paymentStatus !== 'paid' && !(params.allowPendingPayment && contract.paymentStatus === 'pending')) {
        throw new BadRequestException(`O pacote "${contract.planNameSnapshot}" ainda não está pago.`);
      }
      if (new Date(contract.expiresAt) < params.startsAt) {
        throw new BadRequestException(
          `O pacote "${contract.planNameSnapshot}" vence em ${new Date(contract.expiresAt).toLocaleDateString('pt-BR')} (antes da data do agendamento).`,
        );
      }

      const itemRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, totalQuantity, reservedQuantity, usedQuantity, availableQuantity, serviceNameSnapshot
                   FROM customer_pet_package_items
                   WHERE customerPackageId = ${customerPackageId} AND serviceId = ${serviceId}
                   FOR UPDATE`,
      );
      if (!itemRows.length) {
        throw new BadRequestException(
          `O pacote "${contract.planNameSnapshot}" não cobre o serviço selecionado.`,
        );
      }
      const pkgItem = itemRows[0];
      const available = Number(pkgItem.totalQuantity) - Number(pkgItem.usedQuantity) - Number(pkgItem.reservedQuantity);
      if (available < 1) {
        throw new ConflictException(
          `Sem saldo disponível para "${pkgItem.serviceNameSnapshot}" no pacote "${contract.planNameSnapshot}".`,
        );
      }

      const nextReserved = Number(pkgItem.reservedQuantity) + 1;
      const nextAvailable = Number(pkgItem.totalQuantity) - Number(pkgItem.usedQuantity) - nextReserved;

      await tx.customerPetPackageItem.update({
        where: { id: pkgItem.id },
        data: {
          reservedQuantity: nextReserved,
          availableQuantity: nextAvailable,
        },
      });

      await tx.petAppointmentService.update({
        where: { id: appSvc.id },
        data: {
          customerPackageId,
          customerPackageItemId: pkgItem.id,
          coverageStatus: 'reserved',
          coveredAmount: appSvc.priceSnapshot,
        },
      });

      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey,
          customerPackageId,
          customerPackageItemId: pkgItem.id,
          appointmentId: params.appointmentId,
          petId: params.petId,
          eventType: 'RESERVE',
          quantityDelta: -1,
          balanceAfter: nextAvailable,
          usedAfter: Number(pkgItem.usedQuantity),
          reservedAfter: nextReserved,
          operatorId: params.actor?.operatorId || params.actor?.userId || null,
          operatorName: params.actor?.name || null,
          reason: `Sessão reservada no agendamento`,
        },
      });

      reservedResults.push({
        serviceId,
        customerPackageId,
        customerPackageItemId: pkgItem.id,
      });
    }

    return reservedResults;
  }

  /**
   * Converte reservas em consumo efetivo quando o atendimento é concluído (ready ou delivered).
   * Idempotente e transacional.
   */
  async consumeReservedSessionsForAppointmentInTx(
    tx: any,
    appointmentId: string,
    actor?: PackageActor,
  ): Promise<{
    consumedItems: Array<{
      customerPackageId: string;
      customerPackageItemId: string;
      serviceName: string;
      remainingAvailable: number;
      totalQuantity: number;
      usedQuantity: number;
    }>;
  }> {
    const appointment = await tx.petAppointment.findUnique({
      where: { id: appointmentId },
      include: { services: true },
    });
    if (!appointment) return { consumedItems: [] };

    const consumedItems: Array<{
      customerPackageId: string;
      customerPackageItemId: string;
      serviceName: string;
      remainingAvailable: number;
      totalQuantity: number;
      usedQuantity: number;
    }> = [];

    const touchedContracts = new Set<string>();

    for (const svc of appointment.services) {
      if (svc.coverageStatus !== 'reserved' || !svc.customerPackageItemId || !svc.customerPackageId) {
        continue;
      }

      const idempotencyKey = `consume:${appointmentId}:${svc.serviceId}`;
      const alreadyConsumed = await tx.customerPetPackageLedger.findUnique({
        where: { idempotencyKey },
      });
      if (alreadyConsumed) {
        continue;
      }

      const itemRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, customerPackageId, totalQuantity, reservedQuantity, usedQuantity, availableQuantity, serviceNameSnapshot
                   FROM customer_pet_package_items
                   WHERE id = ${svc.customerPackageItemId}
                   FOR UPDATE`,
      );
      if (!itemRows.length) continue;
      const pkgItem = itemRows[0];

      const nextReserved = Math.max(0, Number(pkgItem.reservedQuantity) - 1);
      const nextUsed = Number(pkgItem.usedQuantity) + 1;
      if (nextUsed > Number(pkgItem.totalQuantity)) {
        throw new ConflictException(
          `Saldo insuficiente no pacote para concluir consumo de "${pkgItem.serviceNameSnapshot}".`,
        );
      }
      const nextAvailable = Math.max(0, Number(pkgItem.totalQuantity) - nextUsed - nextReserved);

      await tx.customerPetPackageItem.update({
        where: { id: pkgItem.id },
        data: {
          reservedQuantity: nextReserved,
          usedQuantity: nextUsed,
          availableQuantity: nextAvailable,
        },
      });

      await tx.petAppointmentService.update({
        where: { id: svc.id },
        data: {
          coverageStatus: 'consumed',
          coveredAmount: svc.priceSnapshot,
        },
      });

      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey,
          customerPackageId: svc.customerPackageId,
          customerPackageItemId: pkgItem.id,
          appointmentId,
          petId: appointment.petId,
          eventType: 'CONSUME',
          quantityDelta: 0,
          balanceAfter: nextAvailable,
          usedAfter: nextUsed,
          reservedAfter: nextReserved,
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: `Sessão efetivada na conclusão do atendimento`,
        },
      });

      touchedContracts.add(svc.customerPackageId);
      consumedItems.push({
        customerPackageId: svc.customerPackageId,
        customerPackageItemId: pkgItem.id,
        serviceName: pkgItem.serviceNameSnapshot,
        remainingAvailable: nextAvailable,
        totalQuantity: Number(pkgItem.totalQuantity),
        usedQuantity: nextUsed,
      });
    }

    for (const contractId of touchedContracts) {
      const allItems = await tx.customerPetPackageItem.findMany({
        where: { customerPackageId: contractId },
      });
      const allCompleted =
        allItems.length > 0 &&
        allItems.every(
          (i: any) =>
            Number(i.usedQuantity) >= Number(i.totalQuantity) && Number(i.reservedQuantity) === 0,
        );
      if (allCompleted) {
        await tx.customerPetPackage.update({
          where: { id: contractId },
          data: { status: 'completed' },
        });
      }
    }

    return { consumedItems };
  }

  /**
   * Libera reservas de sessões caso um agendamento seja cancelado ou marcado como falta (no_show) antes da conclusão.
   */
  async releaseReservedSessionsForAppointmentInTx(
    tx: any,
    appointmentId: string,
    reason: string,
    actor?: PackageActor,
  ) {
    const appointment = await tx.petAppointment.findUnique({
      where: { id: appointmentId },
      include: { services: true },
    });
    if (!appointment) return;

    for (const svc of appointment.services) {
      if (svc.coverageStatus !== 'reserved' || !svc.customerPackageItemId || !svc.customerPackageId) {
        continue;
      }

      const idempotencyKey = `release:${appointmentId}:${svc.serviceId}`;
      const existingRelease = await tx.customerPetPackageLedger.findUnique({
        where: { idempotencyKey },
      });
      if (existingRelease) continue;

      const itemRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, totalQuantity, reservedQuantity, usedQuantity, availableQuantity
                   FROM customer_pet_package_items
                   WHERE id = ${svc.customerPackageItemId}
                   FOR UPDATE`,
      );
      if (!itemRows.length) continue;
      const pkgItem = itemRows[0];

      const nextReserved = Math.max(0, Number(pkgItem.reservedQuantity) - 1);
      const nextAvailable = Math.max(
        0,
        Number(pkgItem.totalQuantity) - Number(pkgItem.usedQuantity) - nextReserved,
      );

      await tx.customerPetPackageItem.update({
        where: { id: pkgItem.id },
        data: {
          reservedQuantity: nextReserved,
          availableQuantity: nextAvailable,
        },
      });

      await tx.petAppointmentService.update({
        where: { id: svc.id },
        data: {
          coverageStatus: 'released',
          coveredAmount: new Prisma.Decimal(0),
        },
      });

      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey,
          customerPackageId: svc.customerPackageId,
          customerPackageItemId: pkgItem.id,
          appointmentId,
          petId: appointment.petId,
          eventType: 'RELEASE_RESERVATION',
          quantityDelta: 1,
          balanceAfter: nextAvailable,
          usedAfter: Number(pkgItem.usedQuantity),
          reservedAfter: nextReserved,
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: reason || 'Cancelamento / Não comparecimento no agendamento',
        },
      });
    }
  }

  /**
   * Estorno auditável de sessão já consumida (Requisito 3.4).
   * Não apaga histórico: insere lançamento compensatório REFUND e recompõe o saldo.
   */
  async refundConsumedSession(
    contractId: string,
    body: {
      packageItemId: string;
      appointmentId?: string;
      reason: string;
    },
    actor?: PackageActor,
  ) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 3 || reason.length > 500) {
      throw new BadRequestException('Informe o motivo do estorno (entre 3 e 500 caracteres).');
    }
    const packageItemId = String(body?.packageItemId ?? '').trim();
    if (!packageItemId) {
      throw new BadRequestException('Informe o item do pacote a ser estornado.');
    }

    if (!body.appointmentId) throw new BadRequestException('Selecione a sessão consumida que deseja estornar.');
    const prisma = await this.prisma();
    await prisma.$transaction(async tx => {
      const contractRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, status, expiresAt FROM customer_pet_packages WHERE id = ${contractId} FOR UPDATE`,
      );
      if (!contractRows.length) throw new NotFoundException('Contrato não encontrado.');
      const contract = contractRows[0];
      if (contract.status === 'cancelled') throw new BadRequestException('Contrato cancelado.');

      const itemRows: any[] = await tx.$queryRaw(
        Prisma.sql`SELECT id, customerPackageId, serviceId, totalQuantity, reservedQuantity, usedQuantity, availableQuantity
                   FROM customer_pet_package_items
                   WHERE id = ${packageItemId} AND customerPackageId = ${contractId}
                   FOR UPDATE`,
      );
      if (!itemRows.length) throw new NotFoundException('Item de saldo não encontrado neste contrato.');
      const pkgItem = itemRows[0];

      if (Number(pkgItem.usedQuantity) < 1) {
        throw new BadRequestException('Não há sessões consumidas neste item para estornar.');
      }

      {
        const changed = await tx.petAppointmentService.updateMany({
          where: {
            appointmentId: body.appointmentId,
            customerPackageItemId: pkgItem.id,
            coverageStatus: 'consumed',
          },
          data: {
            coverageStatus: 'refunded',
            coveredAmount: new Prisma.Decimal(0),
          },
        });
        if (changed.count !== 1) throw new ConflictException('Esta sessão já foi estornada ou não está consumida neste pacote.');
      }


      const nextUsed = Number(pkgItem.usedQuantity) - 1;
      const nextAvailable =
        Number(pkgItem.totalQuantity) - nextUsed - Number(pkgItem.reservedQuantity);

      await tx.customerPetPackageItem.update({
        where: { id: pkgItem.id },
        data: {
          usedQuantity: nextUsed,
          availableQuantity: nextAvailable,
        },
      });

      if (contract.status === 'completed' && new Date(contract.expiresAt) >= new Date()) {
        await tx.customerPetPackage.update({
          where: { id: contractId },
          data: { status: 'active' },
        });
      }

      const idempotencyKey = `refund:${body.appointmentId}:${pkgItem.id}`;

      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey,
          customerPackageId: contractId,
          customerPackageItemId: pkgItem.id,
          appointmentId: body.appointmentId || null,
          eventType: 'REFUND',
          quantityDelta: 1,
          balanceAfter: nextAvailable,
          usedAfter: nextUsed,
          reservedAfter: Number(pkgItem.reservedQuantity),
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason,
        },
      });

    });
    return this.getContractById(contractId);
  }

  async cancelContract(contractId: string, body: { reason: string }, actor?: PackageActor) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Informe o motivo do cancelamento (mínimo 3 caracteres).');
    }
    const prisma = await this.prisma();

    return prisma.$transaction(async tx => {
      const contract = await tx.customerPetPackage.findUnique({
        where: { id: contractId },
        include: { items: true },
      });
      if (!contract) throw new NotFoundException('Contrato não encontrado.');
      if (contract.status === 'cancelled') {
        throw new BadRequestException('Este contrato já está cancelado.');
      }

      for (const item of contract.items) {
        await tx.customerPetPackageItem.update({
          where: { id: item.id },
          data: {
            reservedQuantity: 0,
            availableQuantity: 0,
          },
        });

        await tx.customerPetPackageLedger.create({
          data: {
            idempotencyKey: `cancel:${contract.id}:${item.id}`,
            customerPackageId: contract.id,
            customerPackageItemId: item.id,
            eventType: 'CANCEL',
            quantityDelta: -item.availableQuantity,
            balanceAfter: 0,
            usedAfter: item.usedQuantity,
            reservedAfter: 0,
            operatorId: actor?.operatorId || actor?.userId || null,
            operatorName: actor?.name || null,
            reason,
          },
        });
      }

      await tx.petAppointmentService.updateMany({
        where: {
          customerPackageId: contractId,
          coverageStatus: 'reserved',
        },
        data: {
          coverageStatus: 'released',
          coveredAmount: new Prisma.Decimal(0),
        },
      });

      return tx.customerPetPackage.update({
        where: { id: contractId },
        data: {
          status: 'cancelled',
          paymentStatus: contract.paymentStatus === 'pending' ? 'cancelled' : contract.paymentStatus,
          cancelledAt: new Date(),
          cancelReason: reason,
          cancelledByName: actor?.name || 'Operador',
        },
        include: {
          customer: true,
          pet: true,
          items: { include: { service: true } },
          ledgerEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      });
    });
  }

  // ===========================================================================
  // 4. GESTÃO FINANCEIRA E INDICADORES DE RENOVAÇÃO (SEÇÃO 4.3)
  // ===========================================================================

  async getFinancialOverview() {
    const prisma = await this.prisma();
    await this.expireOverdueContracts(prisma);

    const contracts = await prisma.customerPetPackage.findMany({
      where: { status: { not: 'cancelled' } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true } },
        items: true,
      },
      orderBy: { expiresAt: 'asc' },
    });

    let totalSoldPaid = 0;
    let totalSoldPending = 0;
    let totalSessionsContracted = 0;
    let totalSessionsUsed = 0;
    let totalSessionsReserved = 0;
    let totalSessionsAvailable = 0;
    let recognizedRevenue = 0;
    let deferredRevenue = 0;

    const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000);
    const renewalOpportunities: any[] = [];

    for (const c of contracts) {
      const price = Number(c.finalPrice || 0);
      if (c.paymentStatus === 'paid') {
        totalSoldPaid += price;
      } else if (c.paymentStatus === 'pending') {
        totalSoldPending += price;
      }

      let contractAvailable = 0;
      let contractTotal = 0;
      let contractUsed = 0;

      for (const item of c.items) {
        totalSessionsContracted += item.totalQuantity;
        totalSessionsUsed += item.usedQuantity;
        totalSessionsReserved += item.reservedQuantity;
        totalSessionsAvailable += item.availableQuantity;

        contractTotal += item.totalQuantity;
        contractAvailable += item.availableQuantity;

        contractUsed += item.usedQuantity;
      }

      const contractCents = Math.round(price * 100);
      const recognizedCents = contractTotal ? Math.round(contractCents * Math.min(contractUsed, contractTotal) / contractTotal) : 0;
      recognizedRevenue += recognizedCents / 100;
      deferredRevenue += (contractCents - recognizedCents) / 100;

      const isExpiringSoon = c.status === 'active' && new Date(c.expiresAt) <= sevenDaysFromNow;
      const isLastSession = c.status === 'active' && contractTotal - contractUsed <= 1;

      if (isExpiringSoon || isLastSession) {
        renewalOpportunities.push({
          contractId: c.id,
          packagePlanId: c.packagePlanId,
          isShared: c.isShared,
          planName: c.planNameSnapshot,
          customer: c.customer,
          pet: c.pet,
          expiresAt: c.expiresAt,
          availableSessions: contractAvailable,
          totalSessions: contractTotal,
          reason: isLastSession ? 'LAST_SESSION' : 'EXPIRING_SOON',
        });
      }
    }

    return {
      totals: {
        activeContractsCount: contracts.filter(c => c.status === 'active').length,
        totalSoldPaid: Number(totalSoldPaid.toFixed(2)),
        totalSoldPending: Number(totalSoldPending.toFixed(2)),
        totalSessionsContracted,
        totalSessionsUsed,
        totalSessionsReserved,
        totalSessionsAvailable,
        recognizedRevenue: Number(recognizedRevenue.toFixed(2)),
        deferredRevenue: Number(deferredRevenue.toFixed(2)),
      },
      renewalOpportunities,
    };
  }
}
