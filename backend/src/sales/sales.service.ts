import { Injectable, BadRequestException, ConflictException, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { NfceService } from '../nfce/nfce.service';
import { ProductsService } from '../products/products.service';
import { Prisma } from '@prisma/client';
import { retryTransaction } from '../prisma/transaction-retry';
import { lockProducts } from '../prisma/lock-products';
import { releaseComandaAssets } from '../comandas/service-timer.rules';
import { assertComandaSnapshot } from './comanda-snapshot';
import archiver = require('archiver');
import { MailService } from '../mail/mail.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  normalizeIdempotencyKey,
  computeSaleFingerprint,
  isSaleIdentityConflict,
} from './sales-idempotency.helper';

/** Mapa de método de pagamento → tPag SEFAZ (Tabela 5.4) */
const TPAG_MAP: Record<string, string> = {
  dinheiro: '01',
  credito:  '03',
  debito:   '04',
  pix:      '17',
  outros:   '99',
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private tenantManager: TenantConnectionManager,
    private heartPrisma: HeartPrismaService,
    private nfceService: NfceService,
    private tenantContext: TenantContextService,
    private productsService: ProductsService,
    private mailService: MailService,
    private integrationsService: IntegrationsService
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  private async consumeLotsFIFO(
    tx: any,
    productId: string,
    quantityToConsume: number,
    fallbackCostPrice: any
  ): Promise<{ lotId: string; quantity: Prisma.Decimal; costPrice: Prisma.Decimal }[]> {
    const activeLots = await tx.stockLot.findMany({
      where: { productId, remaining: { gt: 0 } },
      orderBy: { createdAt: 'asc' }
    });

    const consumptions: { lotId: string; quantity: Prisma.Decimal; costPrice: Prisma.Decimal }[] = [];
    let quantityNeeded = new Prisma.Decimal(quantityToConsume);

    for (const lot of activeLots) {
      if (quantityNeeded.lte(0)) break;
      const lotRemaining = new Prisma.Decimal(lot.remaining);
      const consumed = Prisma.Decimal.min(quantityNeeded, lotRemaining);

      await tx.stockLot.update({
        where: { id: lot.id },
        data: { remaining: { decrement: consumed } }
      });

      consumptions.push({
        lotId: lot.id,
        quantity: consumed,
        costPrice: new Prisma.Decimal(lot.costPrice)
      });

      quantityNeeded = quantityNeeded.sub(consumed);
    }

    if (quantityNeeded.gt(0)) {
      const latestLot = await tx.stockLot.findFirst({
        where: { productId },
        orderBy: { createdAt: 'desc' }
      });

      if (latestLot) {
        await tx.stockLot.update({
          where: { id: latestLot.id },
          data: { remaining: { decrement: quantityNeeded } }
        });
        consumptions.push({
          lotId: latestLot.id,
          quantity: quantityNeeded,
          costPrice: new Prisma.Decimal(latestLot.costPrice)
        });
      } else {
        const fallbackLot = await tx.stockLot.create({
          data: {
            productId,
            costPrice: fallbackCostPrice !== undefined && fallbackCostPrice !== null ? new Prisma.Decimal(fallbackCostPrice) : new Prisma.Decimal(0),
            quantity: 0,
            remaining: new Prisma.Decimal(0).sub(quantityNeeded)
          }
        });
        consumptions.push({
          lotId: fallbackLot.id,
          quantity: quantityNeeded,
          costPrice: new Prisma.Decimal(fallbackLot.costPrice)
        });
      }
    }

    return consumptions;
  }

  async checkoutCapabilities() {
    const db = await this.getPrisma();
    try {
      await db.sale.findFirst({ select: { requestFingerprint: true } });
      await db.saleDeliveryJob.findFirst({ select: { id: true } });
      return { protocol: 2 };
    } catch (error: any) {
      if (['P2021', 'P2022'].includes(error?.code)) return { protocol: 0 };
      throw error;
    }
  }

  async checkout(data: any) {
    const { userId, tenantId, databaseUrl } = this.tenantContext.get();
    let operatorId = data.operatorId || userId;
    const prisma = await this.getPrisma();

    const rawKey = (data.idempotencyKey || data.localId || data.id) as string | undefined;
    const canonicalId = normalizeIdempotencyKey(rawKey, tenantId);
    const incomingFingerprint = computeSaleFingerprint({ ...data, operatorId });
    const includeSale = {
      items: { include: { modifiers: true, lotConsumptions: true } },
      payments: true, customer: true,
    };
    const validateReplay = (existing: any) => {
      // Legacy sales have no trusted fingerprint. Never bless the retry as their original.
      if (!existing.requestFingerprint || existing.requestFingerprint !== incomingFingerprint) {
        throw new ConflictException({
          code: existing.requestFingerprint ? 'idempotency_conflict' : 'legacy_idempotency_review',
          message: existing.requestFingerprint
            ? 'Esta operação já existe com outro conteúdo. Confira a venda original.'
            : 'Venda antiga sem identidade verificável. Confira a venda original antes de reenviar.',
        });
      }
      return existing;
    };
    const existing = await prisma.sale.findUnique({ where: { id: canonicalId }, include: includeSale });
    if (existing) return validateReplay(existing);

    let allProductIdsToSync: string[] = [];
    let sale: any;

    try {
      sale = await retryTransaction(() => prisma.$transaction(async (tx: any) => {
      // Serializa checkouts deste tenant antes da primeira leitura da transação.
      // MAX(code)+1 precisa observar o commit anterior, inclusive com vários processos.
      // A linha singleton já pertence ao schema; não altera configurações existentes.
      await tx.$executeRaw`
        INSERT INTO tenant_settings (id) VALUES ('singleton')
        ON DUPLICATE KEY UPDATE id = 'singleton'
      `;
      let subtotal = new Prisma.Decimal(0);

      // ─── Flag de movimentação de estoque (Ajuste Fiscal pode desabilitar) ───
      const shouldMoveStock = data.movimentarEstoque !== false;
      const saleSource = data.source || 'pdv';

      // ─── 0. Ler configurações do tenant e validar caixa ────────────────────
      const isConsumption = !!data.consumedByOperatorId;
      const isAjusteFiscal = saleSource === 'ajuste_fiscal';

      let targetCashRegisterId = data.cashRegisterId;

      if (!isConsumption && !isAjusteFiscal && !targetCashRegisterId) {
        // Se não veio cashRegisterId na requisição, busca o caixa aberto DO OPERADOR ATUAL
        if (operatorId) {
          const openReg = await tx.cashRegister.findFirst({
            where: { status: 'open', operatorId },
            orderBy: { openingTime: 'desc' },
          });
          if (openReg) {
            targetCashRegisterId = openReg.id;
          }
        }

        if (!targetCashRegisterId) {
          throw new BadRequestException('Não é possível realizar venda: O operador atual não possui um caixa aberto. Abra o caixa primeiro.');
        }
      }

      let cashRegister: any = null;
      if (targetCashRegisterId) {
        cashRegister = await tx.cashRegister.findUnique({
          where: { id: targetCashRegisterId }
        });

        if (!cashRegister || cashRegister.status !== 'open') {
          throw new BadRequestException('O caixa selecionado está fechado ou é inválido. Abra o caixa primeiro.');
        }
      }

      const tenantSettings = await tx.tenantSettings.findUnique({ where: { id: 'singleton' } });
      const allowNegativeStock = tenantSettings?.allowNegativeStock ?? false;

      // ─── 1. Validar estoque e montar snapshot fiscal de cada item ───────────

      // ─── Suporte a Comanda: se comandaId presente, travar e buscar itens do banco ────
      let comandaToClose: any = null;
      if (data.comandaId) {
        // Bloqueio atômico contra concorrência: tenta transitar de open/waiting_payment para 'closed'
        // Em MySQL, updateMany obtém lock exclusivo de linha. Se outro terminal já fechou ou está fechando, count será 0.
        const lockResult = await tx.comanda.updateMany({
          where: {
            id: data.comandaId,
            status: { in: ['open', 'waiting_payment'] },
          },
          data: {
            status: 'closed',
          },
        });

        if (lockResult.count === 0) {
          const current = await tx.comanda.findUnique({
            where: { id: data.comandaId },
            select: { status: true },
          });
          if (!current) {
            throw new BadRequestException(`Comanda ${data.comandaId} não encontrada.`);
          }
          throw new BadRequestException(
            `Esta comanda já foi finalizada (status: "${current.status}") ou está sendo processada por outro terminal.`,
          );
        }

        comandaToClose = await tx.comanda.findUnique({
          where: { id: data.comandaId },
          include: {
            items: {
              where: { status: 'active' },
              include: {
                modifiers: { include: { componentProduct: true } },
                product: {
                  include: {
                    grupoTributacao: true,
                    category: { include: { grupoTributacao: true } },
                    modifierGroups: { include: { options: true } },
                  },
                },
              },
            },
          },
        });


        assertComandaSnapshot(data.expectedComandaItems, comandaToClose.items);
        // Detectar compostos legados sem modifiers — exigir resolução manual
        for (const ci of comandaToClose.items) {
          if (!ci.stockDeducted && ci.product.isComposite && ci.product.modifierGroups?.length > 0) {
            throw new BadRequestException(
              `O item composto "${ci.product.name}" foi lançado antes do suporte a compostos em comandas. ` +
              `Remova-o da comanda e relance selecionando os ingredientes para continuar.`,
            );
          }
        }
      }

      // Quando há comanda: apenas extraItems passam pelo fluxo normal de estoque
      // Quando não há comanda: todos os data.items passam pelo fluxo normal
      const itemsForProcessing: any[] = data.comandaId
        ? [...(data.extraItems || [])]
        : [...(data.items || []), ...(data.extraItems || [])];

      const productIds = itemsForProcessing.map((item: any) => item.productId);

      const modifierComponentIds = itemsForProcessing
         .filter((i: any) => i.modifiers && i.modifiers.length > 0)
         .flatMap((i: any) => i.modifiers.map((m: any) => m.componentProductId));

      // Incluir também os produtos da comanda no productMap para resolução fiscal e FIFO
      const comandaProductIds = data.comandaId
        ? (comandaToClose?.items || []).flatMap((ci: any) => [
            ci.productId,
            ...ci.modifiers.map((m: any) => m.componentProductId),
          ])
        : [];

      const allProductIds = Array.from(new Set([...productIds, ...modifierComponentIds, ...comandaProductIds]));
      allProductIdsToSync = allProductIds;

      await lockProducts(tx, allProductIds);

      const productsInDb = await tx.product.findMany({
        where: { id: { in: allProductIds } },
        include: { 
          grupoTributacao: true,
          category: {
            include: {
              grupoTributacao: true
            }
          },
          modifierGroups: {
            include: {
              options: true
            }
          }
        },
      });

      const existingMap = new Map(productsInDb.map((p: any) => [p.id, p]));
      const missingProductIds = allProductIds.filter(id => !existingMap.has(id));

      if (missingProductIds.length > 0) {
        const petServices = await tx.petService.findMany({
          where: { id: { in: missingProductIds } },
        });

        if (petServices.length > 0) {
          let servicosCategory = await tx.category.findFirst({
            where: { name: 'Serviços' },
          });
          if (!servicosCategory) {
            servicosCategory = await tx.category.create({
              data: { name: 'Serviços', color: '#0d9488' },
            });
          }

          for (const svc of petServices) {
            const createdProduct = await tx.product.upsert({
              where: { id: svc.id },
              update: {
                name: svc.name,
                priceSell: new Prisma.Decimal(svc.price),
                active: svc.active !== false,
                categoryId: servicosCategory.id,
              },
              create: {
                id: svc.id,
                name: svc.name,
                priceSell: new Prisma.Decimal(svc.price),
                priceCost: new Prisma.Decimal(0),
                stock: new Prisma.Decimal(99999),
                unit: 'SV',
                active: svc.active !== false,
                categoryId: servicosCategory.id,
                emiteNfce: false,
              },
              include: {
                grupoTributacao: true,
                category: { include: { grupoTributacao: true } },
                modifierGroups: { include: { options: true } },
              },
            });
            productsInDb.push(createdProduct);
          }
        }
      }

      const productMap = new Map(productsInDb.map((p: any) => [p.id, p]));

      const inventoryLogsToCreate: any[] = [];

      // Calcular subtotal: itens da comanda (preço do banco) + itensForProcessing (balcão)
      if (data.comandaId && comandaToClose) {
        // Subtotal dos itens da comanda vem do snapshot do banco
        for (const ci of comandaToClose.items) {
          subtotal = subtotal.add(new Prisma.Decimal(ci.totalPrice));
        }
      }
      // Subtotal dos itens normais/extras
      for (const item of itemsForProcessing) {
        const qty = Number(item.quantity);
        const priceUnit = new Prisma.Decimal(item.priceUnit);
        const itemSubtotal = priceUnit.mul(new Prisma.Decimal(qty)).toDecimalPlaces(2);
        subtotal = subtotal.add(itemSubtotal);
      }


      const discount = new Prisma.Decimal(data.discount || 0);
      let total = subtotal.sub(discount);

      // Calcular total pago para detectar acréscimo (ex: iFood com valor maior que o carrinho)
      let paymentsTotal = new Prisma.Decimal(0);
      const paymentsData = data.payments.map((pay: any) => {
        paymentsTotal = paymentsTotal.add(new Prisma.Decimal(pay.value));
        return {
          tPag:   TPAG_MAP[pay.method] ?? '99',
          method: pay.method,
          label:  pay.label ?? null, // label customizado (ex: "iFood")
          value:  Number(pay.value),
          troco:  Number(pay.troco || 0),
        };
      });

      let addition = new Prisma.Decimal(0);
      if (paymentsTotal.gt(total)) {
        addition = paymentsTotal.sub(total);
        total = paymentsTotal;
      }
      
      const finalTotalStr = total.toDecimalPlaces(2);


      // ─── 3. Checar formas de pagamento e produtos SNF ──────────────────────
      const isSnfProduct = (p: any) => {
        const grupoNome = (p?.grupoTributacao?.nome || p?.category?.grupoTributacao?.nome || '').toLowerCase();
        return grupoNome.includes('snf') || grupoNome.includes('sem nota');
      };

      const allItemsAreSnf = data.items.length > 0 && data.items.every((item: any) => {
        const p = productMap.get(item.productId);
        return p && isSnfProduct(p);
      });

      // Carregar configurações de formas de pagamento para aplicar a Regra de Prevalência Fiscal
      const defaultFixedMethodsConfig: Record<string, { emitirNfce: boolean }> = {
        dinheiro: { emitirNfce: false },
        pix: { emitirNfce: false },
        credito: { emitirNfce: false },
        debito: { emitirNfce: false },
        consumo_funcionario: { emitirNfce: false },
      };
      const fixedConfig = {
        ...defaultFixedMethodsConfig,
        ...((tenantSettings?.paymentMethodsConfig as Record<string, any>) || {}),
      };

      const customPaymentMethods = await tx.tenantPaymentMethod.findMany();
      const customMethodMap = new Map(customPaymentMethods.map(m => [m.id, m]));

      const isMethodFiscal = (methodKey: string) => {
        const normKey = (methodKey || '').toLowerCase();
        if (normKey in fixedConfig) {
          return fixedConfig[normKey]?.emitirNfce === true;
        }
        const custom = customMethodMap.get(methodKey) as any;
        if (custom) {
          return custom.emitirNfce === true;
        }
        return false;
      };

      const hasAnyFiscalPayment = (data.payments || []).some((p: any) => isMethodFiscal(p.method));

      let nfceNumero: number | null = null;
      let emitirNfce = Boolean(data.emitirNfce);
      let initialNfceStatus: string | null = null;
      let initialNfceMotivo: string | null = null;

      if (emitirNfce) {
        if (allItemsAreSnf) {
          // Venda 100% SNF: NÃO consome número de série e NÃO transmite para SEFAZ
          emitirNfce = false;
          initialNfceStatus = 'nao_emitida';
          initialNfceMotivo = 'Venda contém apenas produtos sem nota (SNF).';
        } else if (!hasAnyFiscalPayment) {
          // Venda 100% em formas não-fiscais (ex: 100% Dinheiro desmarcado)
          emitirNfce = false;
          initialNfceStatus = 'nao_emitida';
          initialNfceMotivo = 'Forma de pagamento não fiscal (sem emissão).';
        } else {
          const serie = data.nfceSerie ?? 1;
          const numeracao = await tx.numeracaoNfce.upsert({
            where: { serie },
            update: { ultimo: { increment: 1 } },
            create: { serie, ultimo: 1 },
          });
          nfceNumero = numeracao.ultimo;
          initialNfceStatus = 'pendente';
        }
      }

      // ─── 4. Criar a venda ────────────────────────────────────────────────────
      if (operatorId) {
        const opExists = await tx.operator.findUnique({ where: { id: operatorId } });
        if (!opExists) {
          this.logger.warn(`Operador ${operatorId} não encontrado no banco — venda será criada sem operador.`);
          operatorId = null;
        }
      }

      // Obter próximo código sequencial amigável de venda
      const lastSale = await tx.sale.findFirst({
        orderBy: { code: 'desc' },
        select: { code: true }
      });
      const nextSaleCode = (lastSale?.code ?? 0) + 1;

      const sale = await tx.sale.create({
        data: {
          id:             canonicalId,
          requestFingerprint: incomingFingerprint,
          code:           nextSaleCode,
          customerId:     data.customerId || null,
          operatorId,
          cashRegisterId: targetCashRegisterId || null,
          source:         saleSource,
          subtotal,
          discount,
          addition, // <-- Salvando o acréscimo
          total: finalTotalStr,
          status:         'completed',
          emitirNfce,
          nfceStatus:     initialNfceStatus,
          nfceMotivoRejeicao: initialNfceMotivo,
          nfceNumero,
          nfceSerie:      emitirNfce ? (data.nfceSerie ?? 1) : null,
          consumidorCpf:  data.customerCpf  || null,
          consumidorNome: data.customerName || null,
          ...(data.offlineContingency && data.offlineCreatedAt ? { createdAt: new Date(data.offlineCreatedAt) } : {}),
          payments: { create: paymentsData },
        }
      });

      // ─── Processar itens da COMANDA (stockDeducted=true: sem baixa, apenas FIFO para custeio) ──
      if (data.comandaId && comandaToClose) {
        for (const ci of comandaToClose.items) {
          const product = ci.product;
          const qty = Number(ci.quantity);
          const itemModifiersDataToCreate: any[] = [];
          const itemLotConsumptions: any[] = [];
          let totalCostOfLots = new Prisma.Decimal(0);

          await tx.product.update({
            where: { id: product.id },
            data: { salesCount: { increment: qty } },
          });

          const isServiceCi =
            product.unit === 'SV' ||
            product.category?.name?.toLowerCase().includes('serviç') ||
            Number(product.stock ?? 0) >= 90000;

          if (product.isComposite && ci.modifiers && ci.modifiers.length > 0) {
            // Composto com snapshot — consumir FIFO dos ingredientes para custeio
            for (const mod of ci.modifiers) {
              const componentProduct = productMap.get(mod.componentProductId) as any || mod.componentProduct;
              if (!componentProduct) continue;

              // Custeio FIFO — NÃO altera product.stock (já foi feito no addItems)
              const ingredientConsumptions = await this.consumeLotsFIFO(
                tx, componentProduct.id, Number(mod.consumedQuantity), componentProduct.priceCost,
              );
              for (const cons of ingredientConsumptions) {
                itemLotConsumptions.push({ lotId: cons.lotId, quantity: cons.quantity, costPrice: cons.costPrice });
                totalCostOfLots = totalCostOfLots.add(cons.quantity.mul(cons.costPrice));
              }

              itemModifiersDataToCreate.push({
                componentProductId: componentProduct.id,
                name: mod.name,
                quantity: new Prisma.Decimal(mod.consumedQuantity),
                priceAdjustment: new Prisma.Decimal(mod.priceAdjustment),
              });
            }
          } else if (isServiceCi) {
            // Serviços não movimentam estoque físico nem consomem FIFO
          } else {
            // Sem adicionais no lançamento: estoque do próprio produto (mesmo se hoje estiver marcado composto).
            if (ci.stockDeducted && shouldMoveStock) {
              const lotConsumptions = await this.consumeLotsFIFO(tx, product.id, qty, product.priceCost);
              for (const cons of lotConsumptions) {
                itemLotConsumptions.push({ lotId: cons.lotId, quantity: cons.quantity, costPrice: cons.costPrice });
                totalCostOfLots = totalCostOfLots.add(cons.quantity.mul(cons.costPrice));
              }
            } else if (!ci.stockDeducted && shouldMoveStock) {
              // Simples legado (stockDeducted=false): baixa normal + FIFO
              if (!allowNegativeStock) {
                const result = await tx.product.updateMany({
                  where: { id: product.id, stock: { gte: new Prisma.Decimal(qty) } },
                  data: { stock: { decrement: new Prisma.Decimal(qty) } },
                });
                if (result.count === 0) {
                  throw new BadRequestException(`Estoque insuficiente para "${product.name}" na comanda.`);
                }
              } else {
                await tx.product.update({
                  where: { id: product.id },
                  data: { stock: { decrement: new Prisma.Decimal(qty) } },
                });
              }
              inventoryLogsToCreate.push({
                productId: product.id,
                type: 'SALE',
                quantity: qty,
                reason: `Venda PDV (Comanda #${comandaToClose.number})`,
              });
              const lotConsumptions = await this.consumeLotsFIFO(tx, product.id, qty, product.priceCost);
              for (const cons of lotConsumptions) {
                itemLotConsumptions.push({ lotId: cons.lotId, quantity: cons.quantity, costPrice: cons.costPrice });
                totalCostOfLots = totalCostOfLots.add(cons.quantity.mul(cons.costPrice));
              }
            }
          }

          const gt = product.grupoTributacao || product.category?.grupoTributacao;
          const priceCostFinal = qty > 0 ? totalCostOfLots.div(new Prisma.Decimal(qty)) : new Prisma.Decimal(0);

          const saleItem = await tx.saleItem.create({
            data: {
              saleId:      sale.id,
              productId:   product.id,
              productName: product.name,
              unit:        product.unit || 'UN',
              quantity:    qty,
              priceUnit:   new Prisma.Decimal(ci.unitPrice),
              discount:    0,
              subtotal:    new Prisma.Decimal(ci.totalPrice),
              ncm:         product.ncm   ?? null,
              cest:        product.cest  ?? null,
              cfop:        gt?.cfop      ?? '5102',
              origem:      product.origem ?? 0,
              csosn:       gt?.csosn     ?? null,
              cstIcms:     gt?.cstIcms   ?? null,
              aliqIcms:    Number(gt?.aliqIcms ?? 0),
              valorIcms:   0,
              cstPis:      gt?.cstPis    ?? '99',
              aliqPis:     Number(gt?.aliqPis ?? 0),
              valorPis:    0,
              cstCofins:   gt?.cstCofins ?? '99',
              aliqCofins:  Number(gt?.aliqCofins ?? 0),
              valorCofins: 0,
              priceCost:   priceCostFinal,
              ...(itemModifiersDataToCreate.length > 0 ? {
                modifiers: { create: itemModifiersDataToCreate },
              } : {}),
              ...(itemLotConsumptions.length > 0 ? {
                lotConsumptions: {
                  create: itemLotConsumptions.map(lc => ({ lotId: lc.lotId, quantity: lc.quantity })),
                },
              } : {}),
            },
          });
          void saleItem; // usado acima com create — referência evita lint
        }

        // Fechar comanda atomicamente na mesma transação
        await tx.comanda.update({
          where: { id: data.comandaId },
          data: { status: 'closed', saleId: sale.id },
        });

        if (comandaToClose.notes) {
          try {
            let apptId: string | null = null;
            if (comandaToClose.notes.startsWith('PET2:')) {
              const parsed = JSON.parse(comandaToClose.notes.slice(5));
              apptId = parsed.a || null;
            } else if (comandaToClose.notes.startsWith('PETSHOP_LINK_V1:')) {
              const parsed = JSON.parse(comandaToClose.notes.slice(16));
              apptId = parsed.appointment?.id || null;
            }
            if (apptId) {
              await tx.petAppointment.updateMany({
                where: { id: apptId },
                data: { status: 'delivered', completedAt: new Date() },
              });
            }
          } catch (e) {
            // Ignora erro de parse em notas legadas
          }
        }
      }

      for (const item of itemsForProcessing) {
        const product = productMap.get(item.productId) as any;
        if (!product) {
          throw new BadRequestException(`Produto ${item.productId} não encontrado no banco de dados.`);
        }

        const qty = Number(item.quantity);

        const itemModifiersDataToCreate: any[] = [];
        const itemLotConsumptions: any[] = [];
        let totalCostOfLots = new Prisma.Decimal(0);

        if (product.isComposite && product.modifierGroups?.length > 0) {
          if (!item.modifiers?.length) {
            throw new BadRequestException(
              `O produto composto "${product.name}" requer adicionais. Remova-o do carrinho e adicione-o novamente.`,
            );
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { salesCount: { increment: qty } },
          });

          const chosenModifiers = item.modifiers || [];
          for (const chosenMod of chosenModifiers) {
            let foundOption: any = null;
            for (const group of product.modifierGroups || []) {
              foundOption = (group.options || []).find(
                (opt: any) => opt.id === chosenMod.optionId || opt.componentProductId === chosenMod.componentProductId
              );
              if (foundOption) break;
            }

            if (!foundOption) {
              throw new BadRequestException(`Opção de adicional inválida para o produto composto: ${product.name}`);
            }

            const componentProduct = productMap.get(foundOption.componentProductId) as any;
            if (!componentProduct) {
              throw new BadRequestException(`Produto ingrediente ${foundOption.name} não encontrado.`);
            }

            const optionQty = Number(foundOption.quantity);
            const capacity = Number(componentProduct.volumeCapacity) || 1;
            const fractionToDecrement = qty * (optionQty / capacity);

            // ─── Movimentação de estoque (desabilitada em Ajuste Fiscal sem estoque) ───
            if (shouldMoveStock) {
              if (!allowNegativeStock) {
                const updateResult = await tx.product.updateMany({
                  where: {
                    id: componentProduct.id,
                    stock: { gte: new Prisma.Decimal(fractionToDecrement) }
                  },
                  data: {
                    stock: { decrement: new Prisma.Decimal(fractionToDecrement) }
                  }
                });
                if (updateResult.count === 0) {
                  throw new BadRequestException(`Estoque insuficiente para o ingrediente: ${componentProduct.name} (disponível: ${componentProduct.stock}, necessário: ${fractionToDecrement.toFixed(3)})`);
                }
              } else {
                await tx.product.update({
                  where: { id: componentProduct.id },
                  data: {
                    stock: { decrement: new Prisma.Decimal(fractionToDecrement) }
                  }
                });
              }

              inventoryLogsToCreate.push({
                productId: componentProduct.id,
                type: 'OUT',
                quantity: fractionToDecrement,
                reason: isAjusteFiscal ? `Ajuste Fiscal (Combo: ${product.name})` : `Venda PDV (Combo: ${product.name})`,
              });
            }

            itemModifiersDataToCreate.push({
              componentProductId: componentProduct.id,
              name: foundOption.name,
              quantity: new Prisma.Decimal(optionQty),
              priceAdjustment: new Prisma.Decimal(foundOption.priceAdjustment),
            });

            if (shouldMoveStock) {
              const ingredientConsumptions = await this.consumeLotsFIFO(tx, componentProduct.id, fractionToDecrement, componentProduct.priceCost);
              for (const cons of ingredientConsumptions) {
                itemLotConsumptions.push({
                  lotId: cons.lotId,
                  quantity: cons.quantity,
                  costPrice: cons.costPrice
                });
                totalCostOfLots = totalCostOfLots.add(cons.quantity.mul(cons.costPrice));
              }
            }
          }
        } else {
          if (item.modifiers?.length) {
            throw new BadRequestException(
              `Os adicionais de "${product.name}" mudaram. Remova o item do carrinho e adicione-o novamente.`,
            );
          }
          const isServiceItem =
            product.unit === 'SV' ||
            product.category?.name?.toLowerCase().includes('serviç') ||
            Number(product.stock ?? 0) >= 90000;

          // ─── Movimentação de estoque (desabilitada em Ajuste Fiscal sem estoque e para Serviços) ───
          if (shouldMoveStock && !isServiceItem) {
            if (!allowNegativeStock) {
              const updateResult = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  stock: { gte: new Prisma.Decimal(qty) }
                },
                data: {
                  stock: { decrement: new Prisma.Decimal(qty) },
                  salesCount: { increment: qty }
                }
              });
              if (updateResult.count === 0) {
                throw new BadRequestException(`Estoque insuficiente para o produto: ${product.name} (disponível: ${product.stock}, tentado: ${qty})`);
              }
            } else {
              await tx.product.update({
                where: { id: item.productId },
                data: { 
                  stock: { decrement: new Prisma.Decimal(qty) },
                  salesCount: { increment: qty }
                },
              });
            }

            inventoryLogsToCreate.push({
              productId: product.id,
              type: 'SALE',
              quantity: qty,
              reason: isAjusteFiscal ? 'Ajuste Fiscal' : 'Venda PDV',
            });

            const productConsumptions = await this.consumeLotsFIFO(tx, product.id, qty, product.priceCost);
            for (const cons of productConsumptions) {
              itemLotConsumptions.push({
                lotId: cons.lotId,
                quantity: cons.quantity,
                costPrice: cons.costPrice
              });
              totalCostOfLots = totalCostOfLots.add(cons.quantity.mul(cons.costPrice));
            }
          } else {
            // Sem movimentação de estoque (ou Serviço) — apenas incrementa contador de vendas
            await tx.product.update({
              where: { id: item.productId },
              data: { salesCount: { increment: qty } },
            });
          }
        }

        const priceUnit = new Prisma.Decimal(item.priceUnit);
        const itemSubtotal = priceUnit.mul(new Prisma.Decimal(qty)).toDecimalPlaces(2);
        const gt = product.grupoTributacao || product.category?.grupoTributacao;
        const priceCost = qty > 0 ? totalCostOfLots.div(new Prisma.Decimal(qty)) : new Prisma.Decimal(0);

        await tx.saleItem.create({
          data: {
            saleId:      sale.id,
            productId:   product.id,
            productName: item.fiscalSnapshot?.productName ?? product.name,
            unit:        item.fiscalSnapshot?.unit ?? (product.unit || 'UN'),
            quantity:    qty,
            priceUnit,
            discount:    item.fiscalSnapshot?.discount ?? 0,
            subtotal:    item.fiscalSnapshot?.subtotal ?? itemSubtotal,
            ncm:         item.fiscalSnapshot?.ncm ?? product.ncm   ?? null,
            cest:        item.fiscalSnapshot?.cest ?? product.cest  ?? null,
            cfop:        item.fiscalSnapshot?.cfop ?? gt?.cfop      ?? '5102',
            origem:      item.fiscalSnapshot?.origem ?? product.origem ?? 0,
            csosn:       item.fiscalSnapshot?.csosn ?? gt?.csosn     ?? null,
            cstIcms:     item.fiscalSnapshot?.cstIcms ?? gt?.cstIcms   ?? null,
            aliqIcms:    item.fiscalSnapshot?.aliqIcms ?? Number(gt?.aliqIcms ?? 0),
            valorIcms:   0,
            cstPis:      item.fiscalSnapshot?.cstPis ?? gt?.cstPis    ?? '99',
            aliqPis:     item.fiscalSnapshot?.aliqPis ?? Number(gt?.aliqPis ?? 0),
            valorPis:    0,
            cstCofins:   item.fiscalSnapshot?.cstCofins ?? gt?.cstCofins ?? '99',
            aliqCofins:  item.fiscalSnapshot?.aliqCofins ?? Number(gt?.aliqCofins ?? 0),
            valorCofins: 0,
            priceCost,
            modifiers: {
              create: itemModifiersDataToCreate
            },
            lotConsumptions: {
              create: itemLotConsumptions.map(lc => ({
                lotId: lc.lotId,
                quantity: lc.quantity
              }))
            }
          }
        });
      }

      if (inventoryLogsToCreate.length > 0) {
        await tx.inventoryLog.createMany({ data: inventoryLogsToCreate });
      }

      if (data.consumedByOperatorId) {
        await tx.operatorConsumption.create({
          data: {
            operatorId: data.consumedByOperatorId,
            saleId: sale.id,
            settled: false,
          }
        });
      }

      const fullSale = await tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: {
            include: {
              modifiers: true,
              lotConsumptions: true
            }
          },
          payments: true,
          customer: true
        }
      });

      // These intents cannot disappear between the sale commit and a process restart.
      if (data.comandaId) await releaseComandaAssets(tx, data.comandaId);

      if (data.petshopAppointmentId) {
        try {
          await tx.petAppointment.updateMany({
            where: { id: String(data.petshopAppointmentId) },
            data: { status: 'delivered', completedAt: new Date() },
          });
        } catch (appErr) {
          // Silencioso se agendamento não for encontrado
        }
      }

      const jobs = [
        ...(fullSale.emitirNfce ? [{ kind: 'NFCE', payload: '{}' }] : []),
        ...(allProductIdsToSync.length ? [{ kind: 'STOCK', payload: JSON.stringify({ productIds: allProductIdsToSync }) }] : []),
      ];
      for (const job of jobs) {
        await tx.saleDeliveryJob.create({ data: { saleId: fullSale.id, ...job } });
      }
      return fullSale;
    }, {
      timeout: 25000,
      isolationLevel: 'ReadCommitted',
    }));
  } catch (err: any) {
    // Rollback has finished. A matching committed winner is the only success condition.
    if (isSaleIdentityConflict(err) || err?.code === 'P2034' || err instanceof BadRequestException) {
      const winner = await prisma.sale.findUnique({ where: { id: canonicalId }, include: includeSale });
      if (winner) return validateReplay(winner);
    }
    throw err;
  }

  // The durable worker, not an in-memory timer, delivers fiscal/integration jobs.
  try {
    this.productsService.invalidateCache(tenantId);
  } catch (err) {
    this.logger.error(`Erro ao invalidar cache de produtos do tenant ${tenantId}: ${err.message}`);
  }

  // Disparo assíncrono direto da NFC-e quando solicitado pelo operador na venda
  if (sale?.emitirNfce) {
    setTimeout(() => this.dispararNfce(tenantId, databaseUrl, sale), 300);
  }

  return sale;
}

  /**
   * Dispara a emissão NFC-e de forma assíncrona após a venda ser salva ou via CRON.
   * Atualiza o registro da venda com o resultado.
   */
  public async dispararNfce(tenantId: string, databaseUrl: string, sale: any) {
    try {
      const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);

      // Buscar dados dos produtos para checar se são do grupo SNF
      const productIds = sale.items.map((i: any) => i.productId).filter(Boolean);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          barcode: true,
          shortCode: true,
          grupoTributacao: {
            select: { nome: true }
          }
        }
      });
      const barcodeMap = new Map<string, string | null>(products.map((p: any) => [p.id, p.barcode]));
      const shortCodeMap = new Map<string, string | null>(products.map((p: any) => [p.id, p.shortCode]));
      const snfProductIds = new Set<string>(
        products
          .filter((p: any) => {
            const name = p.grupoTributacao?.nome?.toLowerCase() || '';
            return name.includes('snf') || name.includes('sem nota');
          })
          .map((p: any) => p.id)
      );

      // Filtrar itens da venda removendo os que são SNF
      const filteredItems = sale.items.filter((i: any) => !snfProductIds.has(i.productId));

      // Se todos os itens forem SNF, a venda não emite nota fiscal
      if (filteredItems.length === 0) {
        this.logger.log(`Venda ${sale.id} contém apenas produtos SNF (Sem Nota). Emissão cancelada de forma limpa.`);
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, {
          nfceStatus: 'nao_emitida',
          nfceMotivoRejeicao: 'Venda contém apenas produtos sem nota (SNF).',
        });
        return;
      }

      // Buscar dados do tenant (emitente) e certificado
      const tenant = await this.heartPrisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant || !tenant.nfceAtivo) {
        this.logger.warn(`NFC-e não habilitada para tenant ${tenantId}`);
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, { nfceStatus: 'nao_emitida' });
        return;
      }

      const certPfxBase64 = tenant.certPfx
        ? Buffer.from(tenant.certPfx).toString('base64')
        : null;

      if (!certPfxBase64 || !tenant.certSenha) {
        this.logger.error(`Certificado A1 não configurado para tenant ${tenantId}`);
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, {
          nfceStatus: 'rejeitada',
          nfceMotivoRejeicao: 'Certificado digital não configurado.',
        });
        return;
      }

      // Recalcular os totais tributados da nota
      const totalNfce = filteredItems.reduce((acc: number, i: any) => acc + Number(i.subtotal), 0);
      let discountNfce = 0;
      if (Number(sale.discount) > 0 && Number(sale.total) > 0) {
        const ratio = totalNfce / Number(sale.total);
        discountNfce = Number((Number(sale.discount) * ratio).toFixed(2));
      }
      const finalTotalNfce = Number((totalNfce - discountNfce).toFixed(2));

      const resultado = await this.nfceService.emitir({
        ambiente: tenant.nfceAmbiente ?? 2,
        certPfxBase64,
        certSenha: tenant.certSenha,
        empresa: {
          cnpj:        tenant.cnpj,
          ie:          tenant.ie,
          razaoSocial: tenant.razaoSocial,
          nomeFantasia: tenant.nomeFantasia,
          crt:         tenant.crt,
          csc:         tenant.nfceCsc,
          idCsc:       tenant.nfceIdCsc,
          serie:       tenant.nfceSerie,
          ambiente:    tenant.nfceAmbiente,
          endereco: {
            logradouro:   tenant.logradouro,
            numero:       tenant.numero,
            complemento:  tenant.complemento,
            bairro:       tenant.bairro,
            municipio:    tenant.municipio,
            codMunicipio: tenant.codMunicipio,
            uf:           tenant.uf,
            cep:          tenant.cep,
            telefone:     tenant.telefone,
          },
        },
        nota: {
          numero:     sale.nfceNumero,
          serie:      sale.nfceSerie,
          total:      finalTotalNfce,
          desconto:   discountNfce,
          consumidor: {
            cpf:  sale.consumidorCpf,
            nome: sale.consumidorNome,
          },
          itens: filteredItems.map((i: any) => {
            const shortCode = shortCodeMap.get(i.productId);
            return {
              produtoId:  shortCode || i.productId, // Usa o código interno curto (atalho) ou UUID como fallback
              xProd:      i.productName,
              barcode:    barcodeMap.get(i.productId) || null,
              ncm:        i.ncm,
              cest:       i.cest,
              cfop:       i.cfop,
              unit:       i.unit,
              quantidade: Number(i.quantity),
              valorUnit:  Number(i.priceUnit),
              subtotal:   Number(i.subtotal),
              origem:     i.origem,
              csosn:      i.csosn,
              cstIcms:    i.cstIcms,
              aliqIcms:   Number(i.aliqIcms),
              cstPis:     i.cstPis,
              aliqPis:    Number(i.aliqPis),
              cstCofins:  i.cstCofins,
              aliqCofins: Number(i.aliqCofins),
            };
          }),
          pagamentos: (() => {
            const pagamentos: any[] = [];
            let remainingPayment = finalTotalNfce;
            for (let idx = 0; idx < sale.payments.length; idx++) {
              const p = sale.payments[idx];
              const isLast = idx === sale.payments.length - 1;
              const val = isLast ? remainingPayment : Math.min(Number(p.value), remainingPayment);
              remainingPayment = Number((remainingPayment - val).toFixed(2));
              if (val > 0) {
                pagamentos.push({
                  tPag: p.tPag,
                  valor: Number(val.toFixed(2)),
                  troco: isLast ? Number(p.troco) : 0,
                });
              }
            }
            return pagamentos;
          })(),
        },
      });

      // Persistir resultado
      if (resultado.status === 'autorizada') {
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, {
          nfceStatus:      'autorizada',
          nfceChave:       resultado.chave,
          nfceProtocolo:   resultado.protocolo,
          nfceXml:         resultado.xml,
          nfceQrcode:      resultado.qrcode,
          nfceAutorizadaEm: new Date(),
        });
      } else {
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, {
          nfceStatus:          'rejeitada',
          nfceCodRejeicao:     resultado.codRejeicao,
          nfceMotivoRejeicao:  resultado.motivoRejeicao,
        });
      }
    } catch (err: any) {
      this.logger.error(`Erro ao disparar NFC-e para venda ${sale.id}: ${err.message}`);
      try {
        await this.atualizarStatusNfce(tenantId, databaseUrl, sale.id, {
          nfceStatus: 'rejeitada',
          nfceMotivoRejeicao: err.message,
        });
      } catch (dbErr: any) {
        this.logger.error(`Erro fatal ao atualizar status de NFC-e (Venda ${sale.id}): ${dbErr.message}`);
      }
    }
  }

  private async atualizarStatusNfce(tenantId: string, databaseUrl: string, saleId: string, data: any) {
    const prisma = await this.tenantManager.getTenantClient(tenantId, databaseUrl);
    await prisma.sale.update({ where: { id: saleId }, data });
  }

  async findAll(page = 1, limit = 50, startDate?: string, endDate?: string) {
    const prisma = await this.getPrisma();
    const skip = (page - 1) * limit;

    const where: any = { NOT: { source: 'ajuste_fiscal' } };

    // Filtro de data (usa fuso horário de Brasília -03:00)
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(`${startDate}T00:00:00-03:00`),
        lte: new Date(`${endDate}T23:59:59-03:00`),
      };
    }

    const [total, data] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: {
          payments: true,
          items: { include: { product: true } },
          customer: true,
          operator: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getTodaySales(page = 1, limit = 50) {
    const prisma = await this.getPrisma();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.sale.count({ where: { createdAt: { gte: today }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] } }),
      prisma.sale.findMany({
        where: { createdAt: { gte: today }, NOT: [{ status: 'cancelled' }, { source: 'ajuste_fiscal' }] },
        include: {
          payments: true,
          items: { include: { product: true } },
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit)
      }
    };
  }

  /** Retorna apenas os campos de status NFC-e — usado pelo polling do frontend */
  async getNfceStatus(saleId: string) {
    const prisma = await this.getPrisma();
    return prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        nfceStatus: true,
        nfceNumero: true,
        nfceSerie: true,
        nfceChave: true,
        nfceProtocolo: true,
        nfceQrcode: true,
        nfceAutorizadaEm: true,
        nfceCodRejeicao: true,
        nfceMotivoRejeicao: true,
      },
    });
  }

  /** Emissão manual / Reemissão de NFC-e para vendas já salvas */
  async emitNfce(saleId: string, forceNewNumber = false, manualNumber?: number) {
    const prisma = await this.getPrisma();
    
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true, customer: true }
    });

    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.nfceStatus === 'autorizada') throw new BadRequestException('NFC-e já autorizada para esta venda');

    // 1. Atualizar informações fiscais dos itens da venda com os dados mais recentes dos produtos
    for (const item of sale.items) {
      if (item.productId) {
        const currentProduct = await prisma.product.findUnique({
          where: { id: item.productId },
          include: { 
            grupoTributacao: true,
            category: {
              include: {
                grupoTributacao: true
              }
            }
          }
        });
        if (currentProduct) {
          const gt = currentProduct.grupoTributacao || currentProduct.category?.grupoTributacao;
          const updatedFields = {
            productName: currentProduct.name,
            unit: currentProduct.unit || 'UN',
            ncm: currentProduct.ncm ?? null,
            cest: currentProduct.cest ?? null,
            cfop: gt?.cfop ?? '5102',
            origem: currentProduct.origem ?? 0,
            csosn: gt?.csosn ?? null,
            cstIcms: gt?.cstIcms ?? null,
            aliqIcms: Number(gt?.aliqIcms ?? 0),
            cstPis: gt?.cstPis ?? '99',
            aliqPis: Number(gt?.aliqPis ?? 0),
            cstCofins: gt?.cstCofins ?? '99',
            aliqCofins: Number(gt?.aliqCofins ?? 0),
          };

          await prisma.saleItem.update({
            where: { id: item.id },
            data: updatedFields
          });

          // Atualizar objeto em memória para a emissão em background
          Object.assign(item, {
            ...updatedFields,
            aliqIcms: new Prisma.Decimal(updatedFields.aliqIcms),
            aliqPis: new Prisma.Decimal(updatedFields.aliqPis),
            aliqCofins: new Prisma.Decimal(updatedFields.aliqCofins),
          });
        }
      }
    }

    const { tenantId, databaseUrl } = this.tenantContext.get();
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId },
    });
    const configuredSerie = tenant?.nfceSerie || 1;

    let nfceNumero = sale.nfceNumero;
    let nfceSerie = sale.nfceSerie;

    // Se não tinha número, ou se forçamos um novo número
    if (manualNumber) {
       nfceNumero = manualNumber;
       nfceSerie = configuredSerie;
       
       const currentNum = await prisma.numeracaoNfce.findUnique({ where: { serie: configuredSerie } });
       if (!currentNum || currentNum.ultimo < manualNumber) {
         await prisma.numeracaoNfce.upsert({
           where: { serie: configuredSerie },
           update: { ultimo: manualNumber },
           create: { serie: configuredSerie, ultimo: manualNumber },
         });
       }
    } else if (!nfceNumero || forceNewNumber) {
       nfceSerie = configuredSerie;
       const numeracao = await prisma.numeracaoNfce.upsert({
          where: { serie: configuredSerie },
          update: { ultimo: { increment: 1 } },
          create: { serie: configuredSerie, ultimo: 1 },
       });
       nfceNumero = numeracao.ultimo;
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: { emitirNfce: true, nfceStatus: 'pendente', nfceNumero, nfceSerie }
    });

    sale.emitirNfce = true;
    sale.nfceNumero = nfceNumero;
    sale.nfceSerie = nfceSerie;

    setImmediate(() => this.dispararNfce(tenantId, databaseUrl, sale));

    return { message: 'Emissão de NFC-e solicitada com sucesso', status: 'pendente' };
  }

  /** Exportar XMLs das vendas do mês no formato ZIP */
  async exportNfceXmls(startDate: string, endDate: string) {
    const prisma = await this.getPrisma();

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        nfceStatus: 'autorizada',
        nfceXml: { not: null },
      },
      select: { nfceChave: true, nfceXml: true },
    });

    if (sales.length === 0) {
      throw new NotFoundException('Nenhum XML encontrado neste período.');
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    sales.forEach((sale: any) => {
      archive.append(sale.nfceXml, { name: `${sale.nfceChave}-nfe.xml` });
    });

    archive.finalize();

    return new StreamableFile(archive);
  }

  private generateZipBuffer(sales: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const buffers: Buffer[] = [];

      archive.on('data', (data) => buffers.push(data));
      archive.on('end', () => resolve(Buffer.concat(buffers)));
      archive.on('error', (err) => reject(err));

      sales.forEach((sale: any) => {
        archive.append(sale.nfceXml, { name: `${sale.nfceChave}-nfe.xml` });
      });

      archive.finalize();
    });
  }

  /** Exportar XMLs das vendas do mês no formato ZIP e enviar por e-mail */
  async exportNfceXmlsAndSendEmail(startDate: string, endDate: string, targetEmail?: string) {
    const { tenantId } = this.tenantContext.get();
    
    // Obter dados do emitente (Tenant)
    const tenant = await this.heartPrisma.tenant.findUnique({
      where: { id: tenantId }
    });
    
    if (!tenant) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    
    const emailToUse = targetEmail || tenant.emailContador;
    
    if (!emailToUse) {
      throw new BadRequestException('E-mail do contador não configurado para esta empresa. Por favor, configure nas configurações ou informe um e-mail.');
    }

    const prisma = await this.getPrisma();

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        nfceStatus: 'autorizada',
        nfceXml: { not: null },
      },
      select: { nfceChave: true, nfceXml: true },
    });

    if (sales.length === 0) {
      throw new NotFoundException('Nenhum XML encontrado neste período.');
    }

    const zipBuffer = await this.generateZipBuffer(sales);
    
    const razaoSocial = tenant.razaoSocial || tenant.name || 'Empresa';
    const cnpj = tenant.cnpj ? tenant.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : 'Não informado';
    
    const subject = `XMLs de NFC-e — ${razaoSocial} — Período ${startDate} a ${endDate}`;
    
    const text = `Prezado(a) Contador(a),\n\nSegue em anexo o arquivo ZIP contendo os XMLs das notas fiscais emitidas no período de ${startDate} a ${endDate}.\n\nDados do emitente:\nRazão Social: ${razaoSocial}\nCNPJ: ${cnpj}\n\nEste é um e-mail automático gerado pelo sistema PDV 7bar.`;
    
    const html = `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #6366f1;">Exportação de XMLs de NFC-e</h2>
        <p>Prezado(a) Contador(a),</p>
        <p>Segue em anexo o arquivo comprimido (ZIP) contendo os arquivos XML das Notas Fiscais do Consumidor Eletrônicas (NFC-e) referentes ao período de <strong>${startDate}</strong> a <strong>${endDate}</strong>.</p>
        
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #4b5563;">Dados da Empresa Emitente</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; font-weight: bold; width: 120px;">Razão Social:</td>
              <td style="padding: 4px 0;">${razaoSocial}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-weight: bold;">CNPJ:</td>
              <td style="padding: 4px 0;">${cnpj}</td>
            </tr>
            ${tenant.telefone ? `<tr><td style="padding: 4px 0; font-weight: bold;">Contato:</td><td style="padding: 4px 0;">${tenant.telefone}</td></tr>` : ''}
          </table>
        </div>
        
        <p style="font-size: 0.9em; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 10px;">
          Este é um e-mail automático gerado pelo sistema PDV 7bar. Por favor, não responda a esta mensagem.
        </p>
      </div>
    `;

    await this.mailService.sendMail(
      emailToUse,
      subject,
      text,
      html,
      [
        {
          filename: `xmls_${startDate}_a_${endDate}.zip`,
          content: zipBuffer,
        }
      ]
    );

    return { message: 'XMLs exportados e enviados com sucesso para a contabilidade.' };
  }

  async cancel(saleId: string, reason: string) {
    const { tenantId } = this.tenantContext.get();
    const prisma = await this.getPrisma();

    const sale = await prisma.$transaction(async (tx: any) => {
      const existingSale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              lotConsumptions: {
                include: {
                  lot: true
                }
              }
            }
          }
        }
      });

      if (!existingSale) {
        throw new NotFoundException('Venda não encontrada.');
      }

      if (existingSale.status === 'cancelled') {
        throw new BadRequestException('Esta venda já está cancelada.');
      }

      // Estornar cada item consumido de volta aos lotes e produtos
      for (const item of existingSale.items) {
        // Reduzir contagem de vendas do produto pai
        // Nota: item.quantity vem como Prisma.Decimal; salesCount é Integer,
        // por isso o cast explícito com Number() é necessário.
        await tx.product.update({
          where: { id: item.productId },
          data: { salesCount: { decrement: Number(item.quantity) } }
        });

        for (const consumption of item.lotConsumptions) {
          // 1. Estornar quantidade restante do lote
          await tx.stockLot.update({
            where: { id: consumption.lotId },
            data: { remaining: { increment: consumption.quantity } }
          });

          // 2. Incrementar estoque consolidado do produto pertencente ao lote
          await tx.product.update({
            where: { id: consumption.lot.productId },
            data: { stock: { increment: consumption.quantity } }
          });

          // 3. Registrar log de inventário para auditoria
          await tx.inventoryLog.create({
            data: {
              productId: consumption.lot.productId,
              type: 'IN',
              quantity: Number(consumption.quantity),
              costPrice: Number(consumption.lot.costPrice),
              reason: `Estorno Venda Cancelada (Venda: ${existingSale.id})`
            }
          });
        }
      }

      // Marcar venda como cancelada
      const updatedSale = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'cancelled',
          cancelReason: reason,
          cancelledAt: new Date(),
          nfceStatus: 'cancelada'
        },
        include: {
          items: true,
          payments: true
        }
      });

      return updatedSale;
    });

    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      this.logger.error(`Erro ao invalidar cache de produtos do tenant ${tenantId}: ${err.message}`);
    }

    return sale;
  }
  async updatePayments(saleId: string, payments: { method: string; value: number; tPag?: string }[]) {
    const prisma = await this.getPrisma();

    return await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { payments: true }
      });

      if (!sale) {
        throw new NotFoundException('Venda não encontrada.');
      }

      if (sale.status === 'cancelled') {
        throw new BadRequestException('Não é possível editar pagamentos de uma venda cancelada.');
      }

      if (sale.cashRegisterId) {
        const reg = await tx.cashRegister.findUnique({
          where: { id: sale.cashRegisterId },
          select: { id: true, status: true, closingValue: true }
        });

        if (!reg) {
          throw new NotFoundException('Caixa vinculado à venda não encontrado.');
        }

        if (reg.status === 'closed' && reg.closingValue != null) {
          throw new BadRequestException('Pagamentos de caixas já auditados não podem ser alterados.');
        }
      }

      const totalNewPayments = payments.reduce((acc, p) => acc + Number(p.value), 0);
      const saleTotal = Number(sale.total);

      // Tolerate tiny float differences
      if (Math.abs(totalNewPayments - saleTotal) > 0.01) {
        throw new BadRequestException(`A soma dos pagamentos (R$ ${totalNewPayments.toFixed(2)}) não bate com o total da venda (R$ ${saleTotal.toFixed(2)}).`);
      }

      // Apaga pagamentos antigos
      await tx.payment.deleteMany({
        where: { saleId: sale.id }
      });

      // Cria os novos
      const newPaymentRecords = payments.map(p => {
        let tPag = p.tPag || TPAG_MAP[p.method];
        if (!tPag) {
          tPag = p.method.length > 20 ? '99' : '99'; // fallback
        }
        
        return {
          saleId: sale.id,
          method: p.method,
          tPag,
          value: p.value,
          troco: 0 // Troco é ignorado na reedição, pois o valor do pagamento deve ser exato ao total. Se havia troco, a venda original considerou.
        };
      });

      await tx.payment.createMany({
        data: newPaymentRecords
      });

      return await tx.sale.findUnique({
        where: { id: saleId },
        include: { payments: true, items: true }
      });
    });
  }

  // ── Helper para filtrar itens SNF e recalcular totais fiscais reais ──────────
  private async computeFiscalDetailsForSales(prisma: any, sales: any[]) {
    const productIds = new Set<string>();
    for (const sale of sales) {
      if (sale.items) {
        for (const item of sale.items) {
          if (item.productId) productIds.add(item.productId);
        }
      }
    }

    let snfProductIds = new Set<string>();
    if (productIds.size > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: Array.from(productIds) } },
        select: {
          id: true,
          grupoTributacao: { select: { nome: true } },
        },
      });
      snfProductIds = new Set(
        products
          .filter((p: any) => {
            const name = p.grupoTributacao?.nome?.toLowerCase() || '';
            return name.includes('snf') || name.includes('sem nota');
          })
          .map((p: any) => p.id)
      );
    }

    return sales.map(s => {
      if (!s.items || s.items.length === 0) {
        return {
          ...s,
          fiscalTotal: Number(s.total),
          fiscalItems: [],
        };
      }

      const eligibleItems = s.items.filter((i: any) => !snfProductIds.has(i.productId));

      if (eligibleItems.length === s.items.length) {
        return {
          ...s,
          fiscalTotal: Number(s.total),
          fiscalItems: s.items,
        };
      }

      if (eligibleItems.length === 0) {
        return {
          ...s,
          fiscalTotal: 0,
          fiscalItems: [],
        };
      }

      const eligibleSubtotal = eligibleItems.reduce((acc: number, i: any) => acc + Number(i.subtotal), 0);
      const saleSubtotal = Number(s.subtotal) || Number(s.total);
      let fiscalDiscount = 0;
      if (Number(s.discount) > 0 && saleSubtotal > 0) {
        const ratio = eligibleSubtotal / saleSubtotal;
        fiscalDiscount = Number((Number(s.discount) * ratio).toFixed(2));
      }
      const fiscalTotal = Number((eligibleSubtotal - fiscalDiscount).toFixed(2));

      return {
        ...s,
        fiscalTotal,
        fiscalItems: eligibleItems,
      };
    });
  }

  // ── Resumo e Estatísticas Fiscais (NFC-e) ──────────────────────────────────
  async getFiscalSummary(startDate?: string, endDate?: string) {
    const prisma = await this.getPrisma();

    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) dateFilter.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const itemSelect = { select: { productId: true, subtotal: true } };

    const [allPdvSalesRaw, autorizadasRaw, canceladasRaw, rejeitadasRaw, naoEmitidasRaw] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...dateFilter,
          status: { not: 'cancelled' },
          NOT: { source: 'ajuste_fiscal' },
        },
        select: { id: true, total: true, subtotal: true, discount: true, emitirNfce: true, nfceStatus: true, source: true, items: itemSelect },
      }),
      prisma.sale.findMany({
        where: { ...dateFilter, nfceStatus: 'autorizada' },
        select: { id: true, total: true, subtotal: true, discount: true, nfceNumero: true, nfceSerie: true, source: true, items: itemSelect, payments: { select: { method: true, value: true } } },
      }),
      prisma.sale.findMany({
        where: { ...dateFilter, nfceStatus: 'cancelada' },
        select: { id: true, total: true, subtotal: true, discount: true, source: true, items: itemSelect },
      }),
      prisma.sale.findMany({
        where: { ...dateFilter, nfceStatus: 'rejeitada' },
        select: { id: true, total: true, subtotal: true, discount: true, source: true, items: itemSelect },
      }),
      prisma.sale.findMany({
        where: { ...dateFilter, OR: [{ nfceStatus: null }, { nfceStatus: 'nao_emitida' }, { nfceStatus: 'pendente' }] },
        select: { id: true, total: true, subtotal: true, discount: true, items: itemSelect },
      }),
    ]);

    const [allPdvSales, autorizadas, canceladas, rejeitadas] = await Promise.all([
      this.computeFiscalDetailsForSales(prisma, allPdvSalesRaw),
      this.computeFiscalDetailsForSales(prisma, autorizadasRaw),
      this.computeFiscalDetailsForSales(prisma, canceladasRaw),
      this.computeFiscalDetailsForSales(prisma, rejeitadasRaw),
    ]);

    const totalVendasPdv = allPdvSales.reduce((acc, s) => acc + Number(s.total), 0);
    const totalAutorizadoPdv = autorizadas.filter(s => s.source === 'pdv' || !s.source).reduce((acc, s) => acc + Number(s.fiscalTotal), 0);
    const totalAjusteFiscal = autorizadas.filter(s => s.source === 'ajuste_fiscal').reduce((acc, s) => acc + Number(s.fiscalTotal), 0);
    const totalAutorizadoNfce = totalAutorizadoPdv + totalAjusteFiscal;
    const totalCanceladoNfce = canceladas.reduce((acc, s) => acc + Number(s.fiscalTotal), 0);
    const totalRejeitadoNfce = rejeitadas.reduce((acc, s) => acc + Number(s.fiscalTotal), 0);

    // NÃO DECLARADO / SNF = Soma das vendas não emitidas e das parcelas de produtos SNF do balcão PDV
    const totalNaoDeclarado = allPdvSales.reduce((acc, s) => {
      const saleTotal = Number(s.total) || 0;
      const fiscalTotal = Number(s.fiscalTotal) || 0;
      return acc + Math.max(0, saleTotal - fiscalTotal);
    }, 0);

    const coberturaPercent = totalVendasPdv > 0
      ? Number(((totalAutorizadoNfce / totalVendasPdv) * 100).toFixed(1))
      : 100;

    const numeros = autorizadas.map(s => s.nfceNumero).filter((n): n is number => typeof n === 'number');
    const menorNota = numeros.length > 0 ? Math.min(...numeros) : null;
    const maiorNota = numeros.length > 0 ? Math.max(...numeros) : null;

    // Agrupamento por Meios de Pagamento das Notas Autorizadas (considerando apenas a parcela tributável da nota)
    const fiscalRatioMap = new Map<string, number>(
      autorizadas.map((s: any) => {
        const total = Number(s.total) || Number(s.subtotal) || 0;
        const fiscalTotal = Number(s.fiscalTotal) || 0;
        const ratio = total > 0 ? (fiscalTotal / total) : 1;
        return [s.id, ratio];
      })
    );

    const recebimentos = {
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0,
      outros: 0,
    };

    for (const sale of autorizadasRaw) {
      if (sale.payments) {
        const ratio = fiscalRatioMap.get(sale.id) ?? 1;
        for (const p of sale.payments) {
          const val = Number((Number(p.value) * ratio).toFixed(2));
          const method = (p.method || '').toLowerCase();
          if (method === 'dinheiro' || method === 'money' || method === 'cash') {
            recebimentos.dinheiro += val;
          } else if (method === 'pix') {
            recebimentos.pix += val;
          } else if (method === 'debito' || method.includes('debit')) {
            recebimentos.debito += val;
          } else if (method === 'credito' || method.includes('credit')) {
            recebimentos.credito += val;
          } else {
            recebimentos.outros += val;
          }
        }
      }
    }

    return {
      periodo: { startDate: startDate || null, endDate: endDate || null },
      totais: {
        totalVendasPdv: Number(totalVendasPdv.toFixed(2)),
        totalAutorizadoPdv: Number(totalAutorizadoPdv.toFixed(2)),
        totalAjusteFiscal: Number(totalAjusteFiscal.toFixed(2)),
        totalAutorizadoNfce: Number(totalAutorizadoNfce.toFixed(2)),
        totalNaoDeclarado: Number(totalNaoDeclarado.toFixed(2)),
        totalCanceladoNfce: Number(totalCanceladoNfce.toFixed(2)),
        totalRejeitadoNfce: Number(totalRejeitadoNfce.toFixed(2)),
        coberturaPercent: Math.min(100, coberturaPercent),
      },
      contagem: {
        autorizadas: autorizadas.length,
        canceladas: canceladas.length,
        rejeitadas: rejeitadas.length,
        naoEmitidas: naoEmitidasRaw.length,
        totalGeral: allPdvSales.length,
      },
      faixaNotas: {
        menorNota,
        maiorNota,
      },
      recebimentos: {
        dinheiro: Number(recebimentos.dinheiro.toFixed(2)),
        pix: Number(recebimentos.pix.toFixed(2)),
        debito: Number(recebimentos.debito.toFixed(2)),
        credito: Number(recebimentos.credito.toFixed(2)),
        outros: Number(recebimentos.outros.toFixed(2)),
      },
    };
  }

  // ── Histórico e Listagem Paginada Fiscal ────────────────────────────────────
  async getFiscalSales(query: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    source?: string;
    search?: string;
  }) {
    const prisma = await this.getPrisma();
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status && query.status !== 'all') {
      where.nfceStatus = query.status;
    } else {
      where.OR = [
        { emitirNfce: true },
        { nfceStatus: { not: null } },
      ];
    }

    if (query.source && query.source !== 'all') {
      where.source = query.source;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      const termAsInt = parseInt(term);

      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { nfceChave: { contains: term } },
            { consumidorCpf: { contains: term } },
            { consumidorNome: { contains: term } },
            ...(isNaN(termAsInt) ? [] : [{ nfceNumero: termAsInt }]),
          ]
        }
      ];
    }

    const [total, rawSales] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: {
          operator: { select: { name: true } },
          payments: { select: { method: true, value: true } },
          items: { select: { productId: true, productName: true, quantity: true, priceUnit: true, subtotal: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const sales = await this.computeFiscalDetailsForSales(prisma, rawSales);

    return {
      data: sales.map(s => ({
        id: s.id,
        nfceNumero: s.nfceNumero,
        nfceSerie: s.nfceSerie,
        nfceChave: s.nfceChave,
        nfceProtocolo: s.nfceProtocolo,
        nfceStatus: s.nfceStatus || 'nao_emitida',
        nfceMotivoRejeicao: s.nfceMotivoRejeicao,
        total: Number(s.fiscalTotal),
        fullSaleTotal: Number(s.total),
        discount: Number(s.discount),
        source: s.source,
        consumidorCpf: s.consumidorCpf,
        consumidorNome: s.consumidorNome,
        createdAt: s.createdAt,
        operatorName: s.operator?.name || 'Sistema',
        payments: (s.payments || []).map((p: any) => ({
          method: p.method,
          value: Number(p.value),
        })),
        itemsCount: s.fiscalItems.length,
        itemsSummary: s.fiscalItems.slice(0, 3).map((i: any) => `${Number(i.quantity)}x ${i.productName}`).join(', ') + (s.fiscalItems.length > 3 ? '...' : ''),
        itemsDetail: s.fiscalItems.map((i: any) => ({
          name: i.productName,
          quantity: Number(i.quantity),
          priceUnit: Number(i.priceUnit),
          subtotal: Number(i.subtotal),
        })),
      })),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
