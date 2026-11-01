import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ProductsService } from '../products/products.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService
  ) {}

  private async getPrisma(tenantId: string) {
    const { databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async findAll(tenantId: string) {
    const prisma = await this.getPrisma(tenantId);
    const operators = await prisma.operator.findMany({
      select: {
        id: true,
        name: true,
        jobTitle: true,
        active: true,
        isManager: true,
        createdAt: true,
        updatedAt: true,
        cashRegisters: {
          where: { status: 'open' },
          select: { id: true },
          take: 1
        }
      },
      orderBy: { name: 'asc' },
    });

    return operators.map(op => {
      const { cashRegisters, ...rest } = op;
      return {
        ...rest,
        hasOpenRegister: cashRegisters.length > 0
      };
    });
  }

  async findOne(tenantId: string, id: string) {
    const prisma = await this.getPrisma(tenantId);
    const operator = await prisma.operator.findUnique({
      where: { id },
    });
    if (!operator) throw new NotFoundException('Operador não encontrado');
    return operator;
  }

  async create(tenantId: string, data: { name: string; pin: string; isManager?: boolean; jobTitle?: string }) {
    if (!data.pin || data.pin.length < 4 || data.pin.length > 6) {
      throw new BadRequestException('O PIN deve ter entre 4 e 6 dígitos.');
    }
    const prisma = await this.getPrisma(tenantId);
    const hashedPin = await bcrypt.hash(data.pin, 10);
    
    const op = await prisma.operator.create({
      data: {
        name: data.name,
        pin: hashedPin,
        jobTitle: data.jobTitle || null,
        active: true,
        isManager: data.isManager || false,
      },
    });
    
    // remove pin from return
    const { pin, ...result } = op;
    return result;
  }

  async update(tenantId: string, id: string, data: { name?: string; pin?: string; active?: boolean; isManager?: boolean; jobTitle?: string }) {
    const prisma = await this.getPrisma(tenantId);
    
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.isManager !== undefined) updateData.isManager = data.isManager;
    if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle || null;
    
    if (data.pin) {
      if (data.pin.length < 4 || data.pin.length > 6) {
        throw new BadRequestException('O PIN deve ter entre 4 e 6 dígitos.');
      }
      updateData.pin = await bcrypt.hash(data.pin, 10);
    }

    try {
      const op = await prisma.operator.update({
        where: { id },
        data: updateData,
      });
      const { pin, ...result } = op;
      return result;
    } catch (e) {
      throw new NotFoundException('Operador não encontrado');
    }
  }

  async remove(tenantId: string, id: string) {
    const prisma = await this.getPrisma(tenantId);
    try {
      await prisma.operator.delete({
        where: { id },
      });
      return { success: true };
    } catch (e) {
      throw new NotFoundException('Operador não encontrado');
    }
  }

  async getConsumptions(tenantId: string) {
    const prisma = await this.getPrisma(tenantId);
    
    const operators = await prisma.operator.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        consumptions: {
          where: { settled: false },
          select: {
            sale: {
              select: {
                items: {
                  select: {
                    subtotal: true,
                    settled: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return operators.map(op => {
      const pendingBalance = op.consumptions.reduce((sum, c) => {
        const unsettledItemsSum = c.sale.items
          .filter(item => !item.settled)
          .reduce((itemSum, item) => itemSum + Number(item.subtotal), 0);
        return sum + unsettledItemsSum;
      }, 0);
      return {
        id: op.id,
        name: op.name,
        pendingBalance,
      };
    });
  }

  async getOperatorConsumptionHistory(tenantId: string, operatorId: string) {
    const prisma = await this.getPrisma(tenantId);
    
    const consumptions = await prisma.operatorConsumption.findMany({
      where: { operatorId },
      include: {
        sale: {
          include: {
            items: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return consumptions.map(c => ({
      id: c.id,
      saleId: c.sale.id,
      total: Number(c.sale.total),
      settled: c.settled,
      settledAt: c.settledAt,
      createdAt: c.createdAt,
      items: c.sale.items.map(item => ({
        id: item.id,
        name: item.productName,
        quantity: Number(item.quantity),
        priceUnit: Number(item.priceUnit),
        subtotal: Number(item.subtotal),
        settled: item.settled,
        settledAt: item.settledAt
      }))
    }));
  }

  async settleConsumptions(tenantId: string, operatorId: string, itemIds?: string[], amount?: number) {
    const prisma = await this.getPrisma(tenantId);
    
    // CASO 1: Abatimento por valor em R$ (ex: abater R$ 10,00 de uma dívida de R$ 14,00)
    if (amount !== undefined && amount !== null && amount > 0) {
      let remainingToAbate = amount;

      const pendingConsumptions = await prisma.operatorConsumption.findMany({
        where: { operatorId, settled: false },
        include: {
          sale: {
            include: {
              items: {
                where: { settled: false },
                orderBy: { id: 'asc' }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      for (const consumption of pendingConsumptions) {
        if (remainingToAbate <= 0) break;

        for (const item of consumption.sale.items) {
          if (remainingToAbate <= 0) break;

          const itemSubtotal = Number(item.subtotal);

          if (remainingToAbate >= itemSubtotal) {
            // Abatimento cobre o item por inteiro -> dar baixa total no item
            await prisma.saleItem.update({
              where: { id: item.id },
              data: { settled: true, settledAt: new Date() }
            });
            remainingToAbate -= itemSubtotal;
          } else {
            // Abatimento é MENOR que o valor do item -> baixa parcial no item!
            const remainingItemSubtotal = Math.round((itemSubtotal - remainingToAbate) * 100) / 100;
            const settledSubtotal = Math.round(remainingToAbate * 100) / 100;

            // 1. Atualizar o item original para conter apenas o valor RESTANTE PENDENTE (ex: R$ 4,00)
            await prisma.saleItem.update({
              where: { id: item.id },
              data: {
                subtotal: remainingItemSubtotal,
                settled: false
              }
            });

            // 2. Criar o item parcelado representando a quantia QUITADA (ex: R$ 10,00)
            await prisma.saleItem.create({
              data: {
                saleId: item.saleId,
                productId: item.productId,
                productName: `${item.productName} (Abatimento Parcial)`,
                unit: item.unit,
                quantity: item.quantity,
                priceUnit: item.priceUnit,
                discount: item.discount,
                subtotal: settledSubtotal,
                settled: true,
                settledAt: new Date()
              }
            });

            remainingToAbate = 0;
          }
        }
      }

      // Atualizar status dos consumos cujos itens foram 100% quitados
      const checkConsumptions = await prisma.operatorConsumption.findMany({
        where: { operatorId, settled: false },
        include: { sale: { include: { items: true } } }
      });

      for (const c of checkConsumptions) {
        if (c.sale.items.every(i => i.settled)) {
          await prisma.operatorConsumption.update({
            where: { id: c.id },
            data: { settled: true, settledAt: new Date() }
          });
        }
      }

      return { success: true };
    }

    // CASO 2: Baixa por itens selecionados
    if (itemIds && itemIds.length > 0) {
      await prisma.saleItem.updateMany({
        where: {
          id: { in: itemIds },
          sale: {
            operatorConsumption: {
              operatorId: operatorId
            }
          }
        },
        data: {
          settled: true,
          settledAt: new Date()
        }
      });

      const unsettledConsumptions = await prisma.operatorConsumption.findMany({
        where: {
          operatorId,
          settled: false
        },
        include: {
          sale: {
            include: {
              items: true
            }
          }
        }
      });

      for (const consumption of unsettledConsumptions) {
        const allSettled = consumption.sale.items.every(item => item.settled);
        if (allSettled) {
          await prisma.operatorConsumption.update({
            where: { id: consumption.id },
            data: {
              settled: true,
              settledAt: new Date()
            }
          });
        }
      }
    } else {
      // CASO 3: Quitar tudo (Baixa total)
      await prisma.saleItem.updateMany({
        where: {
          settled: false,
          sale: {
            operatorConsumption: {
              operatorId: operatorId,
              settled: false
            }
          }
        },
        data: {
          settled: true,
          settledAt: new Date()
        }
      });

      await prisma.operatorConsumption.updateMany({
        where: { operatorId, settled: false },
        data: {
          settled: true,
          settledAt: new Date()
        }
      });
    }

    return { success: true };
  }

  async createManualConsumption(tenantId: string, data: { operatorId: string; productId: string; quantity: number }) {
    const prisma = await this.getPrisma(tenantId);
    
    const consumption = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: data.productId },
        include: { grupoTributacao: true }
      });
      if (!product) throw new NotFoundException('Produto não encontrado');
      
      const qty = Number(data.quantity);
      const priceSell = Number(product.priceSell);
      const subtotal = priceSell * qty;
      
      // Stock update
      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: { decrement: qty },
          salesCount: { increment: qty }
        }
      });
      
      // Create Sale
      const sale = await tx.sale.create({
        data: {
          subtotal: subtotal,
          discount: 0,
          total: subtotal,
          status: 'completed',
          items: {
            create: [
              {
                productId: product.id,
                productName: product.name,
                unit: product.unit,
                quantity: qty,
                priceUnit: product.priceSell,
                subtotal: subtotal,
                ncm: product.ncm,
                cest: product.cest,
                origem: product.origem,
                csosn: product.grupoTributacao?.csosn,
                cstIcms: product.grupoTributacao?.cstIcms,
                aliqIcms: product.grupoTributacao?.aliqIcms ?? 0,
                cstPis: product.grupoTributacao?.cstPis ?? '99',
                aliqPis: product.grupoTributacao?.aliqPis ?? 0,
                cstCofins: product.grupoTributacao?.cstCofins ?? '99',
                aliqCofins: product.grupoTributacao?.aliqCofins ?? 0,
              }
            ]
          },
          payments: {
            create: [
              {
                tPag: '99',
                method: 'consumo_funcionario',
                value: subtotal,
                troco: 0
              }
            ]
          }
        }
      });
      
      // Create OperatorConsumption
      const consumptionRecord = await tx.operatorConsumption.create({
        data: {
          operatorId: data.operatorId,
          saleId: sale.id,
          settled: false,
        },
        include: {
          sale: {
            include: {
              items: true
            }
          }
        }
      });
      
      return consumptionRecord;
    });

    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      // ignore
    }

    return consumption;
  }

  async deleteConsumption(tenantId: string, id: string) {
    const prisma = await this.getPrisma(tenantId);
    
    const consumption = await prisma.operatorConsumption.findUnique({
      where: { id },
      include: {
        sale: {
          include: {
            items: true
          }
        }
      }
    });

    if (!consumption) throw new NotFoundException('Registro de consumo não encontrado');

    const result = await prisma.$transaction(async (tx) => {
      for (const item of consumption.sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            salesCount: { decrement: Math.round(Number(item.quantity)) }
          }
        });
      }

      await tx.sale.delete({
        where: { id: consumption.saleId }
      });

      return { success: true };
    });

    try {
      this.productsService.invalidateCache(tenantId);
    } catch (err) {
      // ignore
    }

    return result;
  }
}
