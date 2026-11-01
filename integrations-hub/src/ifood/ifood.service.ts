import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const IFOOD_PRODUCT_ID_SENTINEL = 'IFOOD_EXTERNAL_ITEM';

// Mapeamento de métodos de pagamento do iFood para o padrão do 7Bar
const PAYMENT_METHOD_MAP: Record<string, { method: string; tPag: string }> = {
  CREDIT: { method: 'credit', tPag: '03' },
  DEBIT: { method: 'debit', tPag: '04' },
  MEAL_VOUCHER: { method: 'voucher', tPag: '05' },
  FOOD_VOUCHER: { method: 'voucher', tPag: '05' },
  DIGITAL_WALLET: { method: 'pix', tPag: '17' },
  PIX: { method: 'pix', tPag: '17' },
  CASH: { method: 'cash', tPag: '01' },
  ONLINE: { method: 'online', tPag: '99' },
};

@Injectable()
export class IfoodService {
  private readonly logger = new Logger(IfoodService.name);
  private readonly IFOOD_API_URL = 'https://merchant-api.ifood.com.br';

  async authenticate(clientId: string, clientSecret: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.IFOOD_API_URL}/authentication/v1.0/oauth/token`,
        `grantType=client_credentials&clientId=${clientId}&clientSecret=${clientSecret}`,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
      return response.data.accessToken;
    } catch (error: any) {
      this.logger.error(`Falha ao autenticar iFood: ${error.message}`);
      return null;
    }
  }

  async fetchEvents(token: string): Promise<any[]> {
    try {
      const response = await axios.get(`${this.IFOOD_API_URL}/order/v1.0/events:polling`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data || [];
    } catch (error: any) {
      if (error.response && [204, 404].includes(error.response.status)) {
        return [];
      }
      this.logger.error(`Falha ao buscar eventos: ${error.message}`);
      return [];
    }
  }

  async getOrderDetails(token: string, orderId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.IFOOD_API_URL}/order/v1.0/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`Falha ao buscar detalhes do pedido ${orderId}: ${error.message}`);
      throw error;
    }
  }

  async acknowledgeEvents(token: string, eventIds: string[]): Promise<boolean> {
    try {
      await axios.post(
        `${this.IFOOD_API_URL}/order/v1.0/events/acknowledgment`,
        eventIds.map((id) => ({ id })),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return true;
    } catch (error: any) {
      this.logger.error(`Falha ao confirmar eventos: ${error.message}`);
      return false;
    }
  }

  /**
   * Garante que existe um produto "sentinela" no banco do tenant para vincular
   * itens externos do iFood (já que productId é obrigatório no schema).
   */
  private async ensureIfoodSentinelProduct(tenantPrisma: PrismaClient): Promise<string> {
    // Busca pelo barcode sentinela
    const existing = await tenantPrisma.product.findFirst({
      where: { barcode: IFOOD_PRODUCT_ID_SENTINEL },
    });
    if (existing) return existing.id;

    // Busca qualquer categoria existente para vincular o produto sentinela
    const anyCategory = await tenantPrisma.category.findFirst();
    if (!anyCategory) {
      throw new Error('Nenhuma categoria encontrada no banco do tenant para criar produto sentinela do iFood.');
    }

    const created = await tenantPrisma.product.create({
      data: {
        name: 'Produto Externo (iFood)',
        barcode: IFOOD_PRODUCT_ID_SENTINEL,
        categoryId: anyCategory.id,
        priceSell: 0,
        priceCost: 0,
        active: false, // Não aparece no cardápio do PDV
      },
    });

    return created.id;
  }

  async saveOrderToTenant(tenantPrisma: PrismaClient, order: any, tenantId: string) {
    // 1. Mapear itens para poder calcular total por eles se necessario
    const rawItems = order.items ?? [];
    const itemsSum = rawItems.reduce((acc: number, item: any) => acc + Number(item.totalPrice ?? item.unitPrice ?? 0), 0);

    // 2. Total correto: iFood retorna totalPrice no nível raiz do pedido
    // Fallback cascata: totalPrice > total > subTotal > soma pagamentos > soma itens
    const paymentMethods = order.payments?.methods ?? [];
    const paymentSum = paymentMethods.reduce((acc: number, p: any) => acc + Number(p.value ?? 0), 0);
    const rawTotal = order.totalPrice ?? order.total ?? order.subTotal ?? (paymentSum > 0 ? paymentSum : null) ?? itemsSum;
    const totalAmount = isNaN(Number(rawTotal)) ? itemsSum : Number(rawTotal);
    const subtotalAmount = isNaN(Number(order.subTotal)) ? totalAmount : Number(order.subTotal);
    const discountAmount = Number(order.benefits?.reduce((acc: number, b: any) => acc + Number(b.value ?? 0), 0) ?? 0);

    // 2. Buscar/criar produto sentinela para itens do iFood
    const sentinelProductId = await this.ensureIfoodSentinelProduct(tenantPrisma);

    // 3. Mapear itens do pedido
    const items = await Promise.all((rawItems).map(async (item: any) => {
      // Se o item tiver externalCode, tentar usar o produto local diretamente
      let productId = sentinelProductId;
      let productName = item.name ?? 'Item iFood';

      if (item.externalCode) {
        try {
          const localProduct = await tenantPrisma.product.findUnique({
            where: { id: item.externalCode },
          });
          if (localProduct) {
            productId = localProduct.id;
            productName = localProduct.name; // Usa o nome local
          }
        } catch {
          // Se não achar, usa o sentinela
        }
      }

      return {
        productId,
        productName,
        unit: 'UN',
        quantity: Number(item.quantity ?? 1),
        priceUnit: Number(item.unitPrice ?? 0),
        discount: 0,
        subtotal: Number(item.totalPrice ?? item.unitPrice ?? 0),
      };
    }));

    // 4. Mapear formas de pagamento (paymentMethods já declarado no início da função)
    const payments = paymentMethods.map((p: any) => {
      const mapped = PAYMENT_METHOD_MAP[p.method?.toUpperCase() ?? '']
        ?? PAYMENT_METHOD_MAP[p.type?.toUpperCase() ?? '']
        ?? { method: 'online', tPag: '99' };
      return {
        method: mapped.method,
        tPag: mapped.tPag,
        value: Number(p.value ?? 0),
      };
    });

    // Se não veio nenhum pagamento detalhado, criar um genérico online
    if (payments.length === 0) {
      payments.push({ method: 'online', tPag: '99', value: totalAmount });
    }

    // 5. Salvar tudo em uma única transação
    await tenantPrisma.sale.create({
      data: {
        total: totalAmount,
        subtotal: subtotalAmount,
        discount: discountAmount,
        status: 'completed',
        source: 'ifood',
        items: {
          create: items,
        },
        payments: {
          create: payments,
        },
      },
    });

    this.logger.log(`Pedido iFood salvo — Total: R$${totalAmount.toFixed(2)}, ${items.length} itens, ${payments.length} pagamentos.`);
  }
}
