import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { PrismaClient, Prisma } from '@prisma/client';
import { IntegrationsService } from '../integrations/integrations.service';
import { bulkImageIdentities, BulkImageIdentity } from './bulk-images.helper';
import { productImageOptimizer } from '../images/product-image.optimizer';

// ── DTOs internos (evitar `any`) ─────────────────────────────────────────────

interface ModifierOptionInputDto {
  name: string;
  componentProductId: string;
  quantity: number;
  priceAdjustment?: number;
}

interface ModifierGroupInputDto {
  name: string;
  minSelected?: number;
  maxSelected?: number;
  options: ModifierOptionInputDto[];
}

interface ProductCreateDto {
  requiresCarvoaria?: boolean;
  serviceTimerMinutes?: number | null;
  assetTrackingTotal?: number | null;
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  unit?: string;
  priceCost?: number;
  priceSell: number;
  stock?: number;
  categoryId: string;
  grupoTributacaoId?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origem?: number;
  imageUrl?: string | null;
  isComposite?: boolean;
  requiresKitchen?: boolean;
  requiresBar?: boolean;
  barStation?: string;
  preparationIngredients?: string | null;
  volumeUnit?: string | null;
  volumeCapacity?: number | null;
  minStock?: number | null;
  modifierGroups?: ModifierGroupInputDto[];
}

interface ProductUpdateDto {
  requiresCarvoaria?: boolean;
  serviceTimerMinutes?: number | null;
  assetTrackingTotal?: number | null;
  name?: string;
  shortCode?: string | null;
  barcode?: string | null;
  unit?: string;
  priceCost?: number;
  priceSell?: number;
  stock?: number;
  categoryId?: string;
  grupoTributacaoId?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origem?: number;
  active?: boolean;
  imageUrl?: string | null;
  isComposite?: boolean;
  requiresKitchen?: boolean;
  requiresBar?: boolean;
  barStation?: string;
  preparationIngredients?: string | null;
  volumeUnit?: string | null;
  volumeCapacity?: number | null;
  minStock?: number | null;
  modifierGroups?: ModifierGroupInputDto[];
}

interface BulkItem {
  name: string;
  shortCode?: string | null;
  barcode?: string | null;
  priceCost?: number;
  priceSell?: number;
  stockToAdd?: number;
  categoryId?: string;
  grupoTributacaoId?: string | null;
  ncm?: string | null;
  cest?: string | null;
  origem?: number;
  imageUrl?: string | null;
  isComposite?: boolean;
  volumeUnit?: string | null;
  volumeCapacity?: number | null;
}

// Exported so the controller can reference the return type without TS4053
export interface TenantSettingsDto {
  allowNegativeStock: boolean;
  enableExpiryControl: boolean;
  expiryAlertDays: number;
  lowStockAlertDefault: number;
}

// ─────────────────────────────────────────────────────────────────────────────

import { HeartPrismaService } from '../prisma/heart-prisma.service';

@Injectable()
export class ProductsService {
  private catalogCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 15 * 1000; // 15 segundos (garante atualização rápida do estoque)

  invalidateCache(tenantId?: string) {
    if (tenantId) {
      for (const key of this.catalogCache.keys()) {
        if (key.startsWith(tenantId)) {
          this.catalogCache.delete(key);
        }
      }
    } else {
      this.catalogCache.clear();
    }
  }

  constructor(
    private tenantManager: TenantConnectionManager,
    private tenantContext: TenantContextService,
    private heartPrisma: HeartPrismaService,
    private integrationsService: IntegrationsService
  ) {}

  /** Atalho para pegar o cliente prisma do contexto atual */
  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  // ── Utilitários Internos ──────────────────────────────────────────────────

  /** Gera o próximo shortCode de forma atômica via MAX() no banco — sem race condition */
  private async nextShortCode(prisma: Awaited<ReturnType<TenantConnectionManager['getTenantClient']>>): Promise<string> {
    const result = await prisma.$queryRaw<[{ maxCode: string | null }]>`
      SELECT MAX(CAST(shortCode AS UNSIGNED)) AS maxCode
      FROM products
      WHERE shortCode REGEXP '^[0-9]+$'
    `;
    const max = parseInt(result[0]?.maxCode ?? '0') || 0;
    return (max + 1).toString();
  }

  /** Sanitiza campos opcionais para null quando vazios */
  private sanitize<T extends ProductCreateDto | ProductUpdateDto>(data: T): T {
    if ('shortCode' in data && data.shortCode === '') data.shortCode = null;
    if ('barcode' in data && data.barcode === '') data.barcode = null;
    if ('grupoTributacaoId' in data && data.grupoTributacaoId === '') data.grupoTributacaoId = null;
    if ('ncm' in data && data.ncm === '') data.ncm = null;
    if ('cest' in data && data.cest === '') data.cest = null;
    if ('imageUrl' in data && data.imageUrl === '') data.imageUrl = null;
    if (data.origem !== undefined) data.origem = parseInt(String(data.origem)) || 0;
    if ('volumeUnit' in data && data.volumeUnit === '') data.volumeUnit = null;
    if ('volumeCapacity' in data && !data.volumeCapacity && data.volumeCapacity !== 0) {
      data.volumeCapacity = null;
    } else if ('volumeCapacity' in data && data.volumeCapacity != null) {
      data.volumeCapacity = Number(data.volumeCapacity);
    }
    for (const key of ['requiresKitchen', 'requiresBar', 'requiresCarvoaria'] as const) {
      if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new BadRequestException('Destino de preparo inválido.');
    }
    for (const key of ['serviceTimerMinutes', 'assetTrackingTotal'] as const) {
      const value = data[key];
      if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 1 || value > (key === 'assetTrackingTotal' ? 500 : 1440)))
        throw new BadRequestException(`${key === 'assetTrackingTotal' ? 'Quantidade de equipamentos' : 'Tempo de ronda'} inválido.`);
    }
    if (data.barStation !== undefined && !['BAR', 'BAR_1', 'BAR_2'].includes(data.barStation)) throw new BadRequestException('Estação de bar inválida.');
    if (data.preparationIngredients !== undefined && data.preparationIngredients !== null) {
      if (typeof data.preparationIngredients !== 'string' || data.preparationIngredients.length > 5000) throw new BadRequestException('Ingredientes devem ter até 5000 caracteres.');
      data.preparationIngredients = data.preparationIngredients.trim() || null;
    }
    return data;
  }

  // ── Rota Mágica (Lookup MasterProduct) ────────────────────────────────────

  async searchGlobalCatalog(query: string) {
    if (!query || query.trim().length < 2) return [];
    
    // Busca no catálogo mestre os produtos que contenham o termo no nome (limitado a 20)
    const products = await this.heartPrisma.masterProduct.findMany({
      where: {
        name: { contains: query.trim() }
      },
      take: 20,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        ean: true,
        ncm: true,
        cest: true,
      }
    });

    return products.map(p => ({
      ...p,
      barcode: p.ean // padroniza para o frontend
    }));
  }

  async lookupBarcode(barcode: string) {
    const prisma = await this.getPrisma();
    
    // 1. Busca no banco da loja (Tenant) primeiro
    const localProduct = await prisma.product.findUnique({
      where: { barcode }
    });
    
    if (localProduct) {
      return { source: 'local', data: localProduct };
    }

    // 2. Não achou? Busca no banco Mestre (Heart)
    let masterProduct = await this.heartPrisma.masterProduct.findUnique({
      where: { ean: barcode }
    });

    // 2.1 Fallback para códigos com zero à esquerda (leitores às vezes mandam 14 dígitos em EAN-13)
    if (!masterProduct && barcode.length === 14 && barcode.startsWith('0')) {
      const stripped = barcode.substring(1);
      masterProduct = await this.heartPrisma.masterProduct.findUnique({
        where: { ean: stripped }
      });
    }

    if (masterProduct) {
      return {
        source: 'master',
        data: {
          name: masterProduct.name,
          barcode: masterProduct.ean,
          ncm: masterProduct.ncm,
          cest: masterProduct.cest,
          unit: masterProduct.unit,
          imageUrl: masterProduct.imageUrl,
          // brand and category can be passed to front-end to be used as default names if needed
          brand: masterProduct.brand,
          masterCategory: masterProduct.category
        }
      };
    }

    throw new NotFoundException('Produto não encontrado em nenhum catálogo.');
  }

  // ── CRUD Padrão ───────────────────────────────────────────────────────────

  clearCache() {
    this.catalogCache.clear();
  }


  async findAll(page = 1, limit = 50, search?: string, includeInactive = false, status?: string) {
    const { tenantId } = this.tenantContext.get();

    // Cache somente para listagens sem busca e ativos padrão
    if (!search && !includeInactive && (!status || status === 'active')) {
      const cacheKey = `${tenantId}_p_${page}_l_${limit}`;
      const cached = this.catalogCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
        return cached.data;
      }
    }

    const prisma = await this.getPrisma();
    const skip = (page - 1) * limit;

    // ── Montar filtro de busca ─────────────────────────────────────────────
    const whereClause: any = {};
    if (status === 'inactive') {
      whereClause.active = false;
    } else if (status === 'all' || includeInactive) {
      // Traz ativos e inativos
    } else {
      whereClause.active = true;
    }

    if (search && search.trim().length > 0) {
      const term = search.trim();
      whereClause.OR = [
        { name: { contains: term } },
        { shortCode: { contains: term } },
        { barcode: { contains: term } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.product.count({ where: whereClause }),
      prisma.product.findMany({
        where: whereClause,
        include: { 
          category: true, 
          grupoTributacao: true,
          supplierProducts: {
            select: { supplierId: true }
          },
          modifierGroups: {
            include: {
              options: {
                include: {
                  componentProduct: true
                }
              }
            }
          }
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    const result = {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };

    // Salvar no cache apenas listagens sem busca e padrão ativo
    if (!search && !includeInactive && (!status || status === 'active')) {
      const cacheKey = `${tenantId}_p_${page}_l_${limit}`;
      this.catalogCache.set(cacheKey, { data: result, timestamp: Date.now() });
    }
    return result;
  }

  async getComposition(id: string) {
    const prisma = await this.getPrisma();
    return prisma.productModifierGroup.findMany({
      where: { productId: id },
      include: {
        options: {
          include: {
            componentProduct: true,
          },
        },
      },
    });
  }

  async create(data: ProductCreateDto) {
    const prisma = await this.getPrisma();
    const { modifierGroups, ...rest } = data;
    const sanitized = this.sanitize(rest as any);

    // ── Validação de input (A-2) ───────────────────────────────────────────
    if (!sanitized.name?.trim()) {
      throw new BadRequestException('Nome da Mercadoria é obrigatório.');
    }
    if (!sanitized.categoryId) {
      throw new BadRequestException('Categoria é obrigatória.');
    }
    if (sanitized.priceSell === undefined || sanitized.priceSell < 0) {
      throw new BadRequestException('Preço de Venda inválido.');
    }
    if (sanitized.priceCost !== undefined && sanitized.priceCost < 0) {
      throw new BadRequestException('Preço de Custo não pode ser negativo.');
    }
    if (sanitized.stock !== undefined && sanitized.stock < 0) {
      throw new BadRequestException('Estoque inicial não pode ser negativo.');
    }
    // ──────────────────────────────────────────────────────

    const existing = await prisma.product.findFirst({ where: { name: sanitized.name } });
    if (existing) {
      if (!existing.active) {
        throw new ConflictException(`Já existe um produto inativo com o nome "${sanitized.name}". Filtre por "Inativos" no catálogo para visualizá-lo ou reativá-lo.`);
      }
      throw new ConflictException(`Já existe um produto com o nome "${sanitized.name}". Verifique o catálogo.`);
    }

    if (sanitized.barcode) {
      const existingBarcode = await prisma.product.findFirst({ where: { barcode: sanitized.barcode } });
      if (existingBarcode) {
        if (!existingBarcode.active) {
          throw new ConflictException(`O código de barras "${sanitized.barcode}" já pertence ao produto inativo "${existingBarcode.name}". Filtre por "Inativos" para reativá-lo.`);
        }
        throw new ConflictException(`O código de barras "${sanitized.barcode}" já pertence ao produto "${existingBarcode.name}".`);
      }
    }

    if (!sanitized.shortCode) {
      sanitized.shortCode = await this.nextShortCode(prisma);
    }

    if (!sanitized.unit) sanitized.unit = 'UN';

    if ([data.requiresKitchen, data.requiresBar, data.requiresCarvoaria].filter(Boolean).length > 1) throw new BadRequestException('Selecione apenas um destino de preparo.');
    if (!data.requiresCarvoaria && (data.serviceTimerMinutes != null || data.assetTrackingTotal != null)) throw new BadRequestException('Rondas e equipamentos exigem destino Carvoaria.');
    const isComposite = data.isComposite ?? false;
    const volumeUnit = data.volumeUnit || null;
    const volumeCapacity = data.volumeCapacity !== undefined && data.volumeCapacity !== null ? new Prisma.Decimal(data.volumeCapacity) : null;

    const product = await prisma.product.create({
      data: {
        name: sanitized.name,
        shortCode: sanitized.shortCode,
        barcode: sanitized.barcode,
        unit: sanitized.unit,
        priceCost: sanitized.priceCost !== undefined ? new Prisma.Decimal(sanitized.priceCost) : new Prisma.Decimal(0),
        priceSell: new Prisma.Decimal(sanitized.priceSell),
        stock: sanitized.stock !== undefined ? new Prisma.Decimal(sanitized.stock) : new Prisma.Decimal(0),
        categoryId: sanitized.categoryId,
        grupoTributacaoId: sanitized.grupoTributacaoId,
        ncm: sanitized.ncm,
        cest: sanitized.cest,
        origem: sanitized.origem,
        imageUrl: sanitized.imageUrl,
        requiresKitchen: data.requiresKitchen ?? false,
        requiresBar: data.requiresBar ?? false,
        barStation: data.barStation ?? 'BAR',
        requiresCarvoaria: data.requiresCarvoaria ?? false,
        serviceTimerMinutes: data.serviceTimerMinutes ?? null,
        assetTrackingTotal: data.assetTrackingTotal ?? null,
        preparationIngredients: sanitized.preparationIngredients ?? null,
        isComposite,
        volumeUnit,
        volumeCapacity,
        minStock: data.minStock !== undefined && data.minStock !== null ? new Prisma.Decimal(data.minStock) : null,
        ...(isComposite && modifierGroups && modifierGroups.length > 0 ? {
          modifierGroups: {
            create: modifierGroups.map(group => ({
              name: group.name,
              minSelected: group.minSelected ?? 1,
              maxSelected: group.maxSelected ?? 1,
              options: {
                create: group.options.map(opt => ({
                  name: opt.name,
                  componentProductId: opt.componentProductId,
                  quantity: new Prisma.Decimal(opt.quantity),
                  priceAdjustment: new Prisma.Decimal(opt.priceAdjustment ?? 0),
                }))
              }
            }))
          }
        } : {})
      } as any
    });

    if (sanitized.stock && Number(sanitized.stock) > 0) {
      await prisma.stockLot.create({
        data: {
          productId: product.id,
          costPrice: sanitized.priceCost !== undefined ? new Prisma.Decimal(sanitized.priceCost) : new Prisma.Decimal(0),
          quantity: new Prisma.Decimal(sanitized.stock),
          remaining: new Prisma.Decimal(sanitized.stock),
        }
      });

      await prisma.inventoryLog.create({
        data: {
          productId: product.id,
          type: 'IN',
          quantity: Number(sanitized.stock),
          costPrice: sanitized.priceCost ?? 0,
          reason: 'Estoque Inicial — Cadastro Manual',
        },
      });
    }

    this.invalidateCache(this.tenantContext.get().tenantId);
    return product;
  }

  async update(id: string, data: ProductUpdateDto) {
    const { modifierGroups, ...rest } = data;
    const sanitized = this.sanitize(rest as any);
    const prisma = await this.getPrisma();

    const oldProduct = await prisma.product.findUnique({ where: { id } });
    if (!oldProduct) throw new NotFoundException('Produto não encontrado.');
    const preparation = { ...oldProduct, ...sanitized };
    if ([preparation.requiresKitchen, preparation.requiresBar, preparation.requiresCarvoaria].filter(Boolean).length > 1) throw new BadRequestException('Selecione apenas um destino de preparo.');
    if (!preparation.requiresCarvoaria && (preparation.serviceTimerMinutes != null || preparation.assetTrackingTotal != null)) throw new BadRequestException('Desative ronda e rastreamento ao remover o destino Carvoaria.');

    const { shortCode: _ignored, ...updateData } = sanitized as Record<string, unknown>;
    void _ignored;

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const productPayload: any = {};
      if (data.requiresKitchen !== undefined) productPayload.requiresKitchen = data.requiresKitchen;
      if (data.requiresBar !== undefined) productPayload.requiresBar = data.requiresBar;
      if (sanitized.barStation !== undefined) productPayload.barStation = sanitized.barStation;
      for (const key of ['requiresCarvoaria', 'serviceTimerMinutes', 'assetTrackingTotal'] as const)
        if (sanitized[key] !== undefined) productPayload[key] = sanitized[key];
      if (sanitized.preparationIngredients !== undefined) productPayload.preparationIngredients = sanitized.preparationIngredients;
      
      if (updateData.name !== undefined) productPayload.name = updateData.name;
      if (updateData.barcode !== undefined) productPayload.barcode = updateData.barcode;
      if (updateData.unit !== undefined) productPayload.unit = updateData.unit;
      if (updateData.priceCost !== undefined) productPayload.priceCost = new Prisma.Decimal(updateData.priceCost as number);
      if (updateData.priceSell !== undefined) productPayload.priceSell = new Prisma.Decimal(updateData.priceSell as number);
      // stock NÃO entra no productPayload — será definido via reconcileLots para manter lotes sincronizados
      if (updateData.categoryId !== undefined) productPayload.categoryId = updateData.categoryId;
      if (updateData.grupoTributacaoId !== undefined) productPayload.grupoTributacaoId = updateData.grupoTributacaoId;
      if (updateData.ncm !== undefined) productPayload.ncm = updateData.ncm;
      if (updateData.cest !== undefined) productPayload.cest = updateData.cest;
      if (updateData.origem !== undefined) productPayload.origem = updateData.origem;
      if (updateData.imageUrl !== undefined) productPayload.imageUrl = updateData.imageUrl;
      if (updateData.active !== undefined) productPayload.active = updateData.active;
      
      productPayload.isComposite = data.isComposite ?? oldProduct.isComposite;
      productPayload.volumeUnit = data.volumeUnit !== undefined ? data.volumeUnit : oldProduct.volumeUnit;
      productPayload.volumeCapacity = data.volumeCapacity !== undefined 
        ? (data.volumeCapacity !== null ? new Prisma.Decimal(data.volumeCapacity) : null)
        : oldProduct.volumeCapacity;
      if (data.minStock !== undefined) {
        productPayload.minStock = data.minStock !== null ? new Prisma.Decimal(data.minStock) : null;
      }

      const product = await tx.product.update({ 
        where: { id }, 
        data: productPayload 
      });

      if (productPayload.isComposite === false) {
        await tx.productModifierGroup.deleteMany({ where: { productId: id } });
      } else if (modifierGroups !== undefined) {
        await tx.productModifierGroup.deleteMany({ where: { productId: id } });

        for (const group of modifierGroups) {
          await tx.productModifierGroup.create({
            data: {
              productId: id,
              name: group.name,
              minSelected: group.minSelected ?? 1,
              maxSelected: group.maxSelected ?? 1,
              options: {
                create: group.options.map(opt => ({
                  name: opt.name,
                  componentProductId: opt.componentProductId,
                  quantity: new Prisma.Decimal(opt.quantity),
                  priceAdjustment: new Prisma.Decimal(opt.priceAdjustment ?? 0),
                }))
              }
            }
          });
        }
      }

      if (sanitized.stock !== undefined && Number(sanitized.stock) !== Number(oldProduct.stock)) {
        const diff = Number(sanitized.stock) - Number(oldProduct.stock);
        await tx.inventoryLog.create({
          data: {
            productId: product.id,
            type: diff > 0 ? 'IN' : 'OUT',
            quantity: Math.abs(diff),
            reason: diff > 0 ? 'Ajuste Manual Positivo' : 'Ajuste Manual (Quebra/Perda)',
          },
        });

        // Reconcilia lotes com o novo valor absoluto de estoque
        await this.reconcileLots(tx, id, Number(sanitized.stock), 'Ajuste Manual');
      }

      return product;
    });

    this.invalidateCache(this.tenantContext.get().tenantId);

    if (sanitized.stock !== undefined && Number(sanitized.stock) !== Number(oldProduct.stock)) {
      this.integrationsService.syncProductStock(this.tenantContext.get().tenantId, [id]).catch(e => console.error(e));
    }

    return updatedProduct;
  }


  async remove(id: string) {
    const prisma = await this.getPrisma();

    // A-6: Produtos com histórico (vendas ou movimentações) não devem ser deletados fisicamente.
    // Soft delete preserva integridade do histórico fiscal e de estoque.
    const [saleCount, logCount] = await Promise.all([
      prisma.saleItem.count({ where: { productId: id } }),
      prisma.inventoryLog.count({ where: { productId: id } }),
    ]);

    let result;
    if (saleCount > 0 || logCount > 0) {
      // Soft delete — inativa o produto sem remover dados históricos
      result = await prisma.product.update({
        where: { id },
        data: { active: false },
      });
    } else {
      // Sem histórico: pode deletar fisicamente
      await prisma.inventoryLog.deleteMany({ where: { productId: id } });
      result = await prisma.product.delete({ where: { id } });
    }

    this.invalidateCache(this.tenantContext.get().tenantId);
    return result;
  }

  // ── Inventário / Contagem de Estoque ─────────────────────────────────────

  /**
   * Retorna o histórico de contagens físicas agrupado por sessão (janela de 30 min).
   */
  async inventoryHistory() {
    const prisma = await this.getPrisma();

    const logs = await prisma.inventoryLog.findMany({
      where: { reason: { contains: 'Contagem Física' } },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    // Agrupa por janela de 30 minutos
    const sessions: Record<string, {
      sessionId: string;
      date: string;
      totalProducts: number;
      increases: number;
      decreases: number;
      unchanged: number;
      items: { name: string; before: number; after: number; diff: number }[];
    }> = {};

    for (const log of logs as any[]) {
      const d = new Date(log.createdAt);
      const windowMinutes = Math.floor(d.getMinutes() / 30) * 30;
      const sessionKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${windowMinutes}`;

      if (!sessions[sessionKey]) {
        sessions[sessionKey] = {
          sessionId: sessionKey,
          date: log.createdAt,
          totalProducts: 0,
          increases: 0,
          decreases: 0,
          unchanged: 0,
          items: [],
        };
      }

      // Extrai before/after do reason: "Antes: X, Depois: Y"
      const beforeMatch = log.reason?.match(/Antes:\s*([\d.]+)/);
      const afterMatch  = log.reason?.match(/Depois:\s*([\d.]+)/);
      const before = beforeMatch ? parseFloat(beforeMatch[1]) : 0;
      const after  = afterMatch  ? parseFloat(afterMatch[1])  : 0;
      const diff   = after - before;

      sessions[sessionKey].totalProducts++;
      if (diff > 0) sessions[sessionKey].increases++;
      else if (diff < 0) sessions[sessionKey].decreases++;
      else sessions[sessionKey].unchanged++;

      sessions[sessionKey].items.push({
        name: log.product?.name || 'Desconhecido',
        before,
        after,
        diff,
      });
    }

    return Object.values(sessions).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  /**
   * Retorna produtos para exportação do inventário.
   * Filtros opcionais: categoryIds[] e productIds[]
   */
  async inventoryExport(filters: { categoryIds?: string[]; productIds?: string[] }) {
    const prisma = await this.getPrisma();

    const where: any = { active: true };

    if (filters.productIds && filters.productIds.length > 0) {
      where.id = { in: filters.productIds };
    } else if (filters.categoryIds && filters.categoryIds.length > 0) {
      where.categoryId = { in: filters.categoryIds };
    }

    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    return products.map((p: any) => ({
      id: p.id,
      shortCode: p.shortCode || '',
      name: p.name,
      category: p.category?.name || '',
      unit: p.unit || 'UN',
      stock: Number(p.stock),
    }));
  }

  /**
   * Recebe array de { productId, newStock } e substitui o estoque de cada produto.
   * Produtos com newStock === null/undefined são ignorados.
   * Registra cada ajuste no InventoryLog.
   */
  async inventoryImport(items: { productId: string; newStock: number }[]) {
    const prisma = await this.getPrisma();

    const results: { productId: string; name: string; before: number; after: number }[] = [];
    const errors: { productId: string; error: string }[] = [];

    for (const item of items) {
      if (item.newStock === null || item.newStock === undefined || isNaN(item.newStock)) {
        continue; // Ignora linhas sem valor preenchido
      }

      try {
        await prisma.$transaction(async (tx: any) => {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error('Produto não encontrado');

          const before = Number(product.stock);
          const after = Number(item.newStock);
          const diff = after - before;

          // Reconcilia lotes: zera ativos e cria lote de inventário
          await this.reconcileLots(tx, item.productId, after, 'Inventário');

          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: diff >= 0 ? 'IN' : 'OUT',
              quantity: Math.abs(diff),
              costPrice: Number(product.priceCost),
              reason: `Ajuste de Inventário (Contagem Física) — Antes: ${before}, Depois: ${after}`,
            },
          });

          results.push({ productId: item.productId, name: product.name, before, after });
        });
      } catch (err: any) {
        errors.push({ productId: item.productId, error: err.message });
      }
    }

    this.invalidateCache(this.tenantContext.get().tenantId);
    return { updated: results.length, errors, results };
  }

  // ── Entrada de Estoque Incremental ────────────────────────────────────────

  /**
   * Adiciona quantidade ao estoque de forma segura usando Prisma increment.
   * Executado dentro de uma transaction para evitar condições de corrida.
   */
  async addStock(
    productId: string,
    quantity: number,
    costPrice?: number,
    reason?: string,
    lotNumber?: string,
    expiresAt?: string,
    supplierId?: string,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('A quantidade de entrada deve ser maior que zero.');
    }

    const prisma = await this.getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Produto não encontrado.');

      const finalCost = costPrice !== undefined ? new Prisma.Decimal(costPrice) : product.priceCost;

      const updated = await tx.product.update({
        where: { id: productId },
        data: { 
          stock: { increment: new Prisma.Decimal(quantity) },
          priceCost: finalCost
        },
      });

      await tx.stockLot.create({
        data: {
          productId,
          costPrice: finalCost,
          quantity: new Prisma.Decimal(quantity),
          remaining: new Prisma.Decimal(quantity),
          lotNumber: lotNumber || null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          supplierId: supplierId || null,
        }
      });

      await tx.inventoryLog.create({
        data: {
          productId,
          type: 'IN',
          quantity,
          costPrice: finalCost,
          reason: reason || 'Entrada de Estoque — Reposição',
        },
      });

      await this.syncProductStockAndCost(tx, productId);

      return { product: updated, quantityAdded: quantity };
    });

    this.invalidateCache(this.tenantContext.get().tenantId);
    
    this.integrationsService.syncProductStock(this.tenantContext.get().tenantId, [productId]).catch(e => console.error(e));
    return result;
  }

  async registerExistingLot(
    productId: string,
    quantity: number,
    costPrice?: number,
    lotNumber?: string,
    expiresAt?: string,
  ) {
    return this.registerStockLot(productId, quantity, costPrice, lotNumber, expiresAt);
  }

  async registerStockLot(
    productId: string,
    quantity: number,
    costPrice?: number,
    lotNumber?: string,
    expiresAt?: string,
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('A quantidade deve ser maior que zero.');
    }

    const prisma = await this.getPrisma();

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Produto não encontrado.');

      const finalCost = costPrice !== undefined && Number(costPrice) > 0
        ? new Prisma.Decimal(costPrice)
        : product.priceCost;
      const finalLotNumber = lotNumber || `L${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

      const lot = await tx.stockLot.create({
        data: {
          productId,
          costPrice: finalCost,
          quantity: new Prisma.Decimal(quantity),
          remaining: new Prisma.Decimal(quantity),
          lotNumber: finalLotNumber,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }
      });

      await tx.inventoryLog.create({
        data: {
          productId,
          type: 'IN',
          quantity,
          costPrice: Number(finalCost),
          reason: `Entrada de Lote ${finalLotNumber}`,
        }
      });

      await this.syncProductStockAndCost(tx, productId);

      const updatedProduct = await tx.product.findUnique({ where: { id: productId } });
      return { product: updatedProduct, lot, quantityRegistered: quantity };
    });

    this.invalidateCache(this.tenantContext.get().tenantId);
    return result;
  }

  // ── Importação em Lote (Fast Grid) ────────────────────────────────────────

  async bulkEntry(items: BulkItem[]) {
    const prisma = await this.getPrisma();

    // Categoria fallback
    let fallbackCategory = await prisma.category.findFirst();
    if (!fallbackCategory) {
      fallbackCategory = await prisma.category.create({ data: { name: 'Geral' } });
    }

    // ── Carrega APENAS os produtos do lote em 1 query (elimina N+1 e OOM) ────────────────
    const shortCodes = items.map(i => i.shortCode).filter(Boolean) as string[];
    const barcodes = items.map(i => i.barcode).filter(Boolean) as string[];
    const names = items.map(i => i.name?.trim()).filter(Boolean) as string[];

    const batchProducts = await prisma.product.findMany({
      where: {
        OR: [
          { shortCode: { in: shortCodes } },
          { barcode: { in: barcodes } },
          { name: { in: names } },
        ]
      },
      select: { id: true, name: true, shortCode: true, barcode: true, priceCost: true, priceSell: true, stock: true },
    });
    const byShortCode = new Map(batchProducts.filter(p => p.shortCode).map(p => [p.shortCode!, p]));
    const byBarcode   = new Map(batchProducts.filter(p => p.barcode).map(p => [p.barcode!, p]));
    const byName      = new Map(batchProducts.map(p => [p.name.toLowerCase(), p]));

    const duplicateNames: string[] = [];
    let importedCount = 0;

    // ── Processa em batches de 50 dentro de transactions ─────────────────
    const BATCH = 50;
    for (let b = 0; b < items.length; b += BATCH) {
      const batch = items.slice(b, b + BATCH);

      await prisma.$transaction(async (tx) => {
        for (const item of batch) {
          if (!item.name?.trim()) continue;

          const existing =
            (item.shortCode ? byShortCode.get(item.shortCode) : undefined) ??
            (item.barcode   ? byBarcode.get(item.barcode)     : undefined) ??
            null;

          const stockToAdd = parseInt(String(item.stockToAdd ?? 0)) || 0;

          if (existing) {
            // Produto já existe — atualiza preços e soma estoque
            await tx.product.update({
              where: { id: existing.id },
              data: {
                priceCost:        item.priceCost        ?? existing.priceCost,
                priceSell:        item.priceSell        ?? existing.priceSell,
                stock:            { increment: new Prisma.Decimal(stockToAdd) },
                ...(item.categoryId        && { categoryId: item.categoryId }),
                ...(item.grupoTributacaoId && { grupoTributacaoId: item.grupoTributacaoId }),
                ...(item.ncm               && { ncm: item.ncm }),
                ...(item.cest              && { cest: item.cest }),
                ...(item.origem !== undefined && { origem: parseInt(String(item.origem)) || 0 }),
                ...(item.imageUrl          && { imageUrl: item.imageUrl }),
                ...(item.isComposite !== undefined && { isComposite: item.isComposite }),
                ...(item.volumeUnit !== undefined && { volumeUnit: item.volumeUnit === '' ? null : item.volumeUnit }),
                ...(item.volumeCapacity !== undefined && { volumeCapacity: item.volumeCapacity ? new Prisma.Decimal(item.volumeCapacity) : null }),
              },
            });

            if (stockToAdd > 0) {
              const finalCost = item.priceCost !== undefined && item.priceCost !== null ? new Prisma.Decimal(item.priceCost) : existing.priceCost;
              await tx.stockLot.create({
                data: {
                  productId: existing.id,
                  costPrice: finalCost,
                  quantity: new Prisma.Decimal(stockToAdd),
                  remaining: new Prisma.Decimal(stockToAdd),
                }
              });

              await tx.inventoryLog.create({
                data: { productId: existing.id, type: 'IN', quantity: stockToAdd, costPrice: Number(finalCost), reason: 'Entrada Lote/Fornecedor' },
              });

              await this.syncProductStockAndCost(tx, existing.id);
            }
            importedCount++;
          } else {
            // Verifica conflito de nome usando Map em memória (sem query extra)
            if (byName.has(item.name.trim().toLowerCase())) {
              duplicateNames.push(item.name);
              continue;
            }

            const finalShortCode = item.shortCode || await this.nextShortCode(tx as any);

            const created = await tx.product.create({
              data: {
                name:              item.name.trim(),
                shortCode:         finalShortCode,
                barcode:           item.barcode           || null,
                priceCost:         item.priceCost         || 0,
                priceSell:         item.priceSell         || 0,
                stock:             stockToAdd,
                unit:              'UN',
                categoryId:        item.categoryId        || fallbackCategory!.id,
                grupoTributacaoId: item.grupoTributacaoId || null,
                ncm:               item.ncm               || null,
                cest:              item.cest              || null,
                origem:            item.origem !== undefined ? parseInt(String(item.origem)) || 0 : 0,
                imageUrl:          item.imageUrl          || null,
                isComposite:       item.isComposite !== undefined ? !!item.isComposite : false,
                volumeUnit:        item.volumeUnit === '' ? null : (item.volumeUnit || null),
                volumeCapacity:    item.volumeCapacity ? new Prisma.Decimal(item.volumeCapacity) : null,
              },
            });

            // Atualiza Map em memória para evitar conflitos dentro do mesmo lote
            byName.set(item.name.trim().toLowerCase(), created as any);
            if (created.shortCode) byShortCode.set(created.shortCode, created as any);

            if (stockToAdd > 0) {
              await tx.stockLot.create({
                data: {
                  productId: created.id,
                  costPrice: new Prisma.Decimal(item.priceCost || 0),
                  quantity: new Prisma.Decimal(stockToAdd),
                  remaining: new Prisma.Decimal(stockToAdd),
                }
              });

              await tx.inventoryLog.create({
                data: { productId: created.id, type: 'IN', quantity: stockToAdd, costPrice: item.priceCost, reason: 'Cadastro e Entrada Lote Inicial' },
              });
            }
            importedCount++;
          }
        }
      });
    }

    this.invalidateCache(this.tenantContext.get().tenantId);

    return {
      success: true,
      processed: importedCount,
      duplicates: duplicateNames,
      hasDuplicates: duplicateNames.length > 0,
    };
  }

  // ── Configurações do Tenant ───────────────────────────────────────────────

  /** Lê configurações globais do tenant (singleton via upsert) */
  async getSettings(): Promise<TenantSettingsDto> {
    const prisma = await this.getPrisma();
    const settings = await prisma.tenantSettings.upsert({
      where:  { id: 'singleton' },
      update: {},
      create: { id: 'singleton', allowNegativeStock: false, enableExpiryControl: false, expiryAlertDays: 30, lowStockAlertDefault: 5 },
    });
    return {
      allowNegativeStock: settings.allowNegativeStock,
      enableExpiryControl: settings.enableExpiryControl,
      expiryAlertDays: settings.expiryAlertDays,
      lowStockAlertDefault: settings.lowStockAlertDefault,
    };
  }

  /** Atualiza configurações globais do tenant */
  async saveSettings(data: TenantSettingsDto): Promise<TenantSettingsDto> {
    const prisma = await this.getPrisma();
    const settings = await prisma.tenantSettings.upsert({
      where:  { id: 'singleton' },
      update: {
        allowNegativeStock: data.allowNegativeStock,
        enableExpiryControl: data.enableExpiryControl,
        expiryAlertDays: data.expiryAlertDays,
        lowStockAlertDefault: data.lowStockAlertDefault ?? 5,
      },
      create: {
        id: 'singleton',
        allowNegativeStock: data.allowNegativeStock,
        enableExpiryControl: data.enableExpiryControl ?? false,
        expiryAlertDays: data.expiryAlertDays ?? 30,
        lowStockAlertDefault: data.lowStockAlertDefault ?? 5,
      },
    });
    return {
      allowNegativeStock: settings.allowNegativeStock,
      enableExpiryControl: settings.enableExpiryControl,
      expiryAlertDays: settings.expiryAlertDays,
      lowStockAlertDefault: settings.lowStockAlertDefault,
    };
  }

  /** Normaliza string para comparação: remove acentos, lowercase, trim, espaços duplos */
  private normalizeForMatch(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async bulkImageUpload(tenantId: string, files: Express.Multer.File[], manifest?: string) {
    const identities = bulkImageIdentities(files, manifest);
    const prisma = await this.getPrisma();

    // Buscar todos os produtos ativos do tenant
    const allProducts = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, imageUrl: true },
    });

    // Criar mapa: nome normalizado → produto
    const productMap = new Map<string, typeof allProducts>();
    for (const p of allProducts) {
      const key = this.normalizeForMatch(p.name);
      if (key) productMap.set(key, [...(productMap.get(key) || []), p]);
    }

    const matched: (BulkImageIdentity & { productId: string; productName: string; imageUrl: string })[] = [];
    const notFound: BulkImageIdentity[] = [];
    const errors: (BulkImageIdentity & { error: string })[] = [];

    for (const [index, file] of files.entries()) {
      const identity = identities[index];
      // Extrai nome do arquivo sem extensão
      const fileNameWithoutExt = identity.fileName.replace(/\.[^/.]+$/, '');
      const normalizedFileName = this.normalizeForMatch(fileNameWithoutExt);

      // Tenta match exato primeiro
      let candidates = productMap.get(normalizedFileName) || [];

      // Se não encontrou exato, tenta match parcial (contém)
      if (!candidates.length && normalizedFileName) {
        for (const [key, val] of productMap.entries()) {
          if (key.includes(normalizedFileName) || normalizedFileName.includes(key)) {
            candidates.push(...val);
          }
        }
      }

      if (candidates.length > 1) {
        errors.push({ ...identity, error: 'Nome ambíguo: mais de um produto corresponde. Use o nome completo e único do produto.' });
        continue;
      }
      const product = candidates[0];
      if (!product) {
        notFound.push(identity);
        continue;
      }

      try {
        // Salvar imagem no banco heart (global)
        const optimized = await productImageOptimizer.optimize(file.buffer);
        const image = await this.heartPrisma.image.create({
          data: {
            data: Buffer.from(optimized.data),
            mimeType: optimized.mimeType,
          },
        });

        const imageUrl = `/api/products/uploads/images/${image.id}`;

        // Atualizar o produto com a nova imageUrl
        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl },
        });

        matched.push({
          ...identity,
          productId: product.id,
          productName: product.name,
          imageUrl,
        });
      } catch (err: any) {
        errors.push({ ...identity, error: err?.message || 'Erro desconhecido' });
      }
    }

    // Invalidar cache
    this.invalidateCache(tenantId);

    return {
      total: files.length,
      matched: matched.length,
      notFound: notFound.length,
      errors: errors.length,
      details: { matched, notFound, errors },
    };
  }

  async uploadPhoto(tenantId: string, file: Express.Multer.File) {
    const optimized = await productImageOptimizer.optimize(file.buffer);
    
    // Salvar no banco heart (global) em vez do tenant local
    const image = await this.heartPrisma.image.create({
      data: {
        data: Buffer.from(optimized.data),
        mimeType: optimized.mimeType,
      }
    });

    // Retorna a URL que vai ser interceptada pelo app.controller.ts
    const imageUrl = `/api/products/uploads/images/${image.id}`;

    return { imageUrl, bytes: optimized.data.length, width: optimized.width, height: optimized.height, optimized: true };
  }

  /**
   * Sincroniza o estoque físico (`product.stock`) e o preço de custo (`product.priceCost`)
   * com o saldo total dos lotes ativos (`StockLot`) e o custo do lote mais recente.
   */
  async syncProductStockAndCost(tx: any, productId: string) {
    const lots = await tx.stockLot.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    if (lots.length === 0) return;

    // Soma do saldo restante apenas dos lotes positivos (ignora estornos/negativos)
    const totalRemaining = lots.reduce((sum: number, lot: any) => {
      const r = Number(lot.remaining);
      return sum + (r > 0 ? r : 0);
    }, 0);

    // Lote ativo mais recente (remaining > 0) ou primeiro lote
    const activeLot = lots.find((lot: any) => Number(lot.remaining) > 0) || lots[0];
    const latestCost = activeLot ? activeLot.costPrice : null;

    const updateData: any = {};
    if (totalRemaining >= 0) {
      updateData.stock = new Prisma.Decimal(totalRemaining);
    }
    if (latestCost !== null && Number(latestCost) > 0) {
      updateData.priceCost = latestCost;
    }

    if (Object.keys(updateData).length > 0) {
      await tx.product.update({
        where: { id: productId },
        data: updateData,
      });
    }
  }

  async getProductLots(productId: string) {
    const prisma = await this.getPrisma();

    // Auto-sincroniza estoque e custo do produto com os lotes ativos
    await this.syncProductStockAndCost(prisma, productId);
    
    const lots = await prisma.stockLot.findMany({
      where: { productId },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return lots.map(lot => ({
      id: lot.id,
      costPrice: Number(lot.costPrice),
      quantity: Number(lot.quantity),
      remaining: Number(lot.remaining),
      lotNumber: lot.lotNumber,
      expiresAt: lot.expiresAt,
      supplierId: lot.supplierId,
      supplierName: lot.supplier?.name ?? null,
      createdAt: lot.createdAt
    }));
  }

  /** Retorna lotes com validade próxima ou vencida */
  async getExpiringLots(days = 30) {
    const prisma = await this.getPrisma();
    const now = new Date();
    const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const lots = await prisma.stockLot.findMany({
      where: {
        expiresAt: { not: null, lte: limit },
        remaining: { gt: 0 },
      },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    return lots.map(lot => ({
      id: lot.id,
      productId: lot.productId,
      productName: lot.product.name,
      productUnit: lot.product.unit,
      supplierId: lot.supplierId,
      supplierName: lot.supplier?.name ?? null,
      lotNumber: lot.lotNumber,
      costPrice: Number(lot.costPrice),
      quantity: Number(lot.quantity),
      remaining: Number(lot.remaining),
      expiresAt: lot.expiresAt,
      isExpired: lot.expiresAt ? lot.expiresAt < now : false,
      daysUntilExpiry: lot.expiresAt
        ? Math.ceil((lot.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      createdAt: lot.createdAt,
    }));
  }

  /** Retorna apenas lotes já vencidos com estoque restante */
  async getExpiredLots() {
    const prisma = await this.getPrisma();
    const now = new Date();

    const lots = await prisma.stockLot.findMany({
      where: {
        expiresAt: { not: null, lt: now },
        remaining: { gt: 0 },
      },
      include: {
        product: { select: { id: true, name: true, unit: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    return lots.map(lot => ({
      id: lot.id,
      productId: lot.productId,
      productName: lot.product.name,
      productUnit: lot.product.unit,
      supplierId: lot.supplierId,
      supplierName: lot.supplier?.name ?? null,
      lotNumber: lot.lotNumber,
      costPrice: Number(lot.costPrice),
      remaining: Number(lot.remaining),
      expiresAt: lot.expiresAt,
      daysUntilExpiry: lot.expiresAt
        ? Math.ceil((lot.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      createdAt: lot.createdAt,
    }));
  }

  async updateLot(lotId: string, data: { expiresAt?: string | Date | null, lotNumber?: string }) {
    const prisma = await this.getPrisma();
    
    const lot = await prisma.stockLot.findUnique({ where: { id: lotId } });
    if (!lot) {
      throw new NotFoundException('Lote não encontrado.');
    }

    return prisma.stockLot.update({
      where: { id: lotId },
      data: {
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
        ...(data.lotNumber !== undefined && { lotNumber: data.lotNumber }),
      }
    });
  }

  async splitLot(lotId: string, splitQty: number, newExpiresAt?: string | Date | null, newLotNumber?: string) {
    const prisma = await this.getPrisma();
    
    return prisma.$transaction(async (tx) => {
      const lot = await tx.stockLot.findUnique({ where: { id: lotId } });
      if (!lot) throw new NotFoundException('Lote não encontrado.');
      
      const remainingNum = Number(lot.remaining);
      if (splitQty <= 0 || splitQty >= remainingNum) {
        throw new Error('A quantidade para dividir deve ser maior que 0 e menor que a quantidade restante do lote.');
      }
      
      // Subtrai do lote original
      await tx.stockLot.update({
        where: { id: lotId },
        data: {
          remaining: new Prisma.Decimal(remainingNum - splitQty),
          quantity: new Prisma.Decimal(Number(lot.quantity) - splitQty),
        }
      });
      
      // Cria o novo lote
      const newLot = await tx.stockLot.create({
        data: {
          productId: lot.productId,
          costPrice: lot.costPrice,
          quantity: new Prisma.Decimal(splitQty),
          remaining: new Prisma.Decimal(splitQty),
          lotNumber: newLotNumber ?? (lot.lotNumber ? `${lot.lotNumber}-A` : null),
          expiresAt: newExpiresAt !== undefined ? (newExpiresAt ? new Date(newExpiresAt) : null) : lot.expiresAt,
          supplierId: lot.supplierId,
        }
      });
      
      return newLot;
    });
  }

  // ── Reconciliação de Lotes ──────────────────────────────────────────────────

  /**
   * Reconcilia os lotes do produto com um novo valor absoluto de estoque.
   * Zera todos os lotes ativos e cria um lote de ajuste com o novo valor.
   * Garante que product.stock == sum(lot.remaining > 0) SEMPRE.
   */
  async reconcileLots(
    tx: any,
    productId: string,
    newStock: number,
    reason: string,
  ): Promise<void> {
    // 1. Buscar lotes ativos (remaining > 0)
    const activeLots = await tx.stockLot.findMany({
      where: { productId, remaining: { gt: 0 } },
    });

    // 2. Calcular custo médio ponderado dos lotes ativos
    let totalCost = 0;
    let totalQty = 0;
    for (const lot of activeLots) {
      const r = Number(lot.remaining);
      totalCost += r * Number(lot.costPrice);
      totalQty += r;
    }
    const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

    // 3. Zerar o remaining de todos os lotes ativos (viram histórico)
    if (activeLots.length > 0) {
      await tx.stockLot.updateMany({
        where: { id: { in: activeLots.map((l: any) => l.id) } },
        data: { remaining: 0 },
      });
    }

    // 4. Criar lote de ajuste (se newStock > 0)
    if (newStock > 0) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { priceCost: true },
      });
      const finalCost = avgCost > 0 ? avgCost : Number(product?.priceCost ?? 0);

      await tx.stockLot.create({
        data: {
          productId,
          costPrice: new Prisma.Decimal(finalCost),
          quantity: new Prisma.Decimal(newStock),
          remaining: new Prisma.Decimal(newStock),
          lotNumber: `${reason.substring(0, 3).toUpperCase()}-${new Date().toISOString().slice(0, 10)}`,
        },
      });
    }

    // 5. Sincronizar product.stock com a soma dos lotes
    await this.syncProductStockAndCost(tx, productId);
  }
}
