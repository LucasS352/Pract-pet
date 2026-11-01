import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HeartPrismaService } from '../prisma/heart-prisma/heart-prisma.service';
import { TenantConnectionManager } from '../prisma/tenant-connection-manager/tenant-connection-manager.service';
import { IfoodService } from '../ifood/ifood.service';

@Injectable()
export class PollingService {
  private readonly logger = new Logger(PollingService.name);
  private isPolling = false;

  constructor(
    private readonly heartPrisma: HeartPrismaService,
    private readonly tenantManager: TenantConnectionManager,
    private readonly ifoodService: IfoodService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleIfoodPolling() {
    if (this.isPolling) {
      this.logger.debug('Polling já em andamento, ignorando ciclo...');
      return;
    }
    this.isPolling = true;

    try {
      // 1. Busca todas as integrações ativas do iFood
      const allIntegrations = await this.heartPrisma.tenantIntegration.findMany({
        where: {
          provider: 'ifood',
        },
        include: {
          tenant: true,
        },
      });

      const integrations = allIntegrations.filter((i: any) => {
        const settings = i.settings as any;
        return settings && settings.active === true;
      });

      if (integrations.length === 0) {
        this.logger.debug('Nenhuma integração iFood ativa no momento.');
        return;
      }

      this.logger.log(`Iniciando polling para ${integrations.length} tenants...`);

      // 2. Para cada tenant, processa os eventos do iFood
      for (const integration of integrations) {
        try {
          await this.processTenant(integration);
        } catch (error: any) {
          this.logger.error(`Erro ao processar tenant ${(integration as any).tenant?.name || integration.tenantId}: ${error.message}`);
        }
      }

    } catch (error: any) {
      this.logger.error(`Erro no ciclo de polling: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  private async processTenant(integration: any) {
    const creds = integration.credentials as any;
    if (!creds || !creds.clientId || !creds.clientSecret || !creds.merchantId) {
      this.logger.warn(`Tenant ${integration.tenant.name} sem credenciais válidas. Ignorando.`);
      return;
    }

    // A. Autenticação com iFood (obtém Token)
    const token = await this.ifoodService.authenticate(creds.clientId, creds.clientSecret);
    if (!token) return;

    // B. Buscar eventos de polling
    const events = await this.ifoodService.fetchEvents(token);
    if (!events || events.length === 0) {
      return; // Sem eventos novos
    }

    this.logger.log(`[${integration.tenant.name}] Encontrados ${events.length} eventos no iFood.`);

    // C. Conectar no banco do tenant para gravar os pedidos
    const tenantDbUrl = integration.tenant.databaseUrl;
    const tenantPrisma = await this.tenantManager.getTenantClient(integration.tenantId, tenantDbUrl);

    const eventIdsToAck: string[] = [];

    // D. Processar cada evento
    for (const event of events) {
      try {
        if (event.code === 'PLC') { // Placed (Pedido Criado)
          this.logger.log(`[${integration.tenant.name}] Novo pedido: ${event.orderId}`);
          
          // Buscar detalhes do pedido no iFood
          const orderDetails = await this.ifoodService.getOrderDetails(token, event.orderId);
          
          // Converter e salvar no banco do tenant
          await this.ifoodService.saveOrderToTenant(tenantPrisma, orderDetails, integration.tenantId);
          this.logger.log(`[${integration.tenant.name}] Pedido ${event.orderId} salvo com sucesso no banco.`);
        }
        
        // Adicionar à lista de acknowledge, independente do código (PLC, CON, etc) para limpar a fila
        eventIdsToAck.push(event.id);
      } catch (e: any) {
        this.logger.error(`[${integration.tenant.name}] Erro ao processar evento ${event.id}: ${e.message}`);
      }
    }

    // E. Reconhecer os eventos no iFood para não voltarem no próximo ciclo
    if (eventIdsToAck.length > 0) {
      await this.ifoodService.acknowledgeEvents(token, eventIdsToAck);
      this.logger.log(`[${integration.tenant.name}] ${eventIdsToAck.length} eventos reconhecidos no iFood.`);
    }
  }
}
