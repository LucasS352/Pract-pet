import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { hasTaxiDropoff, hasTaxiPickup, parseAppointmentTransport, type TaxiMode } from './petshop-transport';
import { allocatePackageDiscount, allocatePackagePayments, contractMetadata, moneyCents, normalizePackagePayments, packageReceivedAmount, receiptNotes } from './package-receipts';
import { readTaxiDefaultFee } from './taxi-default-fee';
import { PetshopCommissionsService } from './petshop-commissions.service';
import { PetshopPricingService } from './petshop-pricing.service';
import {
  buildPastSessionStageHistory,
  enrichAppointmentHistory,
  resolveChosenServicesStages,
  resolvePrimaryStageOperatorId,
} from './appointment-history.helper';

export const PACKAGE_UPGRADE_SERVICE_ID = 'petshop-package-upgrade-fee';

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
    @Optional() private readonly pricing?: PetshopPricingService,
    @Optional() private readonly heart?: HeartPrismaService,
  ) {}

  private async prisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  private async resolveActor(prisma: any, actor?: PackageActor): Promise<PackageActor | undefined> {
    if (!actor) return undefined;
    const rawName = actor.name ? String(actor.name).trim() : '';
    const looksLikeEmail = rawName.includes('@');
    if (rawName && !looksLikeEmail) return actor;

    if (actor.operatorId && prisma?.operator?.findUnique) {
      try {
        const op = await prisma.operator.findUnique({ where: { id: actor.operatorId }, select: { name: true } });
        if (op?.name) return { ...actor, name: op.name };
      } catch {}
    }
    if (actor.userId && this.heart?.user?.findUnique) {
      try {
        const user = await this.heart.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
        if (user?.name) return { ...actor, name: user.name };
      } catch {}
    }
    return actor;
  }

  private formatSessionDateLabel(dateValue?: Date | string | null): string {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
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
    receipt?: { receivedAt: string; payments: Array<{ method: string; amount: number }>; discountAmount?: number; discountAuthorizedBy?: { userId: string; name?: string } };
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
            customerPackageItem: { select: { id: true, serviceNameSnapshot: true } },
            appointment: { select: { id: true, startsAt: true, status: true } },
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
            customerPackageItem: { select: { id: true, serviceNameSnapshot: true } },
            appointment: {
              select: {
                id: true,
                startsAt: true,
                endsAt: true,
                status: true,
                professional: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato de pacote não encontrado.');
    const visibleCoverageStatuses = contract.status === 'cancelled'
      ? ['reserved', 'consumed', 'released']
      : ['reserved', 'consumed'];
    const rawScheduledAppointments = await prisma.petAppointment.findMany({
      where: {
        services: {
          some: {
            customerPackageId: id,
            coverageStatus: { in: visibleCoverageStatuses },
          },
        },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        checkedInAt: true,
        readyAt: true,
        completedAt: true,
        stageNotes: true,
        stagePhotoUrl: true,
        customStages: true,
        notes: true,
        updatedAt: true,
        stageHistory: true,
        professional: { select: { id: true, name: true } },
        pet: { select: { id: true, name: true, species: true, size: true, coatType: true } },
        services: {
          where: {
            customerPackageId: id,
            coverageStatus: { in: visibleCoverageStatuses },
          },
          select: {
            id: true,
            serviceId: true,
            nameSnapshot: true,
            priceSnapshot: true,
            coverageStatus: true,
            customerPackageItemId: true,
            service: { select: { id: true, name: true, category: true, customStages: true } },
          },
        },
        commissions: {
          where: { state: { not: 'REVERSED' } },
          select: { stageKey: true, executedAt: true, operator: { select: { id: true, name: true } } },
          orderBy: { executedAt: 'asc' },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
    const pendingByAppointment = new Map<string, { pendingUpgradeTotal: number; pendingExtraTotal: number }>();
    const aptIds = (Array.isArray(rawScheduledAppointments) ? rawScheduledAppointments : []).map((a: any) => a.id).filter(Boolean);
    if (aptIds.length > 0 && typeof prisma.petAppointmentService?.findMany === 'function') {
      const unpaidRows = await prisma.petAppointmentService.findMany({
        where: {
          appointmentId: { in: aptIds },
          comboParentId: null,
          chargedSaleId: null,
          coverageStatus: { notIn: ['reserved', 'consumed'] },
        },
        select: {
          appointmentId: true,
          serviceId: true,
          priceSnapshot: true,
          coveredAmount: true,
        },
      });
      for (const row of unpaidRows) {
        const net = Math.max(0, Number(row.priceSnapshot || 0) - Number(row.coveredAmount || 0));
        if (net <= 0) continue;
        const curr = pendingByAppointment.get(row.appointmentId) || { pendingUpgradeTotal: 0, pendingExtraTotal: 0 };
        curr.pendingExtraTotal = Math.round((curr.pendingExtraTotal + net) * 100) / 100;
        if (row.serviceId === PACKAGE_UPGRADE_SERVICE_ID) {
          curr.pendingUpgradeTotal = Math.round((curr.pendingUpgradeTotal + net) * 100) / 100;
        }
        pendingByAppointment.set(row.appointmentId, curr);
      }
    }
    const scheduledAppointments = (Array.isArray(rawScheduledAppointments) ? rawScheduledAppointments : []).map(
      (apt: any) => {
        const pendingInfo = pendingByAppointment.get(apt.id);
        return {
          ...enrichAppointmentHistory(apt, this.pricing),
          ...(pendingInfo
            ? {
                pendingUpgradeTotal: pendingInfo.pendingUpgradeTotal,
                pendingExtraTotal: pendingInfo.pendingExtraTotal,
              }
            : {}),
        };
      },
    );
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
    const professionals = [...new Set(params.scheduledSessions.map(s => s.professionalId).filter((id): id is string => Boolean(id) && id !== 'none'))].sort();
    for (const id of professionals) {
      const rows: any[] = await tx.$queryRaw(Prisma.sql`SELECT id FROM operators WHERE id = ${id} AND active = 1 FOR UPDATE`);
      if (!rows.length) throw new BadRequestException('Profissional inválido para a sessão.');
    }
    const remainingCountByService = new Map<string, number>();
    for (const pi of params.plan.items) {
      remainingCountByService.set(pi.serviceId, Number(pi.quantity));
    }

    const stageOperatorIds = new Set<string>(professionals);
    for (const sess of params.scheduledSessions) {
      if (sess?.stageOperators && typeof sess.stageOperators === 'object') {
        for (const opId of Object.values(sess.stageOperators)) {
          if (opId && opId !== 'none') stageOperatorIds.add(String(opId));
        }
      }
    }
    const operatorMap = new Map<string, { id: string; name: string }>();
    if (stageOperatorIds.size > 0 && tx.operator?.findMany) {
      const opRows: Array<{ id: string; name: string }> = await tx.operator.findMany({
        where: { id: { in: [...stageOperatorIds] } },
        select: { id: true, name: true },
      });
      for (const op of opRows) {
        operatorMap.set(op.id, op);
      }
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

      const resolvedStages = resolveChosenServicesStages(chosenServices, this.pricing);
      const effectiveProfessionalId = isSessionCompleted
        ? resolvePrimaryStageOperatorId(sess.professionalId, sess.stageOperators)
        : sess.professionalId && sess.professionalId !== 'none'
          ? String(sess.professionalId)
          : null;

      const stageHistory = isSessionCompleted
        ? buildPastSessionStageHistory({
            resolvedStages,
            startsAt: sessStart,
            endsAt: sessEnd,
            stageOperators: sess.stageOperators,
            operatorMap,
            fallbackOperatorId: sess.professionalId && sess.professionalId !== 'none' ? String(sess.professionalId) : null,
            actor: params.actor,
            notes: `Sessão ${idx + 1} concluída na contratação do pacote ${params.plan.name}`,
          })
        : [
            {
              status: 'scheduled',
              label: 'Agendado',
              at: new Date().toISOString(),
              photoUrl: null,
              notes: `Sessão ${idx + 1} agendada automaticamente no pacote ${params.plan.name}`,
              userId: params.actor?.operatorId || params.actor?.userId || null,
              userName: params.actor?.name || null,
              skipped: false,
            },
          ];

      const createdAppt = await tx.petAppointment.create({
        data: {
          petId: sessPetId,
          customerId: params.customerId,
          professionalId: effectiveProfessionalId,
          startsAt: sessStart,
          endsAt: sessEnd,
          status: isSessionCompleted ? 'delivered' : 'scheduled',
          checkedInAt: isSessionCompleted ? sessStart : null,
          readyAt: isSessionCompleted ? sessEnd : null,
          completedAt: isSessionCompleted ? sessEnd : null,
          notes: `Sessão ${idx + 1} do pacote ${params.plan.name}`,
          checkInNotes: appointmentCheckInNotes,
          customStages: resolvedStages,
          stageHistory,
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

  async createContract(data: any, rawActor?: PackageActor) {
    const prisma = await this.prisma();
    const actor = await this.resolveActor(prisma, rawActor);
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

  async confirmContractPayment(contractId: string, body: { paymentMethod?: string; payments?: unknown; saleId?: string; confirmGroup?: boolean; discountAmount?: number; discountPin?: string }, actor?: { userId?: string; name?: string }) {
    const prisma = await this.prisma();
    if (body?.saleId) throw new BadRequestException('Recebimentos pelo PDV devem ser confirmados no Caixa.');
    const discountCents = moneyCents(body?.discountAmount ?? 0, 'Desconto');
    if (discountCents) {
      if (!body?.discountPin) throw new ForbiddenException('Informe o PIN para autorizar o desconto.');
      const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' }, select: { discountPin: true } });
      if (!settings?.discountPin || !await bcrypt.compare(body.discountPin, settings.discountPin)) {
        throw new ForbiddenException('PIN de desconto inválido.');
      }
    }
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
      const grossCents = pending.reduce((sum, c) => sum + moneyCents(Number(c.finalPrice)), 0);
      if (discountCents && discountCents >= grossCents) throw new BadRequestException('O desconto deve ser menor que o valor pendente do pacote.');
      const discounts = allocatePackageDiscount(discountCents / 100, pending.map(c => Number(c.finalPrice)));
      const netTotals = pending.map((contract, index) => (moneyCents(Number(contract.finalPrice)) - moneyCents(discounts[index])) / 100);
      const payments = normalizePackagePayments(body?.payments, (grossCents - discountCents) / 100, body?.paymentMethod || 'pix');
      const allocations = allocatePackagePayments(payments, netTotals);
      const receivedAt = new Date();
      for (const [index, contract] of pending.entries()) {
        const item = contract.items[0];
        if (!item) throw new BadRequestException('Contrato sem itens de saldo.');
        await tx.customerPetPackage.update({ where: { id: contract.id }, data: {
          paymentStatus: 'paid', paymentMethod: allocations[index].length > 1 ? 'mixed' : allocations[index][0]?.method || 'pix',
          notes: receiptNotes(contract.notes, {
            receivedAt: receivedAt.toISOString(), payments: allocations[index],
            ...(discounts[index] > 0 ? {
              discountAmount: discounts[index],
              discountAuthorizedBy: actor?.userId ? { userId: actor.userId, ...(actor.name ? { name: actor.name } : {}) } : undefined,
            } : {}),
          }),
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

      const reserveDateLabel = this.formatSessionDateLabel(params.startsAt);
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
          reason: reserveDateLabel
            ? `Sessão reservada: ${pkgItem.serviceNameSnapshot} (${reserveDateLabel})`
            : `Sessão reservada: ${pkgItem.serviceNameSnapshot}`,
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

      const consumeDateLabel = this.formatSessionDateLabel(appointment.startsAt);
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
          reason: consumeDateLabel
            ? `Sessão efetivada na conclusão do atendimento: ${pkgItem.serviceNameSnapshot} (${consumeDateLabel})`
            : `Sessão efetivada na conclusão do atendimento: ${pkgItem.serviceNameSnapshot}`,
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
  async releaseSingleReservedServiceInTx(
    tx: any,
    appointmentId: string,
    petId: string,
    svc: { id: string; serviceId: string; customerPackageId: string | null; customerPackageItemId: string | null; coverageStatus: string },
    reason: string,
    actor?: PackageActor,
    keyPrefix = 'release-svc',
  ) {
    if (svc.coverageStatus !== 'reserved' || !svc.customerPackageItemId || !svc.customerPackageId) {
      return;
    }

    const idempotencyKey = keyPrefix === 'release'
      ? `release:${appointmentId}:${svc.serviceId}`
      : `${keyPrefix}:${appointmentId}:${svc.id}`;
    const existingRelease = await tx.customerPetPackageLedger.findUnique({
      where: { idempotencyKey },
    });
    if (existingRelease) return;

    const itemRows: any[] = await tx.$queryRaw(
      Prisma.sql`SELECT id, totalQuantity, reservedQuantity, usedQuantity, availableQuantity
                 FROM customer_pet_package_items
                 WHERE id = ${svc.customerPackageItemId}
                 FOR UPDATE`,
    );
    if (!itemRows.length) return;
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
        petId,
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
      await this.releaseSingleReservedServiceInTx(
        tx,
        appointmentId,
        appointment.petId,
        svc,
        reason,
        actor,
        'release',
      );
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
    const resolvedActor = await this.resolveActor(prisma, actor);
    actor = resolvedActor;
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

  async cancelContract(
    contractId: string,
    body: { reason: string; keepScheduledAppointments?: boolean },
    actor?: PackageActor,
  ) {
    const reason = String(body?.reason ?? '').trim();
    if (reason.length < 3) {
      throw new BadRequestException('Informe o motivo do cancelamento (mínimo 3 caracteres).');
    }
    const keepScheduledAppointments = body?.keepScheduledAppointments === true;
    const prisma = await this.prisma();
    const resolvedActor = await this.resolveActor(prisma, actor);
    actor = resolvedActor;

    return prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM customer_pet_packages WHERE id = ${contractId} FOR UPDATE`;
      }
      const contract = await tx.customerPetPackage.findUnique({
        where: { id: contractId },
        include: { items: true },
      });
      if (!contract) throw new NotFoundException('Contrato não encontrado.');
      if (contract.status === 'cancelled') {
        throw new BadRequestException('Este contrato já está cancelado.');
      }

      const cancelledAt = new Date();

      if (contract.comandaId && tx.comanda?.updateMany) {
        await tx.comanda.updateMany({
          where: { id: contract.comandaId, status: { in: ['open', 'waiting_payment'] } },
          data: { status: 'cancelled' },
        });
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

      let cancelledAppointmentsCount = 0;
      let skippedAppointmentsCount = 0;
      if (!keepScheduledAppointments && typeof tx.petAppointment?.findMany === 'function') {
        const candidateAppointments = await tx.petAppointment.findMany({
          where: {
            status: { in: ['requested', 'scheduled', 'confirmed'] },
            services: {
              some: {
                customerPackageId: contractId,
                coverageStatus: 'reserved',
              },
            },
          },
          include: {
            services: {
              select: {
                id: true,
                customerPackageId: true,
                coverageStatus: true,
                chargedSaleId: true,
              },
            },
          },
        });

        const cancelNote = `Cancelado automaticamente junto ao pacote: ${reason}`;
        for (const apt of candidateAppointments) {
          const hasOtherActivePackage = Array.isArray(apt.services) && apt.services.some(
            (svc: any) =>
              svc.customerPackageId &&
              svc.customerPackageId !== contractId &&
              svc.coverageStatus === 'reserved',
          );
          const hasChargedService = Array.isArray(apt.services) && apt.services.some(
            (svc: any) => Boolean(svc.chargedSaleId),
          );
          const hasPaidComanda = typeof tx.comanda?.findFirst === 'function'
            ? Boolean(
                await tx.comanda.findFirst({
                  where: {
                    notes: { contains: apt.id },
                    status: 'closed',
                    sale: { is: { status: 'completed' } },
                  },
                  select: { id: true },
                }),
              )
            : false;

          if (hasOtherActivePackage || hasChargedService || hasPaidComanda) {
            skippedAppointmentsCount += 1;
            continue;
          }

          if (this.commissions?.reverseAppointmentInTx) {
            await this.commissions.reverseAppointmentInTx(
              tx,
              apt.id,
              actor?.operatorId || actor?.userId || 'system',
              cancelNote,
            );
          }

          if (typeof tx.comanda?.findMany === 'function' && typeof tx.comanda?.update === 'function') {
            const openAptComandas = await tx.comanda.findMany({
              where: {
                status: { in: ['open', 'waiting_payment'] },
                notes: { contains: apt.id },
              },
            });
            for (const cmd of openAptComandas) {
              await tx.comanda.update({
                where: { id: cmd.id },
                data: {
                  status: 'cancelled',
                  notes: `${cmd.notes || ''} [Comanda cancelada junto ao pacote ${contractId}]`.trim(),
                },
              });
            }
          }

          const existingHistory = Array.isArray(apt.stageHistory) ? (apt.stageHistory as any[]) : [];
          await tx.petAppointment.update({
            where: { id: apt.id },
            data: {
              status: 'cancelled',
              stageHistory: [
                ...existingHistory,
                {
                  status: 'cancelled',
                  kind: 'package_cancelled',
                  label: 'Cancelado junto ao pacote',
                  at: cancelledAt.toISOString(),
                  notes: cancelNote,
                  userId: actor?.userId || null,
                  userName: actor?.name || 'Operador',
                  operatorId: actor?.operatorId || null,
                  operatorName: actor?.name || null,
                  skipped: false,
                },
              ],
            },
          });
          cancelledAppointmentsCount += 1;
        }
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

      const updatedContract = await tx.customerPetPackage.update({
        where: { id: contractId },
        data: {
          status: 'cancelled',
          paymentStatus: contract.paymentStatus === 'pending' ? 'cancelled' : contract.paymentStatus,
          cancelledAt,
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

      return {
        ...updatedContract,
        cancelledAppointmentsCount,
        skippedAppointmentsCount,
        keptScheduledAppointments: keepScheduledAppointments,
      };
    });
  }

  async ensurePackageUpgradeBackingInTx(tx: any) {
    await tx.petService.upsert({
      where: { id: PACKAGE_UPGRADE_SERVICE_ID },
      update: {
        active: false,
        customStages: ['checked_in', 'ready'],
      },
      create: {
        id: PACKAGE_UPGRADE_SERVICE_ID,
        name: 'Diferença / Adicional de Pacote',
        serviceType: 'INDIVIDUAL',
        category: 'Ajuste de Pacote',
        targetSpecies: 'all',
        durationMinutes: 0,
        price: new Prisma.Decimal(0),
        active: false,
        customStages: ['checked_in', 'ready'],
      },
    });

    let servicosCat = await tx.category.findFirst({ where: { name: 'Serviços' } });
    if (!servicosCat) {
      servicosCat = await tx.category.create({ data: { name: 'Serviços' } });
    }

    await tx.product.upsert({
      where: { id: PACKAGE_UPGRADE_SERVICE_ID },
      update: {
        name: 'Diferença / Adicional de Pacote',
        active: true,
        categoryId: servicosCat.id,
      },
      create: {
        id: PACKAGE_UPGRADE_SERVICE_ID,
        name: 'Diferença / Adicional de Pacote',
        priceSell: new Prisma.Decimal(0),
        priceCost: new Prisma.Decimal(0),
        stock: new Prisma.Decimal(99999),
        unit: 'SV',
        active: true,
        categoryId: servicosCat.id,
        emiteNfce: false,
      },
    });
  }

  async appendPendingContractValueInTx(
    tx: any,
    params: {
      contract: {
        id: string;
        customerId: string;
        status: string;
        paymentStatus: string;
        basePriceSnapshot: any;
        finalPrice: any;
        comandaId?: string | null;
        notes?: string | null;
        items?: any[];
      };
      amountCents: number;
      description: string;
      appointmentId?: string | null;
      petId?: string | null;
      ledgerItemId?: string | null;
      actor?: PackageActor;
      idempotencySuffix?: string;
    },
  ) {
    const { contract, amountCents, description } = params;
    if (amountCents <= 0) return;
    if (contract.status !== 'active') {
      throw new BadRequestException('Somente pacotes ativos podem receber acréscimo de valor.');
    }
    if (contract.paymentStatus !== 'pending') {
      throw new BadRequestException('Este pacote já está pago. Use "Cobrar agora" ou "Cobrar na saída".');
    }

    const amountDec = new Prisma.Decimal(amountCents).div(100).toDecimalPlaces(2);
    const nextBase = new Prisma.Decimal(contract.basePriceSnapshot || 0).plus(amountDec).toDecimalPlaces(2);
    const nextFinal = new Prisma.Decimal(contract.finalPrice || 0).plus(amountDec).toDecimalPlaces(2);

    let nextNotes = contract.notes ?? null;
    if (typeof nextNotes === 'string' && nextNotes.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(nextNotes);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.packageGroup) {
          const prevGroupTotal = Number(parsed.packageGroup.totalGroupPrice || 0);
          parsed.packageGroup = {
            ...parsed.packageGroup,
            totalGroupPrice: Number((prevGroupTotal + Number(amountDec)).toFixed(2)),
          };
          nextNotes = JSON.stringify(parsed);
        }
      } catch {}
    }

    await tx.customerPetPackage.update({
      where: { id: contract.id },
      data: {
        basePriceSnapshot: nextBase,
        finalPrice: nextFinal,
        notes: nextNotes,
      },
    });

    if (contract.comandaId && tx.comanda?.findUnique) {
      const cmd = await tx.comanda.findUnique({ where: { id: contract.comandaId } });
      if (cmd && ['open', 'waiting_payment'].includes(cmd.status) && !cmd.saleId) {
        await this.ensurePackageUpgradeBackingInTx(tx);
        await tx.comandaItem.create({
          data: {
            comandaId: cmd.id,
            productId: PACKAGE_UPGRADE_SERVICE_ID,
            quantity: new Prisma.Decimal(1),
            unitPrice: amountDec,
            totalPrice: amountDec,
            notes: description.slice(0, 50),
            stockDeducted: true,
            kdsStatus: 'READY',
          },
        });
        await tx.comanda.update({
          where: { id: cmd.id },
          data: {
            total: new Prisma.Decimal(cmd.total || 0).plus(amountDec).toDecimalPlaces(2),
          },
        });
      }
    }

    const ledgerItem =
      (params.ledgerItemId ? contract.items?.find(i => i.id === params.ledgerItemId) : null) ||
      contract.items?.[0];
    if (ledgerItem) {
      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey: `value-adj:${contract.id}:${params.idempotencySuffix || randomUUID()}`,
          customerPackageId: contract.id,
          customerPackageItemId: ledgerItem.id,
          appointmentId: params.appointmentId || null,
          petId: params.petId || null,
          eventType: 'VALUE_ADJUSTMENT',
          quantityDelta: 0,
          balanceAfter: Number(ledgerItem.availableQuantity || 0),
          usedAfter: Number(ledgerItem.usedQuantity || 0),
          reservedAfter: Number(ledgerItem.reservedQuantity || 0),
          operatorId: params.actor?.operatorId || params.actor?.userId || null,
          operatorName: params.actor?.name || null,
          reason: `${description} (+R$ ${amountDec.toFixed(2)})`,
        },
      });
    }
  }

  private resolveServicePriceAndDurationFallback(service: any, petChar: { species?: string | null; size?: string | null; coatType?: string | null }) {
    if (this.pricing?.resolvePriceAndDuration) {
      return this.pricing.resolvePriceAndDuration(service, petChar);
    }
    return {
      price: Number(service?.price || 0),
      durationMinutes: Math.max(15, Number(service?.durationMinutes || 60)),
      matchedRule: null,
    };
  }

  /**
   * Troca um serviço reservado de pacote em um agendamento por outro serviço do catálogo,
   * ajustando saldo em CustomerPetPackageItem, ledger auditável, etapas (customStages) e diferença financeira opcional.
   */
  async exchangeSessionService(
    contractId: string,
    body: {
      appointmentId: string;
      oldAppointmentServiceId?: string;
      oldServiceId?: string;
      newServiceId: string;
      differenceAmount?: number;
      chargeMode?: 'none' | 'add_to_package' | 'charge_at_checkout' | 'charge_now';
      replaceUnpaidUpgradeFees?: boolean;
      keepPackageValue?: boolean;
      reason?: string;
      commissionRecipientId?: string;
      professionalId?: string;
    },
    rawActor?: PackageActor,
  ) {
    const prisma = await this.prisma();
    const actor = await this.resolveActor(prisma, rawActor);

    const appointmentId = String(body?.appointmentId ?? '').trim();
    const newServiceId = String(body?.newServiceId ?? '').trim();
    const oldAppointmentServiceId = body?.oldAppointmentServiceId ? String(body.oldAppointmentServiceId).trim() : null;
    const oldServiceIdInput = body?.oldServiceId ? String(body.oldServiceId).trim() : null;
    if (!appointmentId) throw new BadRequestException('Informe o atendimento da sessão.');
    if (!newServiceId) throw new BadRequestException('Selecione o novo serviço desejado.');

    const shouldReplaceUnpaidFees = body?.replaceUnpaidUpgradeFees === true;
    const differenceCents = moneyCents(body?.differenceAmount ?? 0, 'Diferença de valor');
    const differenceAmount = differenceCents / 100;
    const requestedChargeMode = String(body?.chargeMode || (differenceCents > 0 ? 'charge_at_checkout' : 'none')).trim();
    if (differenceCents > 0 && !['add_to_package', 'charge_at_checkout', 'charge_now'].includes(requestedChargeMode)) {
      throw new BadRequestException('Modo de cobrança da diferença inválido.');
    }
    const effectiveChargeMode = differenceCents === 0 ? 'none' : (requestedChargeMode as 'add_to_package' | 'charge_at_checkout' | 'charge_now');
    const reason = String(body?.reason ?? '').trim() || 'Troca de serviço no pacote';
    if (reason.length > 500) throw new BadRequestException('Motivo muito longo (máximo 500 caracteres).');

    const [preContract, newService] = await Promise.all([
      prisma.customerPetPackage.findUnique({
        where: { id: contractId },
        select: { id: true, customerId: true, comandaId: true },
      }),
      prisma.petService.findUnique({
        where: { id: newServiceId },
        include: {
          pricingRules: true,
          comboItems: {
            include: { componentService: { include: { pricingRules: true } } },
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    if (!preContract) throw new NotFoundException('Contrato de pacote não encontrado.');
    if (!newService || !newService.active) throw new BadRequestException('Novo serviço inválido ou inativo.');

    const nextProfessionalInput = body?.professionalId ? String(body.professionalId).trim() : null;
    const commissionRecipientInput = body?.commissionRecipientId ? String(body.commissionRecipientId).trim() : null;

    const result = await prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${preContract.customerId} FOR UPDATE`;
        if (preContract.comandaId) {
          await tx.$queryRaw`SELECT id FROM comandas WHERE id = ${preContract.comandaId} FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM customer_pet_packages WHERE id = ${contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM customer_pet_package_items WHERE customerPackageId = ${contractId} ORDER BY id ASC FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM pet_appointments WHERE id = ${appointmentId} FOR UPDATE`;
      }

      const [contract, appointment] = await Promise.all([
        tx.customerPetPackage.findUnique({
          where: { id: contractId },
          include: { items: true },
        }),
        tx.petAppointment.findUnique({
          where: { id: appointmentId },
          include: {
            pet: true,
            services: {
              include: {
                service: {
                  include: {
                    comboItems: { include: { componentService: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

      if (!contract) throw new NotFoundException('Contrato de pacote não encontrado.');
      if (contract.status !== 'active' || contract.paymentStatus === 'cancelled') {
        throw new BadRequestException('Somente pacotes ativos permitem trocar serviços.');
      }
      if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
      if (!['requested', 'scheduled', 'checked_in', 'bathing', 'grooming', 'finishing'].includes(appointment.status)) {
        throw new BadRequestException(
          'Não é possível trocar o serviço após o atendimento ficar pronto ou concluído. Reabra ou estorne a sessão primeiro.',
        );
      }

      const oldAppSvc = (appointment.services || []).find((s: any) =>
        s.customerPackageId === contractId &&
        s.coverageStatus === 'reserved' &&
        !s.comboParentId &&
        (!oldAppointmentServiceId || s.id === oldAppointmentServiceId) &&
        (!oldServiceIdInput || s.serviceId === oldServiceIdInput),
      );

      if (!oldAppSvc) {
        throw new NotFoundException('Serviço reservado deste pacote não encontrado no agendamento.');
      }
      if (oldAppSvc.serviceId === newService.id) {
        throw new BadRequestException('Escolha um serviço diferente do atual.');
      }
      if (
        (appointment.services || []).some(
          (s: any) =>
            s.id !== oldAppSvc.id &&
            s.serviceId === newService.id &&
            ['reserved', 'consumed'].includes(s.coverageStatus),
        )
      ) {
        throw new ConflictException('O serviço escolhido já está coberto por pacote neste mesmo agendamento.');
      }
      if (new Date(contract.expiresAt) < new Date(appointment.startsAt)) {
        throw new BadRequestException('A data da sessão está fora da validade atual do pacote.');
      }

      const oldChildIds = (appointment.services || [])
        .filter((s: any) => s.comboParentId === oldAppSvc.id)
        .map((s: any) => s.id);
      const oldServiceRowIds = [oldAppSvc.id, ...oldChildIds];

      const settledCommission = await tx.petCommission.findFirst({
        where: { appointmentServiceId: { in: oldServiceRowIds }, state: { in: ['APPROVED', 'PAID', 'REVERSED'] } },
        select: { id: true },
      });
      if (settledCommission) {
        throw new ConflictException('Este serviço possui comissão aprovada, paga ou estornada. A troca foi bloqueada para preservar o histórico financeiro.');
      }
      await tx.petCommission.deleteMany({
        where: { appointmentServiceId: { in: oldServiceRowIds }, state: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
      });

      const oldItem =
        contract.items.find((i: any) => i.id === oldAppSvc.customerPackageItemId) ||
        contract.items.find((i: any) => i.serviceId === oldAppSvc.serviceId);
      if (!oldItem || Number(oldItem.totalQuantity) < 1 || Number(oldItem.reservedQuantity) < 1) {
        throw new ConflictException('Saldo reservado insuficiente para trocar este serviço no pacote.');
      }

      const operatorIdsToCheck = [...new Set([nextProfessionalInput, commissionRecipientInput].filter((x): x is string => Boolean(x) && x !== 'none'))].sort();
      const operatorMap = new Map<string, { id: string; name: string; active: boolean }>();
      for (const opId of operatorIdsToCheck) {
        const opRows = typeof tx.$queryRaw === 'function'
          ? await tx.$queryRaw<Array<{ id: string; name: string; active: any }>>(
              Prisma.sql`SELECT id, name, active FROM operators WHERE id = ${opId} FOR UPDATE`,
            )
          : await tx.operator.findMany({ where: { id: opId }, select: { id: true, name: true, active: true } });
        const foundOp = opRows?.[0];
        if (!foundOp || !foundOp.active) {
          throw new BadRequestException('Colaborador selecionado inválido ou inativo.');
        }
        operatorMap.set(foundOp.id, foundOp);
      }

      const swapId = randomUUID();
      const nextOldTotal = Number(oldItem.totalQuantity) - 1;
      const nextOldReserved = Number(oldItem.reservedQuantity) - 1;
      const nextOldAvailable = Math.max(0, nextOldTotal - Number(oldItem.usedQuantity) - nextOldReserved);

      const updatedOldItem = await tx.customerPetPackageItem.update({
        where: { id: oldItem.id },
        data: {
          totalQuantity: nextOldTotal,
          reservedQuantity: nextOldReserved,
          availableQuantity: nextOldAvailable,
        },
      });

      const existingNewItem = contract.items.find((i: any) => i.serviceId === newService.id);
      let updatedNewItem: any;
      if (existingNewItem) {
        const nextNewTotal = Number(existingNewItem.totalQuantity) + 1;
        const nextNewReserved = Number(existingNewItem.reservedQuantity) + 1;
        const nextNewAvailable = Math.max(0, nextNewTotal - Number(existingNewItem.usedQuantity) - nextNewReserved);
        updatedNewItem = await tx.customerPetPackageItem.update({
          where: { id: existingNewItem.id },
          data: {
            totalQuantity: nextNewTotal,
            reservedQuantity: nextNewReserved,
            availableQuantity: nextNewAvailable,
          },
        });
      } else {
        updatedNewItem = await tx.customerPetPackageItem.create({
          data: {
            customerPackageId: contract.id,
            serviceId: newService.id,
            serviceNameSnapshot: newService.name,
            unitValueSnapshot: oldItem.unitValueSnapshot,
            totalQuantity: 1,
            reservedQuantity: 1,
            usedQuantity: 0,
            availableQuantity: 0,
          },
        });
      }

      const swapReason = `${reason}: ${oldAppSvc.nameSnapshot} por ${newService.name}`;
      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey: `swap-out:${swapId}`,
          customerPackageId: contract.id,
          customerPackageItemId: updatedOldItem.id,
          appointmentId,
          petId: appointment.petId,
          eventType: 'SERVICE_SWAP_OUT',
          quantityDelta: -1,
          balanceAfter: nextOldAvailable,
          usedAfter: Number(oldItem.usedQuantity),
          reservedAfter: nextOldReserved,
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: swapReason,
        },
      });
      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey: `swap-in:${swapId}`,
          customerPackageId: contract.id,
          customerPackageItemId: updatedNewItem.id,
          appointmentId,
          petId: appointment.petId,
          eventType: 'SERVICE_SWAP_IN',
          quantityDelta: 1,
          balanceAfter: Number(updatedNewItem.availableQuantity),
          usedAfter: Number(updatedNewItem.usedQuantity),
          reservedAfter: Number(updatedNewItem.reservedQuantity),
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: swapReason,
        },
      });

      const petChar = {
        species: appointment.pet?.species,
        size: appointment.pet?.size,
        coatType: appointment.pet?.coatType,
      };
      const resolvedNew = this.resolveServicePriceAndDurationFallback(newService, petChar);
      const effectiveNewPrice = new Prisma.Decimal(resolvedNew.price).toDecimalPlaces(2);

      const unpaidUpgradeFees = shouldReplaceUnpaidFees
        ? (appointment.services || []).filter(
            (s: any) => s.serviceId === PACKAGE_UPGRADE_SERVICE_ID && !s.chargedSaleId && Number(s.coveredAmount || 0) <= 0,
          )
        : [];
      const unpaidUpgradeFeeIds = unpaidUpgradeFees.map((s: any) => s.id);
      const removedUpgradeTotal = Math.round(
        unpaidUpgradeFees.reduce((sum: number, s: any) => sum + Math.max(0, Number(s.priceSnapshot || 0)), 0) * 100,
      ) / 100;

      if (unpaidUpgradeFeeIds.length > 0) {
        const settledFeeCommission = await tx.petCommission.findFirst({
          where: { appointmentServiceId: { in: unpaidUpgradeFeeIds }, state: { in: ['APPROVED', 'PAID', 'REVERSED'] } },
          select: { id: true },
        });
        if (settledFeeCommission) {
          throw new ConflictException('A diferença anterior possui comissão aprovada, paga ou estornada e não pode ser removida automaticamente.');
        }
        await tx.petCommission.deleteMany({
          where: { appointmentServiceId: { in: unpaidUpgradeFeeIds }, state: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
        });
        await tx.petAppointmentService.deleteMany({
          where: { id: { in: unpaidUpgradeFeeIds }, appointmentId, chargedSaleId: null },
        });
      }

      if (oldChildIds.length) {
        await tx.petAppointmentService.deleteMany({ where: { id: { in: oldChildIds } } });
      }
      await tx.petAppointmentService.delete({ where: { id: oldAppSvc.id } });

      const newAppSvc = await tx.petAppointmentService.create({
        data: {
          appointmentId,
          serviceId: newService.id,
          nameSnapshot: newService.name,
          priceSnapshot: effectiveNewPrice,
          commissionWeightSnapshot: effectiveNewPrice,
          durationMinutes: resolvedNew.durationMinutes,
          customerPackageId: contract.id,
          customerPackageItemId: updatedNewItem.id,
          coverageStatus: 'reserved',
          coveredAmount: effectiveNewPrice,
          isCombo: newService.serviceType === 'COMBO',
        },
      });

      if (newService.serviceType === 'COMBO' && Array.isArray(newService.comboItems)) {
        for (const ci of newService.comboItems) {
          const comp = ci.componentService;
          const qty = Math.max(1, Number(ci.quantity || 1));
          const compResolved = this.resolveServicePriceAndDurationFallback(comp, petChar);
          for (let q = 0; q < qty; q++) {
            await tx.petAppointmentService.create({
              data: {
                appointmentId,
                serviceId: comp.id,
                nameSnapshot: `${comp.name} (Combo: ${newService.name})`,
                priceSnapshot: new Prisma.Decimal(0),
                commissionWeightSnapshot: new Prisma.Decimal(compResolved.price),
                durationMinutes: compResolved.durationMinutes,
                isCombo: false,
                comboParentId: newAppSvc.id,
              },
            });
          }
        }
      }

      const recipientOp = commissionRecipientInput ? operatorMap.get(commissionRecipientInput) || null : null;
      const professionalOp = nextProfessionalInput ? operatorMap.get(nextProfessionalInput) || null : null;
      const nowIso = new Date().toISOString();
      const history = Array.isArray(appointment.stageHistory) ? [...(appointment.stageHistory as any[])] : [];

      if (differenceCents > 0) {
        const diffLabel = `Diferença (${oldAppSvc.nameSnapshot} por ${newService.name})`;
        await this.ensurePackageUpgradeBackingInTx(tx);
        const diffSvcId = randomUUID();

        if (effectiveChargeMode === 'add_to_package') {
          const freshContract = { ...contract, items: [...contract.items.filter((i: any) => i.id !== oldItem.id && i.id !== updatedNewItem.id), updatedOldItem, updatedNewItem] };
          await this.appendPendingContractValueInTx(tx, {
            contract: freshContract,
            amountCents: differenceCents,
            description: `Dif. troca: ${oldAppSvc.nameSnapshot} por ${newService.name}`,
            appointmentId,
            petId: appointment.petId,
            ledgerItemId: updatedNewItem.id,
            actor,
            idempotencySuffix: swapId,
          });
          await tx.petAppointmentService.create({
            data: {
              id: diffSvcId,
              appointmentId,
              serviceId: PACKAGE_UPGRADE_SERVICE_ID,
              nameSnapshot: diffLabel,
              priceSnapshot: new Prisma.Decimal(differenceAmount),
              durationMinutes: 0,
              customerPackageId: contract.id,
              coverageStatus: 'none',
              coveredAmount: new Prisma.Decimal(differenceAmount),
            },
          });
        } else {
          await tx.petAppointmentService.create({
            data: {
              id: diffSvcId,
              appointmentId,
              serviceId: PACKAGE_UPGRADE_SERVICE_ID,
              nameSnapshot: diffLabel,
              priceSnapshot: new Prisma.Decimal(differenceAmount),
              durationMinutes: 0,
              coverageStatus: 'none',
              coveredAmount: new Prisma.Decimal(0),
            },
          });
        }

        history.push({
          kind: 'service_added',
          status: appointment.status,
          label: `Diferença da troca: ${oldAppSvc.nameSnapshot} por ${newService.name}`,
          appointmentServiceId: diffSvcId,
          serviceId: PACKAGE_UPGRADE_SERVICE_ID,
          at: nowIso,
          userId: actor?.operatorId || actor?.userId || null,
          userName: actor?.name || 'Administrador',
          operatorId: recipientOp?.id || professionalOp?.id || null,
          commissionRecipientName: recipientOp?.name || professionalOp?.name || null,
          commissionState: null,
          commissionAmount: 0,
          addedToPackage: effectiveChargeMode === 'add_to_package',
        });
      }

      const swapAuditNote = (() => {
        const parts: string[] = [reason];
        if (removedUpgradeTotal > 0) {
          parts.push(`Diferença anterior não paga de R$ ${removedUpgradeTotal.toFixed(2).replace('.', ',')} removida`);
        }
        if (differenceCents > 0) {
          parts.push(
            `Diferença ${effectiveChargeMode === 'add_to_package' ? 'somada ao pacote' : effectiveChargeMode === 'charge_now' ? 'para cobrar agora' : 'a cobrar na saída'}: R$ ${differenceAmount.toFixed(2).replace('.', ',')}`,
          );
        } else if (body?.keepPackageValue === true) {
          parts.push('Mantido valor atual do pacote (sem diferença)');
        }
        return parts.join(' · ');
      })();

      history.push({
        kind: 'service_swapped',
        status: appointment.status,
        label: `Serviço trocado: ${oldAppSvc.nameSnapshot} por ${newService.name}`,
        notes: swapAuditNote,
        at: nowIso,
        userId: actor?.operatorId || actor?.userId || null,
        userName: actor?.name || 'Administrador',
        operatorId: professionalOp?.id || recipientOp?.id || null,
        operatorName: professionalOp?.name || recipientOp?.name || null,
        skipped: false,
      });

      const remainingServicesForStages = (appointment.services || [])
        .filter((s: any) => !oldServiceRowIds.includes(s.id) && !unpaidUpgradeFeeIds.includes(s.id) && !s.comboParentId && s.serviceId !== PACKAGE_UPGRADE_SERVICE_ID)
        .map((s: any) => s.service || { name: s.nameSnapshot });
      const resolvedStages = resolveChosenServicesStages([newService, ...remainingServicesForStages], this.pricing);

      const remainingDuration = (appointment.services || [])
        .filter((s: any) => !oldServiceRowIds.includes(s.id) && !unpaidUpgradeFeeIds.includes(s.id) && !s.comboParentId)
        .reduce((acc: number, s: any) => acc + Math.max(0, Number(s.durationMinutes || 0)), 0);
      const totalDuration = Math.max(15, remainingDuration + Math.max(15, Number(resolvedNew.durationMinutes || 60)));
      const nextEndsAt = new Date(new Date(appointment.startsAt).getTime() + totalDuration * 60_000);

      const nextProfessionalId = body?.professionalId === 'none'
        ? null
        : professionalOp?.id || appointment.professionalId;

      if (nextProfessionalId) {
        const conflict = await tx.petAppointment.findFirst({
          where: {
            id: { not: appointmentId },
            professionalId: nextProfessionalId,
            status: { notIn: ['cancelled', 'no_show'] },
            startsAt: { lt: nextEndsAt },
            endsAt: { gt: appointment.startsAt },
          },
        });
        if (conflict) {
          throw new ConflictException('O profissional selecionado já possui outro atendimento nesse novo intervalo de horário.');
        }
      }

      const updatedAppointment = await tx.petAppointment.update({
        where: { id: appointmentId },
        data: {
          customStages: resolvedStages,
          endsAt: nextEndsAt,
          professionalId: nextProfessionalId,
          stageHistory: history,
        },
        include: {
          pet: true,
          customer: true,
          professional: { select: { id: true, name: true } },
          services: {
            include: {
              service: true,
              customerPackage: {
                select: { id: true, planNameSnapshot: true, expiresAt: true, status: true, paymentStatus: true },
              },
              customerPackageItem: {
                select: {
                  id: true,
                  unitValueSnapshot: true,
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

      if (this.commissions?.recordExecution) {
        const systemStageKeys = new Set(['requested', 'scheduled', 'checked_in', 'ready', 'delivered', 'cancelled', 'no_show']);
        const nonStageKinds = new Set([
          'service_added',
          'service_swapped',
          'taxi_added',
          'prepayment',
          'additional_charge',
          'additional_charge_reversed',
        ]);
        const chosenOp = recipientOp || professionalOp || null;
        let historyPatchedForActiveOp = false;
        if (chosenOp && !systemStageKeys.has(appointment.status)) {
          for (let i = history.length - 1; i >= 0; i--) {
            const entry = history[i];
            if (
              entry &&
              !entry.skipped &&
              !entry.rescheduledFrom &&
              !nonStageKinds.has(entry.kind || '') &&
              entry.status === appointment.status &&
              (!entry.operatorId || entry.operatorId !== chosenOp.id)
            ) {
              history[i] = { ...entry, operatorId: chosenOp.id, operatorName: chosenOp.name };
              historyPatchedForActiveOp = true;
              break;
            }
          }
          if (historyPatchedForActiveOp && typeof tx.petAppointment.update === 'function') {
            await tx.petAppointment.update({
              where: { id: appointmentId },
              data: { stageHistory: history },
            });
            updatedAppointment.stageHistory = history;
          }
        }

        const stageSettingsRow = tx.tenantSettings?.findUnique
          ? await tx.tenantSettings.findUnique({ where: { id: 'petshop_stages' }, select: { paymentMethodsConfig: true } })
          : null;
        const configuredStages = (stageSettingsRow?.paymentMethodsConfig as any)?.stages;
        const trackedKeys = Array.isArray(configuredStages)
          ? new Set<string>(configuredStages.filter((st: any) => st?.trackProfessional).map((st: any) => String(st.key)))
          : new Set<string>(['bathing', 'grooming', 'finishing']);

        const executedStages = new Map<string, { operatorId: string; at: string }>();
        for (const entry of history) {
          if (
            !entry ||
            entry.skipped ||
            entry.rescheduledFrom ||
            nonStageKinds.has(entry.kind || '') ||
            systemStageKeys.has(entry.status) ||
            !entry.operatorId
          ) {
            continue;
          }
          if (trackedKeys.has(entry.status)) {
            executedStages.set(entry.status, {
              operatorId: String(entry.operatorId),
              at: entry.at || nowIso,
            });
          }
        }

        const execTarget = {
          ...updatedAppointment,
          services: updatedAppointment.services.map((s: any) => ({
            ...s,
            customerPackageItem: s.customerPackageItem || (s.id === newAppSvc.id ? updatedNewItem : null),
          })),
        };
        for (const [stKey, execInfo] of executedStages.entries()) {
          await this.commissions.recordExecution(tx, execTarget, stKey, execInfo.operatorId, new Date(execInfo.at));
        }
      }

      return updatedAppointment;
    });

    const contract = await this.getContractById(contractId);
    return {
      appointment: {
        ...result,
        transport: parseAppointmentTransport(result.checkInNotes),
        resolvedStages: result.customStages,
      },
      contract,
    };
  }

  /**
   * Wrapper por ID do agendamento para trocar o serviço reservado no pacote a partir da Agenda.
   */
  async exchangeAppointmentPackageService(
    appointmentId: string,
    body: {
      contractId?: string;
      oldAppointmentServiceId?: string;
      oldServiceId?: string;
      newServiceId: string;
      differenceAmount?: number;
      chargeMode?: 'none' | 'add_to_package' | 'charge_at_checkout' | 'charge_now';
      replaceUnpaidUpgradeFees?: boolean;
      keepPackageValue?: boolean;
      reason?: string;
      commissionRecipientId?: string;
      professionalId?: string;
    },
    actor?: PackageActor,
  ) {
    const prisma = await this.prisma();
    let contractId = body?.contractId ? String(body.contractId).trim() : '';
    if (!contractId) {
      const appService = await prisma.petAppointmentService.findFirst({
        where: {
          appointmentId,
          coverageStatus: 'reserved',
          customerPackageId: { not: null },
          ...(body?.oldAppointmentServiceId ? { id: String(body.oldAppointmentServiceId) } : {}),
          ...(body?.oldServiceId ? { serviceId: String(body.oldServiceId) } : {}),
        },
        select: { customerPackageId: true },
      });
      contractId = appService?.customerPackageId || '';
    }
    if (!contractId) {
      throw new NotFoundException('Serviço de pacote reservado não encontrado para este agendamento.');
    }
    return this.exchangeSessionService(contractId, { ...body, appointmentId }, actor);
  }

  /**
   * Converte créditos livres (availableQuantity > 0) de um serviço para outro dentro do contrato de pacote.
   */
  async exchangeAvailableCredit(
    contractId: string,
    body: {
      oldServiceId: string;
      newServiceId: string;
      quantity?: number;
      differenceAmount?: number;
      chargeMode?: 'none' | 'add_to_package';
      reason?: string;
    },
    rawActor?: PackageActor,
  ) {
    const prisma = await this.prisma();
    const actor = await this.resolveActor(prisma, rawActor);

    const oldServiceId = String(body?.oldServiceId ?? '').trim();
    const newServiceId = String(body?.newServiceId ?? '').trim();
    const quantity = Number(body?.quantity ?? 1);
    if (!oldServiceId || !newServiceId) throw new BadRequestException('Informe o serviço atual e o novo serviço.');
    if (oldServiceId === newServiceId) throw new BadRequestException('Escolha um serviço diferente do atual.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new BadRequestException('Quantidade para conversão inválida.');
    }

    const differenceCents = moneyCents(body?.differenceAmount ?? 0, 'Diferença de valor');
    const chargeMode = differenceCents === 0 ? 'none' : body?.chargeMode === 'add_to_package' ? 'add_to_package' : 'none';
    if (differenceCents > 0 && chargeMode !== 'add_to_package') {
      throw new BadRequestException('Para crédito ainda não agendado, a diferença só pode ser somada a um pacote pendente ou cobrada no agendamento da sessão.');
    }
    const reason = String(body?.reason ?? '').trim() || 'Conversão de saldo do pacote';

    const [preContract, newService] = await Promise.all([
      prisma.customerPetPackage.findUnique({ where: { id: contractId }, select: { id: true, customerId: true, comandaId: true } }),
      prisma.petService.findUnique({ where: { id: newServiceId } }),
    ]);
    if (!preContract) throw new NotFoundException('Contrato de pacote não encontrado.');
    if (!newService || !newService.active) throw new BadRequestException('Novo serviço inválido ou inativo.');

    await prisma.$transaction(async tx => {
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${preContract.customerId} FOR UPDATE`;
        if (preContract.comandaId) {
          await tx.$queryRaw`SELECT id FROM comandas WHERE id = ${preContract.comandaId} FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM customer_pet_packages WHERE id = ${contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM customer_pet_package_items WHERE customerPackageId = ${contractId} ORDER BY id ASC FOR UPDATE`;
      }

      const contract = await tx.customerPetPackage.findUnique({
        where: { id: contractId },
        include: { items: true },
      });
      if (!contract) throw new NotFoundException('Contrato de pacote não encontrado.');
      if (contract.status !== 'active' || contract.paymentStatus === 'cancelled') {
        throw new BadRequestException('Somente pacotes ativos permitem converter saldo.');
      }

      const oldItem = contract.items.find((i: any) => i.serviceId === oldServiceId);
      if (!oldItem || Number(oldItem.availableQuantity) < quantity) {
        throw new ConflictException('Saldo livre insuficiente neste serviço para converter.');
      }

      const swapId = randomUUID();
      const nextOldTotal = Number(oldItem.totalQuantity) - quantity;
      const nextOldAvail = Number(oldItem.availableQuantity) - quantity;
      const updatedOldItem = await tx.customerPetPackageItem.update({
        where: { id: oldItem.id },
        data: { totalQuantity: nextOldTotal, availableQuantity: nextOldAvail },
      });

      const existingNew = contract.items.find((i: any) => i.serviceId === newService.id);
      let updatedNewItem: any;
      if (existingNew) {
        updatedNewItem = await tx.customerPetPackageItem.update({
          where: { id: existingNew.id },
          data: {
            totalQuantity: Number(existingNew.totalQuantity) + quantity,
            availableQuantity: Number(existingNew.availableQuantity) + quantity,
          },
        });
      } else {
        updatedNewItem = await tx.customerPetPackageItem.create({
          data: {
            customerPackageId: contract.id,
            serviceId: newService.id,
            serviceNameSnapshot: newService.name,
            unitValueSnapshot: oldItem.unitValueSnapshot,
            totalQuantity: quantity,
            reservedQuantity: 0,
            usedQuantity: 0,
            availableQuantity: quantity,
          },
        });
      }

      const fullReason = `${reason}: ${quantity}x ${oldItem.serviceNameSnapshot} por ${newService.name}`;
      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey: `swap-credit-out:${swapId}`,
          customerPackageId: contract.id,
          customerPackageItemId: updatedOldItem.id,
          petId: contract.petId,
          eventType: 'SERVICE_SWAP_OUT',
          quantityDelta: -quantity,
          balanceAfter: Number(updatedOldItem.availableQuantity),
          usedAfter: Number(updatedOldItem.usedQuantity),
          reservedAfter: Number(updatedOldItem.reservedQuantity),
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: fullReason,
        },
      });
      await tx.customerPetPackageLedger.create({
        data: {
          idempotencyKey: `swap-credit-in:${swapId}`,
          customerPackageId: contract.id,
          customerPackageItemId: updatedNewItem.id,
          petId: contract.petId,
          eventType: 'SERVICE_SWAP_IN',
          quantityDelta: quantity,
          balanceAfter: Number(updatedNewItem.availableQuantity),
          usedAfter: Number(updatedNewItem.usedQuantity),
          reservedAfter: Number(updatedNewItem.reservedQuantity),
          operatorId: actor?.operatorId || actor?.userId || null,
          operatorName: actor?.name || null,
          reason: fullReason,
        },
      });

      if (differenceCents > 0 && chargeMode === 'add_to_package') {
        await this.appendPendingContractValueInTx(tx, {
          contract: { ...contract, items: [updatedNewItem] },
          amountCents: differenceCents,
          description: `Conversão: ${quantity}x ${oldItem.serviceNameSnapshot} por ${newService.name}`,
          petId: contract.petId,
          ledgerItemId: updatedNewItem.id,
          actor,
          idempotencySuffix: swapId,
        });
      }
    });

    return this.getContractById(contractId);
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
      const price = c.paymentStatus === 'paid' ? packageReceivedAmount(c) : Number(c.finalPrice || 0);
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
