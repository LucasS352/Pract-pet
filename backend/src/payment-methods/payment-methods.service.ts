import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { TenantContextService } from '../prisma/tenant-context.service';

export const DEFAULT_PAYMENT_METHODS_CONFIG = {
  dinheiro: { emitirNfce: false },
  pix: { emitirNfce: false },
  credito: { emitirNfce: false },
  debito: { emitirNfce: false },
  consumo_funcionario: { emitirNfce: false },
};

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly tenantManager: TenantConnectionManager,
    private readonly tenantContext: TenantContextService,
  ) {}

  private async getPrisma() {
    const { tenantId, databaseUrl } = this.tenantContext.get();
    return this.tenantManager.getTenantClient(tenantId, databaseUrl);
  }

  async getSettings() {
    const prisma = await this.getPrisma();
    const settings = await prisma.tenantSettings.findUnique({ where: { id: 'singleton' } });
    const savedConfig = (settings?.paymentMethodsConfig as Record<string, any>) || {};
    return {
      ...DEFAULT_PAYMENT_METHODS_CONFIG,
      ...savedConfig,
    };
  }

  async updateSettings(config: Record<string, { emitirNfce: boolean }>) {
    const prisma = await this.getPrisma();
    const current = await this.getSettings();
    const merged = { ...current, ...config };
    await prisma.tenantSettings.upsert({
      where: { id: 'singleton' },
      update: { paymentMethodsConfig: merged },
      create: { id: 'singleton', paymentMethodsConfig: merged },
    });
    return merged;
  }

  async findAll() {
    const prisma = await this.getPrisma();
    return prisma.tenantPaymentMethod.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(data: { name: string; tPag?: string; hasVariablePricing?: boolean; emitirNfce?: boolean }) {
    const prisma = await this.getPrisma();
    return prisma.tenantPaymentMethod.create({
      data: {
        name: data.name,
        tPag: data.tPag ?? '99',
        active: true,
        emitirNfce: data.emitirNfce ?? false,
        hasVariablePricing: data.hasVariablePricing ?? false,
      },
    });
  }

  async update(id: string, data: { name?: string; tPag?: string; active?: boolean; hasVariablePricing?: boolean; emitirNfce?: boolean }) {
    const prisma = await this.getPrisma();
    const existing = await prisma.tenantPaymentMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Forma de pagamento não encontrada.');
    return prisma.tenantPaymentMethod.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const prisma = await this.getPrisma();
    const existing = await prisma.tenantPaymentMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Forma de pagamento não encontrada.');
    return prisma.tenantPaymentMethod.delete({ where: { id } });
  }

  async getPrices(methodId: string) {
    const prisma = await this.getPrisma();
    return prisma.productPaymentMethodPrice.findMany({
      where: { paymentMethodId: methodId },
      select: { productId: true, price: true }
    });
  }

  async upsertPrices(methodId: string, prices: { productId: string; price: number }[]) {
    const prisma = await this.getPrisma();
    await prisma.$transaction(async (tx) => {
      for (const p of prices) {
        await tx.productPaymentMethodPrice.upsert({
          where: {
            productId_paymentMethodId: {
              productId: p.productId,
              paymentMethodId: methodId
            }
          },
          update: { price: p.price },
          create: {
            productId: p.productId,
            paymentMethodId: methodId,
            price: p.price
          }
        });
      }
    });
    return { success: true };
  }
}
