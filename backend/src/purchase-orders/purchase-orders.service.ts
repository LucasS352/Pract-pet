import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { Prisma } from '@prisma/client';
import { ProductsService } from '../products/products.service';
import { IntegrationsService } from '../integrations/integrations.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService,
    private readonly integrationsService: IntegrationsService
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async createPurchaseOrder(supplierId: string, items: { productId: string; quantity: number; expectedCost: number; unitMultiplier?: number; unitName?: string }[]) {
    const prisma = await this.getPrisma();
    
    const totalEstimated = items.reduce((acc, item) => acc + (item.quantity * (item.unitMultiplier || 1) * item.expectedCost), 0);

    return prisma.purchaseOrder.create({
      data: {
        supplierId,
        status: 'DRAFT',
        totalEstimated,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            expectedCost: item.expectedCost,
            unitMultiplier: item.unitMultiplier || 1,
            unitName: item.unitName || 'UN',
          })),
        },
      },
      include: {
        items: true,
      },
    });
  }

  async getPurchaseOrders() {
    const prisma = await this.getPrisma();
    return prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async getPurchaseOrderById(id: string) {
    const prisma = await this.getPrisma();
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
    return order;
  }

  async updateStatus(id: string, status: string) {
    const prisma = await this.getPrisma();
    return prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });
  }

  async receivePurchaseOrder(id: string, receivedItems: { id: string; realCost: number }[]) {
    const prisma = await this.getPrisma();

    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
    if (order.status === 'COMPLETED') throw new BadRequestException('Este pedido já foi recebido.');

    const result = await prisma.$transaction(async (tx) => {
      let totalReal = new Prisma.Decimal(0);
      const updatedProductIds: string[] = [];

      for (const reqItem of receivedItems) {
        const orderItem = order.items.find((i) => i.id === reqItem.id);
        if (!orderItem) continue;
        
        updatedProductIds.push(orderItem.productId);

        const quantity = new Prisma.Decimal(orderItem.quantity);
        const realCost = new Prisma.Decimal(reqItem.realCost); // UNIT COST
        const unitMultiplier = new Prisma.Decimal(orderItem.unitMultiplier || 1);
        
        const addedUnits = quantity.mul(unitMultiplier);
        const unitCost = realCost; // DO NOT DIVIDE

        // Atualizar o item do pedido com o custo real
        await tx.purchaseOrderItem.update({
          where: { id: orderItem.id },
          data: { realCost },
        });

        const itemTotal = addedUnits.mul(realCost);
        totalReal = totalReal.add(itemTotal);

        // Encontrar o produto no estoque para pegar o estoque atual
        const product = await tx.product.findUnique({
          where: { id: orderItem.productId }
        });

        if (product) {
          // Atualizar o estoque e o custo do produto
          await tx.product.update({
            where: { id: orderItem.productId },
            data: {
              stock: { increment: addedUnits },
              priceCost: unitCost,
            },
          });

          // Gerar log de inventário
          await tx.inventoryLog.create({
            data: {
              productId: orderItem.productId,
              type: 'IN',
              quantity: addedUnits,
              costPrice: unitCost,
              reason: `Entrada via Pedido de Compra #${order.id}`,
            },
          });

          // Gerar lote de estoque
          await tx.stockLot.create({
            data: {
              productId: orderItem.productId,
              costPrice: unitCost,
              quantity: addedUnits,
              remaining: addedUnits,
            },
          });
        }
      }

      // Invalidate the cache because the stock was updated
      this.productsService.invalidateCache(this.tenantContext.get().tenantId);

      // Atualizar o pedido para COMPLETED e setar o total real
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          receivedAt: new Date(),
          totalReal,
        },
      });

      return { updatedOrder, updatedProductIds };
    });

    if (result.updatedProductIds.length > 0) {
      this.integrationsService.syncProductStock(this.tenantContext.get().tenantId, [...new Set(result.updatedProductIds)]).catch(e => console.error(e));
    }

    return result.updatedOrder;
  }

  async deletePurchaseOrder(id: string) {
    const prisma = await this.getPrisma();
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido de compra não encontrado.');
    if (order.status === 'COMPLETED') throw new BadRequestException('Não é possível excluir um pedido já recebido.');

    return prisma.purchaseOrder.delete({
      where: { id },
    });
  }

  async updateItemQuantity(orderId: string, itemId: string, quantity: number) {
    const prisma = await this.getPrisma();
    
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.status === 'COMPLETED') throw new BadRequestException('Não é possível alterar itens de um pedido já recebido.');

      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Item não encontrado.');

      const oldQuantity = Number(item.quantity);
      const newQuantity = quantity;

      await tx.purchaseOrderItem.update({
        where: { id: itemId },
        data: { quantity: newQuantity },
      });

      // Recalcular o totalEstimado do pedido
      const difference = (newQuantity - oldQuantity) * Number(item.unitMultiplier || 1) * Number(item.expectedCost);
      const newTotalEstimated = Number(order.totalEstimated) + difference;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { totalEstimated: newTotalEstimated },
      });

      return { success: true };
    });
  }

  async deleteOrderItem(orderId: string, itemId: string) {
    const prisma = await this.getPrisma();
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.status === 'COMPLETED') throw new BadRequestException('Não é possível alterar itens de um pedido já recebido.');

      const item = order.items.find((i) => i.id === itemId);
      if (!item) throw new NotFoundException('Item não encontrado.');

      await tx.purchaseOrderItem.delete({
        where: { id: itemId },
      });

      // Recalcular o totalEstimado do pedido removendo o valor desse item
      const difference = -(Number(item.quantity) * Number(item.unitMultiplier || 1) * Number(item.expectedCost));
      const newTotalEstimated = Number(order.totalEstimated) + difference;

      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { totalEstimated: newTotalEstimated },
      });

      return { success: true };
    });
  }

  async createPackaging(name: string, multiplier: number) {
    const prisma = await this.getPrisma();
    return prisma.packaging.create({
      data: { name, multiplier }
    });
  }

  async getPackagings() {
    const prisma = await this.getPrisma();
    return prisma.packaging.findMany({
      orderBy: { createdAt: 'asc' }
    });
  }

  async deletePackaging(id: string) {
    const prisma = await this.getPrisma();
    return prisma.packaging.delete({
      where: { id }
    });
  }

  async createOrdersFromLowStock(items: { productId: string; supplierId: string; quantity: number; expectedCost: number }[]) {
    const prisma = await this.getPrisma();

    // Group items by supplierId
    const bySupplier = new Map<string, typeof items>();
    for (const item of items) {
      const list = bySupplier.get(item.supplierId) || [];
      list.push(item);
      bySupplier.set(item.supplierId, list);
    }

    const createdOrders: any[] = [];

    for (const [supplierId, supplierItems] of bySupplier.entries()) {
      const totalEstimated = supplierItems.reduce((acc, item) => acc + item.quantity * item.expectedCost, 0);

      const order = await prisma.purchaseOrder.create({
        data: {
          supplierId,
          status: 'DRAFT',
          totalEstimated,
          items: {
            create: supplierItems.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              expectedCost: new Prisma.Decimal(item.expectedCost),
              unitMultiplier: 1,
              unitName: 'UN',
            })),
          },
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      });

      createdOrders.push(order);
    }

    return createdOrders;
  }
}
