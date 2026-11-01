import { Injectable, NotFoundException } from '@nestjs/common';
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-prisma.service';
import { IfoodService } from './ifood/ifood.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly heartPrisma: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
    private readonly ifoodService: IfoodService,
  ) {}

  async upsertIntegration(tenantId: string, provider: string, credentials: any, settings: any) {
    return this.heartPrisma.tenantIntegration.upsert({
      where: {
        tenantId_provider: {
          tenantId,
          provider
        }
      },
      update: {
        credentials,
        settings,
        status: 'active'
      },
      create: {
        tenantId,
        provider,
        credentials,
        settings,
        status: 'active'
      }
    });
  }

  async syncIfoodCatalog(tenantId: string) {
    // 1. Buscar credenciais do iFood e databaseUrl do tenant
    const [integration, tenant] = await Promise.all([
      this.heartPrisma.tenantIntegration.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'ifood' } },
      }),
      this.heartPrisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);

    if (!integration) {
      throw new NotFoundException('Integração iFood não configurada para este tenant.');
    }
    if (!tenant?.databaseUrl) {
      throw new NotFoundException('Tenant não encontrado ou sem banco de dados configurado.');
    }

    const creds = integration.credentials as any;
    if (!creds?.clientId || !creds?.clientSecret || !creds?.merchantId) {
      throw new NotFoundException('Credenciais iFood incompletas. Configure Client ID, Client Secret e Merchant ID.');
    }

    // 2. Autenticar no iFood
    const token = await this.ifoodService.authenticate(creds.clientId, creds.clientSecret);
    if (!token) {
      throw new Error('Falha ao autenticar no iFood. Verifique as credenciais.');
    }

    // 3. Buscar produtos ativos do tenant via TenantConnectionManager
    const prisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
    const products = await prisma.product.findMany({
      where: { active: true },
      include: { category: true },
    });

    // Filtrar produtos que têm preço de venda > 0 (obrigatório pelo iFood) e respeitar o filtro de categorias
    const eligibleProducts = products
      .filter((p: any) => {
        if (Number(p.priceSell) <= 0) return false;
        
        // Se houver configuração de categorias permitidas, filtrar.
        const allowedCategories = creds?.allowedCategories;
        if (Array.isArray(allowedCategories)) {
          // Se o array existir, só envia se a categoria do produto estiver dentro dele
          // Obs: Se o array estiver vazio, NENHUM produto será enviado (comportamento desejado e aprovado)
          if (!p.categoryId || !allowedCategories.includes(p.categoryId)) {
            return false;
          }
        }
        
        return true;
      })
      .map((p: any) => {
        let basePrice = Number(p.priceSell);
        const markup = Number(creds?.priceMarkup);
        if (!isNaN(markup) && markup > 0) {
          basePrice = basePrice * (1 + markup / 100);
        }
        
        return {
          id: p.id,
          name: p.name,
          priceSell: Number(basePrice.toFixed(4)),
          stock: Math.floor(Number(p.stock) || 0),
          description: undefined,
          categoryName: p.category?.name,
          imageUrl: p.imageUrl,
        };
      });

    if (eligibleProducts.length === 0) {
      return {
        message: 'Nenhum produto elegível encontrado. Verifique se os produtos têm preço de venda definido.',
        synced: 0,
        errors: 0,
        skipped: products.length
      };
    }

    // 4. Sincronizar com iFood
    const result = await this.ifoodService.syncCatalog(token, creds.merchantId, eligibleProducts);

    // 5. Sincronizar Estoque se habilitado
    if (creds?.syncStock) {
      const inventoryUpdates = eligibleProducts.map(p => ({
        externalCode: p.id,
        stock: p.stock
      }));
      await this.ifoodService.updateInventory(token, creds.merchantId, inventoryUpdates);
    }

    return {
      message: `Sincronização concluída: ${result.synced} produto(s) enviado(s), ${result.errors} erro(s), ${result.skipped} ignorado(s) (sem preço).`,
      total: products.length,
      ...result,
    };
  }

  async syncProductStock(tenantId: string, productIds: string[], throwOnError = false) {
    if (!productIds.length) return;
    try {
      const integration = await this.heartPrisma.tenantIntegration.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'ifood' } },
      });
      if (!integration) return;
      
      const creds = integration.credentials as any;
      if (!creds?.syncStock || !creds?.clientId || !creds?.clientSecret || !creds?.merchantId) return;

      const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant?.databaseUrl) return;

      const prisma = await this.tenantManager.getTenantClient(tenantId, tenant.databaseUrl);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, active: true }
      });
      if (!products.length) return;

      const token = await this.ifoodService.authenticate(creds.clientId, creds.clientSecret, throwOnError ? 10_000 : 0);
      if (!token) {
        if (throwOnError) throw new Error('Autenticação iFood indisponível');
        return;
      }

      const inventoryUpdates = products.map((p: any) => ({
        externalCode: p.id,
        stock: p.stock
      }));

      await this.ifoodService.updateInventory(token, creds.merchantId, inventoryUpdates, throwOnError);
    } catch (e: any) {
      console.error(`Erro ao sincronizar estoque em tempo real (iFood): ${e.message}`);
      if (throwOnError) throw e;
    }
  }
}
