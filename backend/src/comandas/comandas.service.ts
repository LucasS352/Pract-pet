import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { serviceSnapshot, extendTimer, releaseComandaAssets } from './service-timer.rules';
import { ShortReadCache } from '../prisma/short-read-cache';
import { KdsService } from './kds.service';
import { initialKds } from './kds.rules';
import { Prisma } from '@prisma/client';
import { retryTransaction } from '../prisma/transaction-retry';
import { lockProducts } from '../prisma/lock-products';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { TenantsService } from '../tenants/tenants.service';
import { createHash, randomBytes } from 'crypto';
import { fingerprintComandaItems, validateComandaItemKey } from './comanda-item-idempotency';

type ComandaActor = { operatorId?: string; userId?: string; name?: string };

@Injectable()
export class ComandasService {
  private readonly listReads = new ShortReadCache();
  private readonly logger = new Logger(ComandasService.name);

  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService,
    private readonly integrationsService: IntegrationsService,
    private readonly kds: KdsService,
    private readonly tenantsService?: TenantsService,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  private async requireCarvoaria() {
    if (!(await this.kds.config()).carvoariaEnabled) throw new ForbiddenException('Carvoaria não está ativa nesta loja.');
  }

  private async lockOpenComanda(tx: any, comandaId: string, statuses = ['open', 'waiting_payment']) {
    const rows = await tx.$queryRaw(Prisma.sql`SELECT id, status FROM comandas WHERE id = ${comandaId} FOR UPDATE`);
    if (!rows.length) throw new NotFoundException('Comanda não encontrada.');
    if (!statuses.includes(rows[0].status)) throw new ConflictException('A comanda mudou de estado. Atualize a tela.');
  }

  private normalizeReason(reason: unknown) {
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      throw new BadRequestException('Informe um motivo entre 3 e 500 caracteres.');
    }
    return reason.trim();
  }

  private tokenHash(token: unknown) {
    if (typeof token !== 'string' || token.length < 32) {
      throw new ForbiddenException('Autorização por PIN ausente ou inválida.');
    }
    return createHash('sha256').update(token).digest('hex');
  }

  private async consumeAuthorization(
    tx: any,
    token: unknown,
    action: 'remove_item' | 'cancel_comanda',
    comandaId: string,
    itemId?: string,
  ) {
    const tokenHash = this.tokenHash(token);
    const now = new Date();
    const authorization = await tx.comandaActionAuthorization.findFirst({
      where: { tokenHash, action, comandaId, comandaItemId: itemId || null, consumedAt: null, expiresAt: { gt: now } },
    });
    if (!authorization) throw new ForbiddenException('A autorização por PIN expirou, foi usada ou não pertence a esta ação.');
    const consumed = await tx.comandaActionAuthorization.updateMany({
      where: { id: authorization.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new ConflictException('A autorização já foi utilizada. Informe o PIN novamente.');
    return authorization;
  }

  async authorizeAction(
    comandaId: string,
    body: { action: string; itemId?: string; pin: string },
    actor: ComandaActor,
  ) {
    if (!['remove_item', 'cancel_comanda'].includes(body?.action)) {
      throw new BadRequestException('Ação sensível inválida.');
    }
    if (typeof body.pin !== 'string' || !/^\d{4,12}$/.test(body.pin)) {
      throw new BadRequestException('Informe um PIN válido.');
    }
    const prisma = await this.getPrisma();
    const comanda = await (prisma as any).comanda.findUnique({ where: { id: comandaId } });
    if (!comanda) throw new NotFoundException('Comanda não encontrada.');
    if (!['open', 'waiting_payment'].includes(comanda.status)) {
      throw new BadRequestException('Esta comanda não pode mais ser alterada.');
    }
    if (body.action === 'remove_item') {
      if (!body.itemId) throw new BadRequestException('Item obrigatório para remoção.');
      const item = await (prisma as any).comandaItem.findFirst({ where: { id: body.itemId, comandaId } });
      if (!item || item.status !== 'active') throw new NotFoundException('Item ativo não encontrado nesta comanda.');
      if (comanda.status !== 'open') throw new BadRequestException('Reabra a comanda antes de remover itens.');
    }
    if (!this.tenantsService) throw new ForbiddenException('Serviço de autorização indisponível.');
    const verification = await this.tenantsService.verifyCashierPin(this.tenantContext.get().tenantId, body.pin);
    if (!verification.authorized) throw new ForbiddenException('PIN do Caixa ou Gerente incorreto.');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await (prisma as any).comandaActionAuthorization.create({
      data: {
        tokenHash: this.tokenHash(token), action: body.action, comandaId,
        comandaItemId: body.action === 'remove_item' ? body.itemId : null,
        requestedByOperatorId: actor.operatorId || actor.userId || null,
        requestedByName: actor.name || null,
        authorizationType: verification.authType,
        authorizedByOperatorId: verification.managerOpId || null,
        authorizedByName: verification.managerName || (verification.authType === 'cashier_pin' ? 'PIN do Caixa' : null),
        expiresAt,
      },
    });
    return { authorizationToken: token, expiresAt: expiresAt.toISOString() };
  }

  async availableAssets(productId: string) {
    await this.requireCarvoaria();
    const db = await this.getPrisma();
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const total = product.requiresCarvoaria ? (product.assetTrackingTotal || 0) : 0;
    const occupied = await db.comandaAssetReservation.findMany({
      where: { assetNumber: { lte: total } },
      select: { assetNumber: true, item: { select: { comanda: { select: { id: true, number: true } } } } },
      orderBy: { assetNumber: 'asc' },
    });
    return { total, occupied: occupied.map(row => ({ assetNumber: row.assetNumber, comanda: row.item.comanda })) };
  }

  async serviceRounds() {
    await this.requireCarvoaria();
    const db = await this.getPrisma();
    const items = await db.comandaItem.findMany({
      where: { status: 'active', assetReturnedAt: null, OR: [{ timerMinutes: { not: null } }, { assetNumber: { not: null } }],
        comanda: { status: { in: ['open', 'waiting_payment'] } } },
      include: { product: { select: { name: true } }, comanda: { select: { id: true, number: true, status: true } } },
      orderBy: [{ timerDueAt: 'asc' }, { createdAt: 'asc' }],
    });
    return { serverTime: new Date().toISOString(), items };
  }

  async snoozeTimer(comandaId: string, itemId: string, minutes: number, expectedDueAt: string) {
    await this.requireCarvoaria();
    const db = await this.getPrisma();
    return retryTransaction(() => db.$transaction(async tx => {
      await this.lockOpenComanda(tx, comandaId);
      const item = await tx.comandaItem.findFirst({ where: { id: itemId, comandaId, status: 'active' } });
      if (!item) throw new NotFoundException('Item não encontrado nesta comanda.');
      if (!item.timerStartedAt || !item.timerDueAt || item.assetReturnedAt)
        throw new BadRequestException('Este item não possui uma ronda em andamento.');
      if (typeof expectedDueAt !== 'string' || new Date(expectedDueAt).getTime() !== item.timerDueAt.getTime())
        throw new ConflictException('A ronda foi atualizada em outra tela. Atualize antes de prorrogar.');
      return tx.comandaItem.update({ where: { id: itemId }, data: { timerDueAt: extendTimer(item.timerDueAt, minutes, new Date()) } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  async returnAsset(comandaId: string, itemId: string) {
    await this.requireCarvoaria();
    const db = await this.getPrisma();
    return retryTransaction(() => db.$transaction(async tx => {
      await this.lockOpenComanda(tx, comandaId);
      const item = await tx.comandaItem.findFirst({ where: { id: itemId, comandaId, status: 'active' } });
      if (!item) throw new NotFoundException('Item não encontrado nesta comanda.');
      if (item.assetReturnedAt) return item;
      if ((!item.assetNumber && !item.timerMinutes) || item.kdsStatus !== 'DELIVERED')
        throw new BadRequestException('Somente itens de atendimento já entregues podem ser recolhidos.');
      await tx.comandaAssetReservation.deleteMany({ where: { comandaItemId: itemId } });
      return tx.comandaItem.update({ where: { id: itemId }, data: { assetReturnedAt: new Date() } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  async findAll(status: string = 'open') {
    const prisma = await this.getPrisma();
    const whereClause: any = {};

    if (status === 'open') {
      // Default: busca todas as comandas ativas no salão (open e waiting_payment)
      whereClause.status = { in: ['open', 'waiting_payment'] };
    } else if (status !== 'all') {
      whereClause.status = status;
    }

    const comandas = await this.listReads.get(this.tenantContext.get().tenantId + ':' + status, () => (prisma as any).comanda.findMany({
      where: whereClause,
      include: {
        items: {
          where: { status: 'active' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                priceSell: true,
                unit: true,
                barcode: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        sale: {
          select: {
            id: true,
            total: true,
            createdAt: true,
          },
        },
        responsibleWaiter: {
          select: {
            id: true,
            name: true,
            jobTitle: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }));

    return comandas;
  }

  async findOne(id: string) {
    this.listReads.clear();
    const prisma = await this.getPrisma();
    const comanda = await (prisma as any).comanda.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            modifiers: true,
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        sale: true,
        auditEvents: { orderBy: { createdAt: 'desc' } },
        responsibleWaiter: {
          select: {
            id: true,
            name: true,
            jobTitle: true,
          },
        },
      },
    });

    if (!comanda) {
      throw new NotFoundException('Comanda não encontrada.');
    }

    return comanda;
  }

  async create(data: {
    number: string;
    customerName?: string;
    notes?: string;
    responsibleWaiterId?: string;
    waiterId?: string;
  }) {
    const prisma = await this.getPrisma();

    if (!data.number || data.number.trim() === '') {
      throw new BadRequestException('O número ou identificador da comanda é obrigatório.');
    }

    // Verificar se já existe uma comanda ativa (open ou waiting_payment) com o mesmo número
    const existingActive = await (prisma as any).comanda.findFirst({
      where: {
        number: data.number.trim(),
        status: { in: ['open', 'waiting_payment'] },
      },
    });

    if (existingActive) {
      throw new BadRequestException(`Já existe uma comanda/mesa aberta com a identificação "${data.number}".`);
    }

    const responsibleWaiterId = data.responsibleWaiterId || data.waiterId || null;

    const createData: any = {
      number: data.number.trim(),
      customerName: data.customerName?.trim() || null,
      notes: data.notes?.trim() || null,
      status: 'open',
      total: 0,
      responsibleWaiterId,
    };

    let comanda: any;
    try {
      comanda = await (prisma as any).comanda.create({
        data: createData,
        include: {
          items: { include: { product: true } },
          responsibleWaiter: { select: { id: true, name: true, jobTitle: true } },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2000' && createData.notes && createData.notes.length > 190) {
        // Fallback defensivo para bancos onde a coluna notes ainda seja varchar(191)
        createData.notes = createData.notes.slice(0, 190);
        comanda = await (prisma as any).comanda.create({
          data: createData,
          include: {
            items: { include: { product: true } },
            responsibleWaiter: { select: { id: true, name: true, jobTitle: true } },
          },
        });
      } else {
        throw err;
      }
    }

    return comanda;
  }

  async addItems(
    comandaId: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice?: number;
      notes?: string;
      createdById?: string;
      modifiers?: Array<{ optionId: string }>;
      serveImmediately?: boolean;
      assetNumber?: number;
    }>,
    idempotencyKey: string,
  ) {
    validateComandaItemKey(idempotencyKey);
    if (!items || items.length === 0) throw new BadRequestException('Nenhum item fornecido para lançamento.');
    const requestFingerprint = fingerprintComandaItems(items);
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    // ── Ler configurações do tenant ──────────────────────────────────────────
    const tenantSettings = await (prisma as any).tenantSettings.findFirst();
    const allowNegativeStock: boolean = tenantSettings?.allowNegativeStock ?? false;
    const features = await this.kds.config();

    // ── IDs dos produtos cujo estoque foi alterado (para sync pós-commit) ────
    const affectedProductIds = new Set<string>();

    // ── Transação principal ──────────────────────────────────────────────────
    const replayed = await retryTransaction(() => (prisma as any).$transaction(async (tx: any) => {
      // Serializa lançamentos da mesma mesa e disputa com o fechamento no caixa.
      // A validação anterior à transação pode ter ficado desatualizada.
      const current = await tx.$queryRaw(
        Prisma.sql`SELECT id, number, status FROM comandas WHERE id = ${comandaId} FOR UPDATE`,
      );
      if (!current.length) throw new NotFoundException('Comanda não encontrada.');
      const comanda = current[0];
      const existingAttempt = await tx.comandaAuditEvent.findFirst({
        where: { comandaId, action: 'items_added', reason: idempotencyKey },
        select: { snapshot: true },
      });
      if (existingAttempt) {
        if ((existingAttempt.snapshot as any)?.fingerprint !== requestFingerprint) {
          throw new ConflictException('Esta chave de lançamento já foi usada com outros itens. Atualize a tela antes de tentar novamente.');
        }
        return true;
      }
      if (current[0].status !== 'open') {
        throw new BadRequestException('A comanda mudou de estado. Atualize a tela antes de lançar itens.');
      }
      const involvedProducts = await tx.product.findMany({
        where: { id: { in: items.map(item => item.productId) } },
        select: { id: true, modifierGroups: { select: { options: { select: { id: true, componentProductId: true } } } } },
      });
      const selectedOptions = new Set(items.flatMap(item => (item.modifiers || []).map(option => option.optionId)));
      const lockIds = involvedProducts.flatMap((product: any) => [product.id,
        ...(product.modifierGroups || []).flatMap((group: any) => group.options
          .filter((option: any) => selectedOptions.has(option.id))
          .map((option: any) => option.componentProductId)),
      ]);
      await lockProducts(tx, lockIds);
      for (const item of items) {
        const qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) throw new BadRequestException('Quantidade inválida.');

        // Buscar produto com grupos de modificadores (necessário para compostos)
        let product = await tx.product.findUnique({
          where: { id: item.productId },
          include: {
            modifierGroups: {
              include: {
                options: {
                  include: {
                    componentProduct: true,
                  },
                },
              },
            },
            category: true,
          },
        });

        if (!product) {
          const petSvc = await tx.petService.findUnique({ where: { id: item.productId } });
          if (petSvc) {
            let servCat = await tx.category.findFirst({ where: { name: 'Serviços' } });
            if (!servCat) {
              servCat = await tx.category.create({ data: { name: 'Serviços', color: '#0d9488' } });
            }
            product = await tx.product.create({
              data: {
                id: petSvc.id,
                name: petSvc.name,
                priceSell: new Prisma.Decimal(petSvc.price),
                priceCost: new Prisma.Decimal(0),
                stock: new Prisma.Decimal(99999),
                unit: 'SV',
                active: petSvc.active !== false,
                categoryId: servCat.id,
                emiteNfce: false,
              },
              include: {
                modifierGroups: {
                  include: {
                    options: {
                      include: {
                        componentProduct: true,
                      },
                    },
                  },
                },
                category: true,
              },
            });
          }
        }

        if (!product) throw new NotFoundException(`Produto ID ${item.productId} não encontrado.`);
        const serveImmediately = item.serveImmediately ?? (!product.requiresKitchen && !product.requiresCarvoaria);
        const kdsData = {
          ...initialKds(product, features.kdsEnabled, serveImmediately, features.carvoariaEnabled),
          ...serviceSnapshot(product, item.assetNumber, qty, features.carvoariaEnabled),
        };
        const reservation = item.assetNumber == null ? {} : { assetReservation: { create: { assetNumber: item.assetNumber } } };

        // ════════════════════════════════════════════════════════════════════
        //  PRODUTO SIMPLES
        // ════════════════════════════════════════════════════════════════════
        if (!product.isComposite || product.modifierGroups.length === 0) {
          if (item.modifiers?.length) {
            throw new BadRequestException(
              `Os adicionais de "${product.name}" mudaram. Remova o item do carrinho e adicione-o novamente.`,
            );
          }
          const unitPrice = item.unitPrice !== undefined
            ? new Prisma.Decimal(item.unitPrice)
            : new Prisma.Decimal(product.priceSell);
          const totalPrice = unitPrice.mul(new Prisma.Decimal(qty)).toDecimalPlaces(2);

          const isServiceProduct =
            product.unit === 'SV' ||
            product.category?.name?.toLowerCase().includes('serviç') ||
            Number(product.stock ?? 0) >= 90000;

          if (!isServiceProduct) {
            // Decremento atômico: evita race condition entre comandas simultâneas
            if (!allowNegativeStock) {
              const result = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  stock: { gte: new Prisma.Decimal(qty) },
                },
                data: { stock: { decrement: new Prisma.Decimal(qty) } },
              });
              if (result.count === 0) {
                const p = await tx.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
                throw new BadRequestException(
                  `Estoque insuficiente para "${product.name}". ` +
                  `Disponível: ${Number(p?.stock ?? 0).toFixed(3)}, necessário: ${qty}.`,
                );
              }
            } else {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { decrement: new Prisma.Decimal(qty) } },
              });
            }

            await tx.inventoryLog.create({
              data: {
                productId: item.productId,
                type: 'OUT',
                quantity: new Prisma.Decimal(qty),
                origin: 'COMANDA',
                reason: `Lançamento na Comanda #${comanda.number}`,
                referenceId: comanda.id,
              },
            });
          }

          await tx.comandaItem.create({
            data: {
              comandaId,
              productId: item.productId,
              quantity: new Prisma.Decimal(qty),
              unitPrice,
              totalPrice,
              notes: item.notes || null,
              createdById: item.createdById || null,
              stockDeducted: true,
              ...kdsData,
              ...reservation,
            },
          });

          affectedProductIds.add(item.productId);

        // ════════════════════════════════════════════════════════════════════
        //  PRODUTO COMPOSTO
        // ════════════════════════════════════════════════════════════════════
        } else {
          // Validar que modifiers foram enviados
          if (!item.modifiers || item.modifiers.length === 0) {
            throw new BadRequestException(
              `Produto composto "${product.name}" requer seleção de adicionais (modifiers).`,
            );
          }

          // Validar que não há optionIds duplicados
          const sentOptionIds = item.modifiers.map(m => m.optionId);
          const uniqueSent = new Set(sentOptionIds);
          if (uniqueSent.size !== sentOptionIds.length) {
            throw new BadRequestException(
              `Seleções duplicadas de opções para o produto "${product.name}". Cada grupo deve ter exatamente uma opção.`,
            );
          }

          // Validar que a quantidade enviada é exatamente igual ao número de grupos
          if (sentOptionIds.length !== product.modifierGroups.length) {
            throw new BadRequestException(
              `Número de seleções inválido para "${product.name}". ` +
              `Esperado: ${product.modifierGroups.length} (um por grupo), recebido: ${sentOptionIds.length}.`,
            );
          }

          // Mapear todos os optionIds válidos do produto para validação
          const allValidOptionIds = new Set<string>(
            product.modifierGroups.flatMap((g: any) => g.options.map((o: any) => o.id)),
          );

          // Verificar que todas as opções enviadas pertencem ao produto
          for (const optionId of sentOptionIds) {
            if (!allValidOptionIds.has(optionId)) {
              throw new BadRequestException(
                `Opção "${optionId}" não pertence ao produto "${product.name}".`,
              );
            }
          }

          const modifiersToCreate: any[] = [];
          let priceAdjustmentTotal = new Prisma.Decimal(0);

          // Processar cada grupo do produto (garante exatamente 1 opção por grupo)
          for (const group of product.modifierGroups) {
            // Validar minSelected/maxSelected = 1 (multi-seleção não suportado nesta fase)
            if (group.minSelected !== 1 || group.maxSelected !== 1) {
              throw new BadRequestException(
                `Grupo "${group.name}" do produto "${product.name}" requer seleção múltipla ` +
                `(minSelected=${group.minSelected}, maxSelected=${group.maxSelected}) ` +
                `e ainda não é suportado em comandas. Utilize o PDV para este produto.`,
              );
            }

            // Encontrar a optionId enviada para este grupo
            const groupOptionIds = group.options.map((o: any) => o.id);
            const matchingOptionId = sentOptionIds.find(id => groupOptionIds.includes(id));

            if (!matchingOptionId) {
              throw new BadRequestException(
                `Nenhuma opção selecionada para o grupo "${group.name}" do produto "${product.name}".`,
              );
            }

            const option = group.options.find((o: any) => o.id === matchingOptionId);
            if (!option) {
              throw new BadRequestException(`Opção inválida para o produto "${product.name}".`);
            }

            const componentProduct = option.componentProduct;
            const volumeCapacity = Number(componentProduct.volumeCapacity) || 1;
            // consumedQuantity já calculado e persistido — nunca recalculado no futuro
            const consumedQuantity = qty * (Number(option.quantity) / volumeCapacity);

            // Decremento atômico do ingrediente
            if (!allowNegativeStock) {
              const result = await tx.product.updateMany({
                where: {
                  id: componentProduct.id,
                  stock: { gte: new Prisma.Decimal(consumedQuantity) },
                },
                data: { stock: { decrement: new Prisma.Decimal(consumedQuantity) } },
              });
              if (result.count === 0) {
                const p = await tx.product.findUnique({ where: { id: componentProduct.id }, select: { stock: true } });
                throw new BadRequestException(
                  `Estoque insuficiente para o ingrediente "${componentProduct.name}" ` +
                  `(${product.name}). Disponível: ${Number(p?.stock ?? 0).toFixed(3)}, necessário: ${consumedQuantity.toFixed(3)}.`,
                );
              }
            } else {
              await tx.product.update({
                where: { id: componentProduct.id },
                data: { stock: { decrement: new Prisma.Decimal(consumedQuantity) } },
              });
            }

            await tx.inventoryLog.create({
              data: {
                productId: componentProduct.id,
                type: 'OUT',
                quantity: new Prisma.Decimal(consumedQuantity),
                origin: 'COMANDA',
                reason: `Lançamento na Comanda #${comanda.number} (Composto: ${product.name})`,
                referenceId: comanda.id,
              },
            });

            priceAdjustmentTotal = priceAdjustmentTotal.add(new Prisma.Decimal(option.priceAdjustment));
            affectedProductIds.add(componentProduct.id);

            modifiersToCreate.push({
              optionId: option.id,
              componentProductId: componentProduct.id,
              name: option.name,
              consumedQuantity: new Prisma.Decimal(consumedQuantity),
              priceAdjustment: new Prisma.Decimal(option.priceAdjustment),
            });
          }

          // Preço calculado no backend — nunca vindo do frontend
          const unitPrice = new Prisma.Decimal(product.priceSell).add(priceAdjustmentTotal);
          const totalPrice = unitPrice.mul(new Prisma.Decimal(qty)).toDecimalPlaces(2);

          await tx.comandaItem.create({
            data: {
              comandaId,
              productId: item.productId,
              quantity: new Prisma.Decimal(qty),
              unitPrice,
              totalPrice,
              notes: item.notes || null,
              createdById: item.createdById || null,
              stockDeducted: true,
              ...kdsData,
              ...reservation,
              modifiers: {
                create: modifiersToCreate,
              },
            },
          });
        }
      }

      // Recalcular total da comanda dentro da transação
      const allItems = await tx.comandaItem.findMany({ where: { comandaId, status: 'active' } });
      const newTotal = allItems.reduce((acc: number, i: any) => acc + Number(i.totalPrice), 0);
      await tx.comanda.update({
        where: { id: comandaId },
        data: { total: new Prisma.Decimal(Number(newTotal.toFixed(2))) },
      });
      await tx.comandaAuditEvent.create({ data: {
        comandaId, action: 'items_added', reason: idempotencyKey,
        authorizationType: 'not_required',
        snapshot: { fingerprint: requestFingerprint },
      } });
      return false;
    }, { isolationLevel: 'ReadCommitted' })).catch(error => {
      if (error?.code === 'P2002' && items.some(item => item.assetNumber != null))
        throw new ConflictException('Equipamento já reservado por outra mesa. Atualize a disponibilidade e escolha outro número.');
      throw error;
    });

    // ── Pós-commit: invalidar cache e sincronizar integrações ────────────────
    if (replayed) return this.findOne(comandaId);
    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      this.logger.error(`Erro ao invalidar cache: ${err.message}`);
    }
    if (affectedProductIds.size > 0) {
      setTimeout(() => {
        this.integrationsService
          .syncProductStock(tenantId, [...affectedProductIds])
          .catch(err => this.logger.error(`Erro ao sincronizar estoque: ${err.message}`));
      }, 500);
    }
    this.kds.invalidateQueue?.();

    return this.findOne(comandaId);
  }

  async removeItem(comandaId: string, itemId: string, authorizationToken: string, reason: string, actor: ComandaActor, quantityToRemove?: number, expectedQuantity?: number) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();
    const removalReason = this.normalizeReason(reason);
    if (quantityToRemove !== undefined && (!Number.isInteger(quantityToRemove) || quantityToRemove < 1)) {
      throw new BadRequestException('Informe uma quantidade inteira positiva para reduzir.');
    }
    if (expectedQuantity !== undefined && (!Number.isFinite(expectedQuantity) || expectedQuantity <= 0)) {
      throw new BadRequestException('Quantidade esperada inválida.');
    }

    const comanda = await (prisma as any).comanda.findUnique({
      where: { id: comandaId },
    });

    if (!comanda) throw new NotFoundException('Comanda não encontrada.');

    if (comanda.status === 'waiting_payment') {
      throw new BadRequestException('Comanda aguardando fechamento no caixa. Reabra a comanda para remover itens.');
    }
    if (comanda.status !== 'open') {
      throw new BadRequestException('Comanda inválida ou já encerrada.');
    }

    // Buscar item com segurança dupla: id + comandaId (evita remover item de outra comanda)
    const item = await (prisma as any).comandaItem.findFirst({
      where: { id: itemId, comandaId: comandaId },
      include: {
        modifiers: true,
        product: { select: { id: true, name: true, isComposite: true } },
      },
    });

    if (!item || item.status !== 'active') throw new NotFoundException('Item ativo não encontrado nesta comanda.');

    const affectedProductIds = new Set<string>();

    await retryTransaction(() => (prisma as any).$transaction(async (tx: any) => {
      await this.lockOpenComanda(tx, comandaId, ['open']);
      const authorization = await this.consumeAuthorization(tx, authorizationToken, 'remove_item', comandaId, itemId);
      const item = await tx.comandaItem.findFirst({ where: { id: itemId, comandaId },
        include: { modifiers: true, product: { select: { id: true, name: true, isComposite: true } } } });
      if (!item || item.status !== 'active') throw new NotFoundException('Item já removido desta comanda.');
      const originalQuantity = new Prisma.Decimal(item.quantity);
      if (expectedQuantity !== undefined && !originalQuantity.eq(expectedQuantity))
        throw new ConflictException('A quantidade da comanda mudou. Atualize a tela antes de reduzir.');
      const removedQuantity = quantityToRemove === undefined ? originalQuantity : new Prisma.Decimal(quantityToRemove);
      if (removedQuantity.gt(originalQuantity)) throw new ConflictException('A quantidade da comanda mudou. Atualize a tela antes de reduzir.');
      const remainingQuantity = originalQuantity.sub(removedQuantity);
      const fullRemoval = remainingQuantity.eq(0);
      await lockProducts(tx, [item.productId, ...item.modifiers.map((m: any) => m.componentProductId)]);
      // Estorno de estoque apenas se stockDeducted = true
      if (item.stockDeducted) {
        if (item.modifiers && item.modifiers.length > 0) {
          // Produto composto: estornar via snapshot (consumedQuantity já calculado)
          for (const mod of item.modifiers) {
            const oldConsumed = new Prisma.Decimal(mod.consumedQuantity);
            const remainingConsumed = fullRemoval ? new Prisma.Decimal(0) : oldConsumed.mul(remainingQuantity).div(originalQuantity).toDecimalPlaces(3);
            const restored = oldConsumed.sub(remainingConsumed);
            await tx.product.update({
              where: { id: mod.componentProductId },
              data: { stock: { increment: restored } },
            });
            await tx.inventoryLog.create({
              data: {
                productId: mod.componentProductId,
                type: 'IN',
                quantity: restored,
                origin: 'COMANDA',
                reason: `${fullRemoval ? 'Remoção' : 'Redução'} autorizada da Comanda #${comanda.number}: ${removalReason} (Composto: ${item.product.name})`,
                referenceId: comandaId,
              },
            });
            if (!fullRemoval) await tx.comandaItemModifier.update({ where: { id: mod.id }, data: { consumedQuantity: remainingConsumed } });
            affectedProductIds.add(mod.componentProductId);
          }
        } else {
          // Produto simples
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: removedQuantity } },
          });
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'IN',
              quantity: removedQuantity,
              origin: 'COMANDA',
              reason: `${fullRemoval ? 'Remoção' : 'Redução'} autorizada da Comanda #${comanda.number}: ${removalReason}`,
              referenceId: comandaId,
            },
          });
          affectedProductIds.add(item.productId);
        }
      } else if (!fullRemoval) {
        // Lançamentos legados sem baixa de estoque ainda precisam manter o snapshot
        // dos ingredientes coerente com a quantidade restante.
        for (const mod of item.modifiers) {
          const remainingConsumed = new Prisma.Decimal(mod.consumedQuantity)
            .mul(remainingQuantity).div(originalQuantity).toDecimalPlaces(3);
          await tx.comandaItemModifier.update({ where: { id: mod.id }, data: { consumedQuantity: remainingConsumed } });
        }
      }

      await tx.comandaItem.update({ where: { id: itemId }, data: fullRemoval ? {
        status: 'removed', removedAt: new Date(), removalReason,
        removedByOperatorId: actor.operatorId || actor.userId || null,
        removedByName: actor.name || null,
        removalAuthorizationType: authorization.authorizationType,
        removalAuthorizedById: authorization.authorizedByOperatorId,
        removalAuthorizedByName: authorization.authorizedByName,
      } : {
        quantity: remainingQuantity,
        totalPrice: new Prisma.Decimal(item.unitPrice).mul(remainingQuantity).toDecimalPlaces(2),
      } });
      if (fullRemoval) await tx.comandaAssetReservation.deleteMany({ where: { comandaItemId: itemId } });
      await tx.comandaAuditEvent.create({ data: {
        comandaId, comandaItemId: itemId, action: fullRemoval ? 'item_removed' : 'item_quantity_reduced', reason: removalReason,
        requestedByOperatorId: actor.operatorId || actor.userId || null,
        requestedByName: actor.name || null,
        authorizationType: authorization.authorizationType,
        authorizedByOperatorId: authorization.authorizedByOperatorId,
        authorizedByName: authorization.authorizedByName,
        snapshot: {
          productId: item.productId, productName: item.product.name, quantity: String(item.quantity),
          unitPrice: String(item.unitPrice), totalPrice: String(item.totalPrice),
          removedQuantity: String(removedQuantity), remainingQuantity: String(remainingQuantity),
          kdsStatus: item.kdsStatus, kdsDestination: item.kdsDestination,
          modifiers: item.modifiers.map((modifier: any) => ({ name: modifier.name, consumedQuantity: String(modifier.consumedQuantity) })),
        },
      } });

      // Recalcular total
      const remaining = await tx.comandaItem.findMany({ where: { comandaId, status: 'active' } });
      const newTotal = remaining.reduce((acc: number, i: any) => acc + Number(i.totalPrice), 0);
      await tx.comanda.update({
        where: { id: comandaId },
        data: { total: new Prisma.Decimal(Number(newTotal.toFixed(2))) },
      });
    }, { isolationLevel: 'ReadCommitted' }));

    // Pós-commit
    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      this.logger.error(`Erro ao invalidar cache: ${err.message}`);
    }
    if (affectedProductIds.size > 0) {
      setTimeout(() => {
        this.integrationsService
          .syncProductStock(tenantId, [...affectedProductIds])
          .catch(err => this.logger.error(`Erro ao sincronizar estoque: ${err.message}`));
      }, 500);
    }
    this.kds.invalidateQueue?.();

    return this.findOne(comandaId);
  }

  async requestPayment(comandaId: string) {
    const prisma = await this.getPrisma();
    const comanda = await (prisma as any).comanda.findUnique({
      where: { id: comandaId },
      include: { items: { where: { status: 'active' } } },
    });

    if (!comanda) throw new NotFoundException('Comanda não encontrada.');

    // Idempotência: se já estiver em waiting_payment, retorna com sucesso HTTP 200
    if (comanda.status === 'waiting_payment') {
      return this.findOne(comandaId);
    }

    if (comanda.status !== 'open') {
      throw new BadRequestException('Apenas comandas abertas podem solicitar fechamento.');
    }

    if (!comanda.items || comanda.items.length === 0) {
      throw new BadRequestException('Não é possível solicitar fechamento de uma comanda sem itens lançados.');
    }

    const changed = await (prisma as any).comanda.updateMany({
      where: { id: comandaId, status: 'open' },
      data: { status: 'waiting_payment' },
    });
    if (!changed.count) throw new ConflictException('Comanda alterada em outra tela. Atualize antes de solicitar pagamento.');

    return this.findOne(comandaId);
  }

  async reopen(comandaId: string) {
    const prisma = await this.getPrisma();
    const comanda = await (prisma as any).comanda.findUnique({
      where: { id: comandaId },
    });

    if (!comanda) throw new NotFoundException('Comanda não encontrada.');

    if (comanda.status !== 'waiting_payment') {
      throw new BadRequestException('Apenas comandas aguardando pagamento podem ser reabertas.');
    }

    const changed = await (prisma as any).comanda.updateMany({
      where: { id: comandaId, status: 'waiting_payment' },
      data: { status: 'open' },
    });
    if (!changed.count) throw new ConflictException('Comanda alterada em outra tela. Atualize antes de reabrir.');

    return this.findOne(comandaId);
  }

  async closeComanda(comandaId: string, saleId?: string) {
    const prisma = await this.getPrisma();
    const comanda = await (prisma as any).comanda.findUnique({
      where: { id: comandaId },
    });

    if (!comanda) throw new NotFoundException('Comanda não encontrada.');

    // Idempotência se já estiver fechada
    if (comanda.status === 'closed') {
      return comanda;
    }

    // Permite fechar tanto comanda open quanto waiting_payment (retrocompatibilidade)
    const updated = await retryTransaction(() => (prisma as any).$transaction(async (tx: any) => {
      await this.lockOpenComanda(tx, comandaId);
      await releaseComandaAssets(tx, comandaId);
      return tx.comanda.update({ where: { id: comandaId }, data: { status: 'closed', saleId: saleId || null } });
    }, { isolationLevel: 'ReadCommitted' }));

    return updated;
  }

  async cancelComanda(comandaId: string, authorizationToken: string, reason: string, actor: ComandaActor) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();
    const cancellationReason = this.normalizeReason(reason);

    // Buscar comanda com todos os itens e modifiers para estorno correto
    const comanda = await (prisma as any).comanda.findUnique({
      where: { id: comandaId },
      include: {
        items: {
          include: {
            modifiers: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!comanda) throw new NotFoundException('Comanda não encontrada.');

    if (!['open', 'waiting_payment'].includes(comanda.status)) {
      throw new BadRequestException(
        `Não é possível cancelar uma comanda com status "${comanda.status}". ` +
        `Apenas comandas abertas ou aguardando pagamento podem ser canceladas.`,
      );
    }

    const affectedProductIds = new Set<string>();

    await retryTransaction(() => (prisma as any).$transaction(async (tx: any) => {
      await this.lockOpenComanda(tx, comandaId);
      const authorization = await this.consumeAuthorization(tx, authorizationToken, 'cancel_comanda', comandaId);
      const comanda = await tx.comanda.findUnique({ where: { id: comandaId },
        include: { items: { include: { modifiers: true, product: { select: { id: true, name: true } } } } } });
      const activeItems = comanda.items.filter((item: any) => item.status === 'active');
      await lockProducts(tx, activeItems.flatMap((item: any) => [item.productId, ...item.modifiers.map((m: any) => m.componentProductId)]));
      await releaseComandaAssets(tx, comandaId);
      // Estornar estoque de todos os itens com stockDeducted = true
      for (const item of activeItems) {
        if (!item.stockDeducted) continue;

        if (item.modifiers && item.modifiers.length > 0) {
          // Produto composto: estornar via snapshot
          for (const mod of item.modifiers) {
            await tx.product.update({
              where: { id: mod.componentProductId },
              data: { stock: { increment: new Prisma.Decimal(mod.consumedQuantity) } },
            });
            await tx.inventoryLog.create({
              data: {
                productId: mod.componentProductId,
                type: 'IN',
                quantity: new Prisma.Decimal(mod.consumedQuantity),
                origin: 'COMANDA',
                reason: `Cancelamento autorizado da Comanda #${comanda.number}: ${cancellationReason} (Composto: ${item.product.name})`,
                referenceId: comandaId,
              },
            });
            affectedProductIds.add(mod.componentProductId);
          }
        } else {
          // Produto simples
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: new Prisma.Decimal(item.quantity) } },
          });
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              type: 'IN',
              quantity: new Prisma.Decimal(item.quantity),
              origin: 'COMANDA',
              reason: `Cancelamento autorizado da Comanda #${comanda.number}: ${cancellationReason}`,
              referenceId: comandaId,
            },
          });
          affectedProductIds.add(item.productId);
        }
      }

      const cancelledAt = new Date();
      await tx.comandaItem.updateMany({
        where: { comandaId, status: 'active' },
        data: { status: 'cancelled' },
      });
      await tx.comandaAuditEvent.create({ data: {
        comandaId, action: 'comanda_cancelled', reason: cancellationReason,
        requestedByOperatorId: actor.operatorId || actor.userId || null,
        requestedByName: actor.name || null,
        authorizationType: authorization.authorizationType,
        authorizedByOperatorId: authorization.authorizedByOperatorId,
        authorizedByName: authorization.authorizedByName,
        snapshot: {
          number: comanda.number, totalBeforeCancellation: String(comanda.total),
          items: activeItems.map((item: any) => ({ id: item.id, productName: item.product.name, quantity: String(item.quantity), totalPrice: String(item.totalPrice), kdsStatus: item.kdsStatus })),
        },
      } });
      await tx.comanda.update({
        where: { id: comandaId },
        data: {
          status: 'cancelled', cancelledAt, cancellationReason,
          cancelledByOperatorId: actor.operatorId || actor.userId || null,
          cancelledByName: actor.name || null,
          cancellationAuthorizationType: authorization.authorizationType,
          cancellationAuthorizedById: authorization.authorizedByOperatorId,
          cancellationAuthorizedByName: authorization.authorizedByName,
        },
      });
    }, { isolationLevel: 'ReadCommitted' }));

    // Pós-commit
    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      this.logger.error(`Erro ao invalidar cache: ${err.message}`);
    }
    if (affectedProductIds.size > 0) {
      setTimeout(() => {
        this.integrationsService
          .syncProductStock(tenantId, [...affectedProductIds])
          .catch(err => this.logger.error(`Erro ao sincronizar estoque: ${err.message}`));
      }, 500);
    }
    this.kds.invalidateQueue?.();

    return this.findOne(comandaId);
  }

  private async recalculateTotal(comandaId: string) {
    const prisma = await this.getPrisma();
    const items = await (prisma as any).comandaItem.findMany({
      where: { comandaId, status: 'active' },
    });

    const newTotal = items.reduce((acc: number, item: any) => acc + Number(item.totalPrice), 0);

    await (prisma as any).comanda.update({
      where: { id: comandaId },
      data: {
        total: Number(newTotal.toFixed(2)),
      },
    });
  }
}
